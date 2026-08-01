# SpentX Web — Admin Delete-User Session/Data Integrity Audit

Scope: web app only, plus a read-only mobile check for asymmetry documentation. All Supabase Auth behavioral claims below were verified against Supabase's actual current docs (JWT/session lifecycle page, RLS page, `deleteUser` API reference), not assumed.

Verified Supabase facts used throughout: access tokens are self-contained JWTs valid until their `exp` claim regardless of whether the underlying `auth.users` row still exists; `auth.uid()` in RLS reads the `sub` claim straight from the validated JWT with no live `auth.users` lookup; PostgREST validates JWT signature/expiry only. This means a still-valid, unexpired JWT for a deleted user continues to be treated as "authenticated" by Postgres — the user's own data disappears (cascade deleted), but the token itself isn't rejected for the person being gone.

---

## Leads with: findings where a deleted user retains functional access

### 1. No session-termination detection while a tab stays open
**Status: CONFIRMED GAP**

`src/providers/supabase-provider.tsx:220-233`:
```ts
void supabase.auth.getUser().then(({ data }) => applySupabaseUser(data.user ?? null)).catch(() => setIsLoading(false));

const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  if (event === "TOKEN_REFRESHED") return;
  void applySupabaseUser(session?.user ?? null, { forceWorkspace: event === "SIGNED_IN" });
});
```
`getUser()` — the one call that actually revalidates against the Auth server — runs exactly once, on mount. Every subsequent event, including `TOKEN_REFRESHED`, is handled from the locally cached session with no server round-trip that would surface a deletion. `src/components/shared/AppShell.tsx` has no polling, no `visibilitychange`/focus listener, no interval that would re-check. The only periodic network call is `fetchAppConfig` (`AppShell.tsx:135-141`, every 5 minutes) which queries `global_settings`, unrelated to auth validity. `src/app/(app)/layout.tsx` and `src/app/admin/layout.tsx` do call `getUser()` server-side, but only on a fresh server-rendered navigation or full reload — not during client-side soft navigation inside an already-open session. Ordinary data calls also don't help: they go through `src/app/api/proxy/[...path]/route.ts`, which forwards the caller's JWT to PostgREST — PostgREST checks signature/expiry only, never `auth.users` existence.

**Real-world impact:** A deleted user who already has the SpentX tab open keeps a fully rendered, interactive UI for as long as their access token stays unexpired — check your project's JWT expiry in Auth settings (Supabase's default is 1 hour, but this project's may differ). Their own reads return empty (cascade already removed the rows), so the app looks broken/empty, but nothing signs them out, redirects them, or shows an error. If the refresh token backing that session is still usable (see finding below), a background token refresh could silently mint a new valid JWT for the same deleted user id and extend this indefinitely, since nothing here calls `getUser()` again after first mount.

**Fix:** Add a periodic `getUser()` revalidation loop to `SupabaseProvider`, force sign-out on failure:
```ts
useEffect(() => {
  if (!supabaseUser) return;
  const interval = setInterval(async () => {
    const { data, error } = await createClient().auth.getUser();
    if (error || !data.user) {
      await createClient().auth.signOut();
    }
  }, 5 * 60 * 1000); // every 5 minutes
  return () => clearInterval(interval);
}, [supabaseUser]);
```
Add a matching `visibilitychange` listener so a backgrounded tab re-validates immediately on refocus, not just on the next 5-minute tick.

### 2. Refresh-token/session-row deletion behavior is not confirmed — treat as unsafe
**Status: COULDN'T VERIFY (Supabase's own docs don't explicitly document this point) — treat conservatively**

Supabase's session-lifecycle docs describe explicit sign-out, password change, timeout/max-lifetime, and single-session displacement as termination triggers, but do not explicitly state whether `auth.admin.deleteUser()` cascades to delete the corresponding `auth.sessions` rows (which would make outstanding refresh tokens fail immediately) or leaves them orphaned (meaning a refresh could still succeed and mint a fresh, valid, unexpired access token for the now-deleted `sub` — which per finding 1's underlying facts would sail through PostgREST/RLS the same way).

**Real-world impact:** Worst case, if `auth.sessions` rows are not cascade-cleaned on delete, "wait for the JWT to expire" is not actually a safe fallback — a client that refreshes shortly before expiry could keep itself logged in past the original token's expiry window entirely, for as long as it keeps refreshing.

**Fix:** Don't rely on token expiry as the safety net at all — the fix in finding 1 (active `getUser()` revalidation) is what actually closes this regardless of how `auth.sessions` behaves under the hood, since it independently re-confirms the user still exists on a fixed cadence rather than trusting refresh success as a proxy for validity.

### 3. Mobile has zero session-revocation detection — confirmed asymmetry with web
**Status: CONFIRMED GAP (documented for awareness; mobile is out of scope for the fix)**

`Mobile app/SpentX/lib/core/services/auth_service.dart:45-49` — the only `onAuthStateChange` listener in the entire mobile app exists solely to redirect to the reset-password screen on `AuthChangeEvent.passwordRecovery`:
```dart
_client.auth.onAuthStateChange.listen((data) {
  if (data.event == AuthChangeEvent.passwordRecovery) {
    appRouter.go('/auth/reset-password');
  }
});
```
There is no equivalent revalidation, no periodic check, nothing that reacts to a deleted account. `sync_service.dart`'s error handling is a wall of blanket `catch (_) {}` (20+ sites) — any 401/403 a deleted user's requests would start receiving is silently swallowed, indistinguishable from a transient network blip.

**Real-world impact:** A deleted user's mobile app keeps working indefinitely against local Hive data, completely untouched by the server-side delete. Background sync fails silently on every attempt with no user-visible signal — no error toast, no "account no longer exists" banner, nothing. The user could keep adding transactions, viewing their (now-stale, never-again-syncing) balances, and using the app as if nothing happened, potentially for as long as the app is installed.

**Fix (mobile, for awareness — not implemented here since mobile is out of scope):** Mirror the web fix — a periodic `getUser()`-equivalent revalidation (`supabase_flutter`'s `client.auth.getUser()`) on an interval or app-resume, forcing local sign-out and a clear "Your account is no longer available" screen on failure, and surfacing sync 401/403s to the user instead of swallowing them.

---

## Impersonation gap

### 4. Impersonation session isn't invalidated when its target is deleted mid-session
**Status: CONFIRMED GAP**

`supabase/migrations/20260729_admin_delete_user_fk_fix.sql:39-45` changes `admin_impersonation_sessions.target_user_id` to nullable with `ON DELETE SET NULL`:
```sql
alter table public.admin_impersonation_sessions alter column target_user_id drop not null;
...
add constraint admin_impersonation_sessions_target_user_id_fkey
  foreign key (target_user_id) references auth.users(id) on delete set null;
```
`src/lib/server/impersonation.ts`, `validateImpersonationSession`, checks `admin_id`, `ended_at IS NULL`, and inactivity window — but never checks `target_user_id IS NOT NULL`:
```ts
if (
  data &&
  data.admin_id === adminId &&
  data.ended_at === null &&
  now - new Date(data.last_active_at as string).getTime() < INACTIVITY_LIMIT_MS
) {
  session = { id: data.id, adminId: data.admin_id, targetUserId: data.target_user_id as string };
}
```
`data.target_user_id` is cast `as string` but can genuinely be `null` at runtime after the FK fires. That flows into the proxy (`src/app/api/proxy/[...path]/route.ts`), which forces the owner filter to `eq.${session.targetUserId}` using the **service-role key** (bypasses RLS entirely). In practice this most likely produces loud failures (a literal string `"null"` against a `uuid` column, or a not-null constraint violation on write) rather than a silent broad-access escalation — but that's incidental to PostgREST's type coercion, not a designed safeguard. Starting a **new** impersonation session against an already-deleted user is correctly blocked (`admin_start_impersonation` SQL explicitly checks the target exists and raises `'target user not found'`) — the gap is specifically the mid-session race: an active impersonation session whose target gets deleted while the session is still within its inactivity window.

**Real-world impact:** Undefined, untested behavior for a real race condition (target deleted mid-impersonation) using the service-role key. Likely manifests as broken/erroring impersonated requests rather than a clean privilege escalation, but nothing here explicitly guards against or terminates the session the moment its target vanishes.

**Fix:** In `validateImpersonationSession`, explicitly check `target_user_id !== null` and route a null target into the same "end this session server-side" branch already used for expired/stale sessions:
```ts
if (
  data &&
  data.admin_id === adminId &&
  data.ended_at === null &&
  data.target_user_id !== null &&
  now - new Date(data.last_active_at as string).getTime() < INACTIVITY_LIMIT_MS
) {
  session = { id: data.id, adminId: data.admin_id, targetUserId: data.target_user_id };
} else if (data && data.admin_id === adminId && data.ended_at === null) {
  // existing stale-session cleanup path — now also fires when the target was deleted.
  await endImpersonationSession(data.id);
}
```

---

## Re-signup with same email

### 5. Re-signup is clean — no data leakage, one doc correction
**Status: CONFIRMED WORKING**

`src/app/api/admin/users/[id]/route.ts:85` — `admin.auth.admin.deleteUser(targetUserId)` passes no second argument, so `shouldSoftDelete` defaults to `false`: a genuine hard delete, per Supabase's `deleteUser` API reference. A hard-deleted row frees the email immediately for reuse; there's no tombstone blocking re-registration.

Every core user-owned table (`accounts`, `purposes`, `categories`, `transactions`, `outings`, `friends`, `contributors`, etc.) cascades from `auth.users(id) on delete cascade`. A fresh signup always gets a brand-new `gen_random_uuid()` — Postgres never reuses a deleted primary key — so `handle_new_user()` creates a fully isolated new `public.users` row with no path for old FK-linked data to attach.

**Correction to the brief's assumption:** `share_links` and `purpose_shares` are **not** orphaned/live-after-delete — both use `owner_id uuid not null references auth.users(id) on delete cascade` (`init.sql:385-402`). Deleting the owner cascades away their share links too; an old link resolves to nothing afterward, not a lingering live view into deleted data.

`user_api_logs.user_id` is confirmed a bare column with **no FK at all**, by explicit design (comment: "log rows must outlive accounts, same reasoning as `admin_action_logs`"). Old rows persist forever with the old, never-reused UUID — safe by construction, since a new signup gets a different id and can never have these attributed to them. Purely an admin-visible audit trail artifact, not a security issue.

`outings.members`/`participants` on **other users'** outings are genuinely not cleaned up — these are schema-less jsonb/array snapshots with no FK enforcement, so a friend's own trip history keeps displaying the deleted person's name/id after deletion. Cosmetic (display-only, no live join, no functional access), but real and worth knowing about.

**Real-world impact:** Signing up fresh with a deleted user's former email is safe — no cross-contamination, no resurrected balances or transactions, no way for the new account to see the old one's data. The only visible artifacts are historical: admins can still see old API log rows under the stale UUID, and other users' past outings still show the deleted person's name in their member list.

**Fix (optional, cosmetic only, not a security fix):** If desired, scrub the deleted user's id out of other users' `outings.participants`/`members` jsonb in the delete route, replacing with a "removed user" placeholder. Not required for correctness or security.

---

## Admin UI post-delete

### 6. Both direct-navigation edge cases already fail cleanly; list refresh works but isn't explicit
**Status: PARTIALLY WORKING**

`src/components/admin/AdminUserDetailPage.tsx:80-94` — navigating directly to `/admin/users/[id]` for a deleted id is explicitly handled: `error || !data?.profile` renders a clean "User not found" fallback. No unhandled exception.

`src/app/admin/users/[id]/impersonate/*` → `ImpersonationShell.tsx:55-79` calls `adminStartImpersonation(targetUserId)`, which maps to SQL that explicitly checks `if not exists (select 1 from public.users where id = p_target_user_id) then raise exception 'target user not found';` — caught by a try/catch, rendered as a clean error screen with a "Back to user detail" button. **No service-role-backed session gets minted for a nonexistent target.** This path is safe.

Gap: `AdminUserDetailPage.tsx`'s `handleDeleteUser` (lines 49-65) doesn't explicitly call `queryClient.invalidateQueries` on the admin-users list/count keys after a successful delete — it relies on React Query's default `staleTime: 0` refetch-on-mount behavior when `router.replace("/admin/users")` runs. This currently works, but implicitly — a future change to that query's `staleTime` elsewhere in the app could silently reintroduce a stale list with no one noticing the dependency was ever there.

**Real-world impact:** Nothing user-facing is currently broken here. This is a fragility finding, not an active bug.

**Fix:** In `AdminUserDetailPage.tsx`, add explicit invalidation right before the `router.replace` call:
```ts
await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
await queryClient.invalidateQueries({ queryKey: ["admin-users-count"] });
```

---

## Admin-do-everything scoping (confirmed solid)

### 7. Delete endpoint authorization — CONFIRMED WORKING
`src/app/api/admin/users/[id]/route.ts:23-47`. Admin check is server-side against a real `role` column read from the database (`callerProfile?.role !== "admin"` → 403), not a client-controlled flag — a non-admin hitting the endpoint directly, bypassing the UI entirely, gets rejected before the service-role client is even constructed. Self-delete is blocked by comparing `targetUserId === user.id` (the caller's own session-derived id, not anything client-supplied) → 400. Both checks happen before line 49's `createAdminClient()` call, so the service-role key is never touched on an unauthorized or self-delete request.

### 8. Audit log ordering — CONFIRMED SAFE, not atomic but fails safely
The before-image log write (lines 52-74) happens before the delete call (line 85), and explicitly aborts the whole operation if the log write fails (line 76-81: "Refusing to delete without an audit log entry"). Not wrapped in a single Postgres transaction (two separate service-role calls), so a crash between the log insert succeeding and the delete call executing could theoretically leave a log row with no corresponding delete — but that failure mode is an extra, harmless log entry, never a silent unlogged deletion. The ordering guarantees the audit trail can't be bypassed by a delete that succeeds while the log fails.

**Fix (optional hardening, not required):** Wrap both operations in a single `plpgsql` function callable via `service_role` RPC so the log-write and the `auth.admin.deleteUser()` call... note `auth.admin.deleteUser()` is a GoTrue Admin API call, not a SQL statement, so it cannot literally participate in a Postgres transaction with the log insert. The current design (log first, abort on log failure, proceed to delete only after a durable log row exists) is actually the correct pattern given that constraint — no better atomicity is achievable without moving user deletion into a custom auth flow, which isn't warranted here.

---

## Plain-English summary

If you delete a user from the admin panel right now: their account and all their owned data (transactions, accounts, outings, friends, everything with a foreign key to their user id) disappears immediately and cleanly from the database — that part works correctly and can't be undone by a fresh signup at the same email, which starts completely clean.

But if that user already has the web app open in a browser tab at the moment you delete them, they keep a fully working, interactive session for as long as their login token stays valid — nothing in the app currently checks "does this person still exist" while a tab is open, it only checks once when the page first loads. Their own data will look empty (since it's really gone), but they won't be signed out, redirected, or shown any message telling them their account was deleted. The same is true, indefinitely, on the mobile app — mobile has no equivalent check at all, so a deleted user's phone keeps working against its local offline copy of their old data forever, with background sync failing silently in a way they'd never see. On top of that, if an admin happens to be actively impersonating a user at the exact moment someone deletes that user, the impersonation session isn't automatically shut down — it's a narrow, accidental case that would likely just throw errors rather than grant broader access, but it's not explicitly guarded against today. The delete action itself, who's allowed to trigger it, and the audit trail it leaves behind are all solid and correctly locked down — the gap is entirely on the "how fast does an already-open session actually die" side, not on whether the delete itself is safe or properly authorized.
