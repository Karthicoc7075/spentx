import type { SupabaseClient } from "@supabase/supabase-js";

export type BootstrapProfileHint = {
  name?: string;
  email?: string;
  photoURL?: string;
};

export type BootstrapClientContext = {
  userAgent?: string;
  platform?: string;
  recordLogin?: boolean;
};

type Row = Record<string, unknown>;

async function throwIfError<T>(
  promise: PromiseLike<{ data: T; error: { message: string } | null }>,
) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(date = todayDate()) {
  return date.slice(0, 7);
}

// Audit/activity logs are bookkeeping, not core workspace data — a schema
// drift here (missing column, a CHECK constraint that doesn't yet allow a
// given type) should never block the user from signing in and using the
// app, so failures are swallowed rather than thrown.
async function writeAuditLog(
  db: SupabaseClient,
  userId: string,
  tableName: string,
  recordId: string,
  after: Row,
) {
  try {
    await throwIfError(
      db.from("audit_logs").insert({
        user_id: userId,
        table_name: tableName,
        record_id: recordId,
        action: "create",
        after,
      }),
    );
  } catch (error) {
    console.warn(`bootstrapUserWorkspace: audit log write failed for ${tableName}`, error);
  }
}

async function writeActivityLog(
  db: SupabaseClient,
  userId: string,
  type: string,
  message: string,
  entityTable?: string,
  entityId?: string,
) {
  try {
    await throwIfError(
      db.from("activity_logs").insert({
        user_id: userId,
        type,
        message,
        entity_table: entityTable,
        entity_id: entityId,
      }),
    );
  } catch (error) {
    console.warn(`bootstrapUserWorkspace: activity log write failed for ${type}`, error);
  }
}

// Wraps auxiliary bookkeeping steps (account-purpose linking, net worth
// snapshots, device/login tracking) that aren't required for the user to
// actually use the app — if the underlying table/column doesn't exist yet
// (schema drift), log it but let sign-in proceed rather than blocking on it.
async function runOptionalStep(label: string, step: () => Promise<void>) {
  try {
    await step();
  } catch (error) {
    console.warn(`bootstrapUserWorkspace: skipped optional step "${label}"`, error);
  }
}

// Per browser-tab session: once a workspace is fully seeded, skip the whole
// multi-query bootstrap on later auth events / hard reloads (sessionStorage
// survives refresh; getUser + onAuthStateChange used to run it twice every load).
const sessionBootstrappedUsers = new Set<string>();
const sessionLoginRecorded = new Set<string>();
const sessionDeviceTouched = new Set<string>();

const BOOTSTRAP_READY_KEY = "spentx_bootstrap_ready";

function bootstrapReadyKey(userId: string) {
  return `${BOOTSTRAP_READY_KEY}:${userId}`;
}

function isBootstrapReady(userId: string) {
  if (sessionBootstrappedUsers.has(userId)) return true;
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(bootstrapReadyKey(userId)) === "1";
  } catch {
    return false;
  }
}

function markBootstrapReady(userId: string) {
  sessionBootstrappedUsers.add(userId);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(bootstrapReadyKey(userId), "1");
  } catch {
    // private mode / quota — in-memory flag still helps within the tab lifetime
  }
}

export function clearBootstrapSessionCache(userId?: string) {
  if (userId) {
    sessionBootstrappedUsers.delete(userId);
    sessionLoginRecorded.delete(userId);
    sessionDeviceTouched.delete(userId);
    try {
      sessionStorage?.removeItem(bootstrapReadyKey(userId));
    } catch {
      /* ignore */
    }
    return;
  }
  sessionBootstrappedUsers.clear();
  sessionLoginRecorded.clear();
  sessionDeviceTouched.clear();
  if (typeof sessionStorage === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(`${BOOTSTRAP_READY_KEY}:`)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Idempotent new-user workspace setup per signup spec.
 */
export async function bootstrapUserWorkspace(
  db: SupabaseClient,
  userId: string,
  profileHint?: BootstrapProfileHint,
  clientContext?: BootstrapClientContext,
) {
  if (isBootstrapReady(userId)) {
    return { userId, accountId: undefined as string | undefined, purposeId: undefined as string | undefined, createdUser: false };
  }

  const existingUser = await throwIfError(
    db.from("users").select("id, default_account_id, name, email, photo_url").eq("id", userId).maybeSingle(),
  );
  let createdUser = false;

  if (!existingUser) {
    createdUser = true;
    const userRow = {
      id: userId,
      name: profileHint?.name ?? "SpentX User",
      email: profileHint?.email ?? "",
      photo_url: profileHint?.photoURL ?? null,
      currency: "INR",
      timezone: "Asia/Kolkata",
      language: "en",
      theme: "system",
      notifications: true,
      monthly_safe_spending_alert: false,
      private_mode: false,
      show_bank_onboarding: true,
    };
    await throwIfError(db.from("users").insert(userRow));
    await writeAuditLog(db, userId, "users", userId, userRow);
    if (createdUser) {
      await writeActivityLog(db, userId, "user_registered", "User Registered", "users", userId);
    }
  } else if (profileHint?.name || profileHint?.email || profileHint?.photoURL) {
    // Only PATCH when a field actually changed — auth re-entry always passed
    // name/email and used to issue a 204 update on every page load.
    const patch: Record<string, string> = {};
    if (profileHint.name && profileHint.name !== existingUser.name) {
      patch.name = profileHint.name;
    }
    if (profileHint.email && profileHint.email !== existingUser.email) {
      patch.email = profileHint.email;
    }
    if (
      profileHint.photoURL &&
      profileHint.photoURL !== (existingUser.photo_url as string | null)
    ) {
      patch.photo_url = profileHint.photoURL;
    }
    if (Object.keys(patch).length > 0) {
      await throwIfError(db.from("users").update(patch).eq("id", userId));
    }
  }

  let purposeId: string | undefined;
  let createdPurpose = false;
  const purposes = await throwIfError(
    db
      .from("purposes")
      .select("id, name, is_default, is_active")
      .eq("user_id", userId)
      .order("is_default", { ascending: false }),
  );

  const personalPurpose = (purposes as Row[] | null)?.find(
    (row) =>
      row.is_default === true ||
      String(row.name ?? "")
        .trim()
        .toLowerCase() === "personal",
  );
  const familyPurpose = (purposes as Row[] | null)?.find((row) => {
    const name = String(row.name ?? "")
      .trim()
      .toLowerCase();
    return name === "family" || name === "home" || name === "home/family";
  });

  if (!personalPurpose) {
    createdPurpose = true;
    const purposeRow = {
      user_id: userId,
      name: "Personal",
      color: "#8b7ff0",
      is_default: true,
      can_delete: false,
      is_active: true,
    };
    const created = await throwIfError(
      db.from("purposes").insert(purposeRow).select("id").single(),
    );
    purposeId = created.id as string;
    await writeAuditLog(db, userId, "purposes", purposeId, {
      id: purposeId,
      ...purposeRow,
    });
  } else {
    purposeId = personalPurpose.id as string;
  }

  // Mobile parity: Family is a default toggleable purpose (can turn off via is_active).
  if (!familyPurpose) {
    const familyRow = {
      user_id: userId,
      name: "Family",
      color: "#14B8A6",
      is_default: false,
      can_delete: false,
      is_active: true,
    };
    const createdFamily = await throwIfError(
      db.from("purposes").insert(familyRow).select("id").single(),
    );
    await writeAuditLog(db, userId, "purposes", createdFamily.id as string, {
      id: createdFamily.id,
      ...familyRow,
    });
  } else if (
    String(familyPurpose.name ?? "")
      .trim()
      .toLowerCase() !== "family"
  ) {
    // Canonicalise legacy Home / Home-Family labels for mobile name sync.
    await throwIfError(
      db
        .from("purposes")
        .update({ name: "Family", can_delete: false, is_default: false })
        .eq("id", familyPurpose.id as string),
    );
  }

  let accountId: string | undefined;
  let createdCashAccount = false;
  const accounts = await throwIfError(
    db
      .from("accounts")
      .select("id, type")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_default", { ascending: false }),
  );

  const cashAccount = accounts?.find((row) => row.type === "cash");
  if (!cashAccount) {
    createdCashAccount = true;
    const accountRow = {
      user_id: userId,
      name: "Cash",
      type: "cash",
      opening_balance: 0,
      is_default: true,
      can_delete: false,
      is_active: true,
    };
    const created = await throwIfError(
      db.from("accounts").insert(accountRow).select("id").single(),
    );
    accountId = created.id as string;
    await writeAuditLog(db, userId, "accounts", accountId, {
      id: accountId,
      ...accountRow,
    });
  } else {
    accountId = cashAccount.id as string;
  }

  if (accountId && purposeId) {
    await runOptionalStep("link account to purpose", async () => {
      const links = await throwIfError(
        db
          .from("account_purposes")
          .select("id")
          .eq("account_id", accountId)
          .eq("purpose_id", purposeId)
          .limit(1),
      );
      if (!links?.length) {
        const linkRow = {
          user_id: userId,
          account_id: accountId,
          purpose_id: purposeId,
        };
        const link = await throwIfError(
          db.from("account_purposes").insert(linkRow).select("id").single(),
        );
        await writeAuditLog(db, userId, "account_purposes", link.id as string, {
          id: link.id,
          ...linkRow,
        });
        await throwIfError(
          db
            .from("accounts")
            .update({ purpose_ids: [purposeId] })
            .eq("id", accountId),
        );
      }
    });
  }

  const userRow = await throwIfError(
    db.from("users").select("default_account_id").eq("id", userId).maybeSingle(),
  );
  if (accountId && !userRow?.default_account_id) {
    await throwIfError(
      db.from("users").update({ default_account_id: accountId }).eq("id", userId),
    );
  }

  const contributors = await throwIfError(
    db
      .from("contributors")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1),
  );

  if (!contributors?.length) {
    const contributorRow = {
      user_id: userId,
      name: "Me",
      is_default: true,
      can_delete: false,
      is_active: true,
    };
    const created = await throwIfError(
      db.from("contributors").insert(contributorRow).select("id").single(),
    );
    const contributorId = created.id as string;
    await writeAuditLog(db, userId, "contributors", contributorId, {
      id: contributorId,
      ...contributorRow,
    });
  }

  const templates = await throwIfError(
    db.from("budget_templates").select("id").eq("user_id", userId).limit(1),
  );

  let createdBudgetTemplate = false;
  let templateId: string | undefined;
  if (!templates?.length) {
    createdBudgetTemplate = true;
    const templateRow = {
      user_id: userId,
      template_name: "Default Budget",
      expected_income: 0,
      allocations: [],
      is_default: true,
    };
    const created = await throwIfError(
      db.from("budget_templates").insert(templateRow).select("id").single(),
    );
    templateId = created.id as string;
    await writeAuditLog(db, userId, "budget_templates", templateId, {
      id: templateId,
      ...templateRow,
    });
  }

  if (createdPurpose) {
    await writeActivityLog(
      db,
      userId,
      "purpose_created",
      "Created Personal Purpose",
      "purposes",
      purposeId,
    );
  }
  if (createdCashAccount) {
    await writeActivityLog(
      db,
      userId,
      "account_created",
      "Created Cash Account",
      "accounts",
      accountId,
    );
  }
  if (createdBudgetTemplate) {
    await writeActivityLog(
      db,
      userId,
      "budget_template_created",
      "Created Default Budget",
      "budget_templates",
      templateId,
    );
  }

  const snapshotDate = todayDate();
  const balanceSnapshots = await throwIfError(
    db
      .from("account_balance_history")
      .select("id")
      .eq("user_id", userId)
      .eq("account_id", accountId!)
      .eq("snapshot_date", snapshotDate)
      .limit(1),
  );

  if (accountId && !balanceSnapshots?.length) {
    const snapshotRow = {
      account_id: accountId,
      user_id: userId,
      balance: 0,
      snapshot_date: snapshotDate,
      month_key: monthKey(snapshotDate),
    };
    const created = await throwIfError(
      db
        .from("account_balance_history")
        .insert(snapshotRow)
        .select("id")
        .single(),
    );
    await writeAuditLog(db, userId, "account_balance_history", created.id as string, {
      id: created.id,
      ...snapshotRow,
    });
  }

  await runOptionalStep("record net worth snapshot", async () => {
    const netWorthSnapshots = await throwIfError(
      db
        .from("net_worth_history")
        .select("id")
        .eq("user_id", userId)
        .eq("snapshot_date", snapshotDate)
        .limit(1),
    );

    if (!netWorthSnapshots?.length) {
      const netWorthRow = {
        user_id: userId,
        snapshot_date: snapshotDate,
        cash_balance: 0,
        bank_balance: 0,
        investment_value: 0,
        net_worth: 0,
      };
      const created = await throwIfError(
        db.from("net_worth_history").insert(netWorthRow).select("id").single(),
      );
      await writeAuditLog(db, userId, "net_worth_history", created.id as string, {
        id: created.id,
        ...netWorthRow,
      });
    }
  });

  if (
    (clientContext?.userAgent || clientContext?.platform) &&
    !sessionDeviceTouched.has(userId)
  ) {
    await runOptionalStep("track device", async () => {
      const devices = await throwIfError(
        db
          .from("user_devices")
          .select("id")
          .eq("user_id", userId)
          .eq("user_agent", clientContext.userAgent ?? "")
          .limit(1),
      );

      if (!devices?.length) {
        const deviceRow = {
          user_id: userId,
          device_label: clientContext.platform ?? "Browser",
          user_agent: clientContext.userAgent ?? null,
          platform: clientContext.platform ?? null,
          last_seen_at: new Date().toISOString(),
        };
        const created = await throwIfError(
          db.from("user_devices").insert(deviceRow).select("id").single(),
        );
        await writeAuditLog(db, userId, "user_devices", created.id as string, {
          id: created.id,
          ...deviceRow,
        });
      } else {
        await throwIfError(
          db
            .from("user_devices")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", devices[0].id),
        );
      }
      sessionDeviceTouched.add(userId);
    });
  }

  if (clientContext?.recordLogin && !sessionLoginRecorded.has(userId)) {
    await runOptionalStep("record login history", async () => {
      // First-login seed only (existing product behavior). Session flag
      // avoids re-selecting this on every auth event in the same tab.
      const logins = await throwIfError(
        db.from("login_history").select("id").eq("user_id", userId).limit(1),
      );
      if (!logins?.length) {
        const loginRow = {
          user_id: userId,
          logged_in_at: new Date().toISOString(),
          user_agent: clientContext.userAgent ?? null,
          platform: clientContext.platform ?? null,
        };
        const created = await throwIfError(
          db.from("login_history").insert(loginRow).select("id").single(),
        );
        await writeAuditLog(db, userId, "login_history", created.id as string, {
          id: created.id,
          ...loginRow,
        });
      }
      sessionLoginRecorded.add(userId);
    });
  }

  markBootstrapReady(userId);
  return { userId, accountId, purposeId, createdUser };
}

export function readBootstrapClientContext(
  options?: { recordLogin?: boolean },
): BootstrapClientContext | undefined {
  if (typeof navigator === "undefined") return options;

  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    recordLogin: options?.recordLogin ?? true,
  };
}