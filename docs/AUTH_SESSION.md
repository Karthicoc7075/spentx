# Auth session persistence (web + mobile)

Goal: **stay signed in until the user taps Logout** (practically 1 year+).

## What the apps do

| Client | Persistence |
|--------|-------------|
| **Web** | Supabase session cookies with `maxAge = 365 days`; `autoRefreshToken: true` |
| **Mobile** | Supabase Flutter stores session on device; `autoRefreshToken: true` |

Access tokens still refresh automatically in the background. Only **Logout** clears local session.

## Supabase project settings (required for long refresh tokens)

In **Supabase Dashboard → Authentication → Settings** (or Auth → JWT):

1. **JWT expiry** — access token lifetime (e.g. `3600` seconds). Short is fine; clients refresh it.
2. **Refresh token reuse / rotation** — keep rotation enabled for security.
3. **Refresh token lifetime** — set as long as you want sessions to last without re-login, e.g. **8760 hours (1 year)** or the maximum your plan allows.

Without a long refresh-token lifetime on the project, clients will be forced to log in again when the server invalidates the refresh token — independent of cookie `maxAge`.

## Logout

- Web: sign-out clears cookies / storage.
- Mobile: `AuthService.signOut()` clears the Supabase session.

PIN on mobile is a **local lock** only; it does not clear the Supabase session.