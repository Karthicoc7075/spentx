import { initializeApp, getApps } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  addDoc as firestoreAddDoc,
  collection,
  deleteDoc,
  doc,
  FirestoreDataConverter,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  persistentLocalCache,
  query,
  serverTimestamp,
  setDoc as firestoreSetDoc,
  startAfter,
  updateDoc as firestoreUpdateDoc,
  where,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import {
  getStorage,
  ref as storageRef,
  uploadString,
  type FirebaseStorage,
} from "firebase/storage";
import {
  Account,
  BalanceSnapshot,
  AiChatMessage,
  AiInsight,
  AppConfig,
  Category,
  Contributor,
  Friend,
  FutureSelfInputs,
  IncomeStream,
  IncomeTargets,
  Investment,
  MonthlyPlan,
  PlanTemplate,
  Outing,
  OutingExpense,
  OutingSettlement,
  Preferences,
  Purpose,
  PurposeShare,
  ViewerGrant,
  Reflection,
  SavingsGoal,
  SmartAlert,
  SmsBlockRule,
  SmsDetectionRule,
  SmsTemplateRule,
  Transaction,
  UserProfile,
  UserSettings,
  GlobalFilters,
} from "@/types";
import { defaultIncomeTargets } from "@/lib/growth";
import {
  defaultAppConfig,
  defaultCategories,
  defaultPurposes,
  defaultSignupAccounts,
  defaultStarterAccounts,
  defaultUserSettings,
} from "@/lib/mock-data";

import {
  buildUserDocumentPayload,
  enrichMonthlyPlan,
  monthlyPlanDocCandidates,
  monthlyPlanDocId,
  normalizeAccountForStore,
  normalizeCategoryForStore,
  normalizeContributorForStore,
  normalizeFriendForStore,
  normalizeFriendFromStore,
  normalizeInvestmentForStore,
  normalizeInvestmentFromStore,
  normalizeOutingExpenseForStore,
  normalizeOutingForStore,
  normalizeOutingFromStore,
  normalizeOutingSettlementForStore,
  normalizePurposeForStore,
  normalizeTransactionForStore,
  normalizeTransactionFromStore,
  parseUserDocument,
  stripUndefinedDeep,
} from "@/lib/firestore-helpers";

// Firestore rejects `undefined` anywhere in a write payload ("Unsupported
// field value: undefined"). These wrappers deep-strip undefined fields from
// every write in this module so no save action can crash on optional fields.
/* eslint-disable @typescript-eslint/no-explicit-any */
const setDoc: typeof firestoreSetDoc = ((
  reference: any,
  data: any,
  options?: any,
) =>
  options === undefined
    ? firestoreSetDoc(reference, stripUndefinedDeep(data))
    : firestoreSetDoc(
        reference,
        stripUndefinedDeep(data),
        options,
      )) as typeof firestoreSetDoc;

const addDoc: typeof firestoreAddDoc = ((reference: any, data: any) =>
  firestoreAddDoc(reference, stripUndefinedDeep(data))) as typeof firestoreAddDoc;

const updateDoc: typeof firestoreUpdateDoc = ((
  reference: any,
  ...args: any[]
) =>
  (firestoreUpdateDoc as any)(
    reference,
    ...args.map((arg) => stripUndefinedDeep(arg)),
  )) as typeof firestoreUpdateDoc;
/* eslint-enable @typescript-eslint/no-explicit-any */
import { FIRESTORE_COLLECTIONS } from "@/lib/firestore-schema";
import {
  mergeCategories,
  resolveStoredAccounts,
  resolveStoredPurposes,
} from "@/lib/settings-data";
import {
  applyFirestoreTransactionFilters,
  applyClientTransactionFilters,
  buildTransactionQueryConstraints,
  type FirestoreTransactionFilters,
} from "@/lib/transactions-query";
import {
  normalizeAccountFields,
  normalizeMonthlyPlanPurpose,
  normalizePurposeDocument,
  normalizeTransactionPurpose,
} from "@/lib/migrate-phase1";
import {
  emailToShareSlug,
  legacyPurposeShareLinkedDocId,
  normalizeShareEmail,
  purposeShareLinkedDocId,
  purposeSharePendingDocId,
  viewerGrantDocId,
} from "@/lib/purpose-shares";
import { defaultFutureSelfInputs } from "@/lib/wealth";
import { getCurrentPlanMonth, shiftPlanMonth } from "@/lib/plan";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId,
);

function isDemoMode() {
  return false;
}

const app = isFirebaseConfigured
  ? getApps()[0] ?? initializeApp(firebaseConfig)
  : null;

export const auth = app ? getAuth(app) : null;

function createFirestore() {
  if (!app) return null;
  if (typeof window === "undefined") return getFirestore(app);

  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache(),
    });
  } catch {
    return getFirestore(app);
  }
}

export const db = createFirestore();

function createStorage(): FirebaseStorage | null {
  if (!app) return null;
  try {
    return getStorage(app);
  } catch {
    return null;
  }
}

/**
 * Spec A5 — used for weekly auto-backups and manual "Backup Now". Storage
 * requires storage.rules to be deployed (see /storage.rules in this repo)
 * before uploads will succeed; callers treat upload failure as best-effort.
 */
export const storage = createStorage();

let profileSavedListener: ((userId: string) => void) | null = null;

export function setProfileSavedListener(
  listener: ((userId: string) => void) | null,
) {
  profileSavedListener = listener;
}

function notifyProfileSaved(userId: string) {
  profileSavedListener?.(userId);
}

function requireAuth() {
  if (!auth) throw new Error("Firebase is not configured.");
  return auth;
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(requireAuth(), email, password);
}

export async function signInWithGoogle() {
  return signInWithPopup(requireAuth(), googleProvider);
}

export async function sendPasswordReset(email: string) {
  return sendPasswordResetEmail(requireAuth(), email.trim());
}

export async function completeAuthSession(
  userId: string,
  profile: Pick<UserProfile, "name" | "email" | "photoURL">,
) {
  await linkPurposeSharesForViewer(userId, profile.email);
  await ensureUserWorkspace(userId, profile);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName?: string,
) {
  const credential = await createUserWithEmailAndPassword(
    requireAuth(),
    email,
    password,
  );

  const trimmedName = displayName?.trim();

  if (trimmedName) {
    await updateProfile(credential.user, { displayName: trimmedName });
    await credential.user.reload();
  }

  try {
    await completeAuthSession(credential.user.uid, {
      name: trimmedName || "SpentX User",
      email: credential.user.email ?? email,
      photoURL: credential.user.photoURL ?? undefined,
    });

    if (trimmedName) {
      const profile = await fetchUserProfile(credential.user.uid);
      await saveUserProfile(credential.user.uid, {
        uid: credential.user.uid,
        name: trimmedName,
        email: credential.user.email ?? email,
        photoURL: credential.user.photoURL ?? undefined,
        joinedAt: profile?.joinedAt ?? new Date().toISOString(),
        role: profile?.role ?? "user",
      });
      notifyProfileSaved(credential.user.uid);
    }
  } catch {
    // Sign-up should still succeed even if workspace seeding fails.
  }

  return credential;
}

export async function signOutUser() {
  return signOut(requireAuth());
}

const converter = <T extends { id: string }>(): FirestoreDataConverter<T> => ({
  toFirestore: (model) => {
    const data = { ...model };
    delete (data as Partial<T>).id;
    return data;
  },
  fromFirestore: (snapshot) =>
    ({
      id: snapshot.id,
      ...snapshot.data(),
    }) as T,
});

function userCollection<T extends { id: string }>(
  userId: string,
  collectionName: string,
) {
  if (!db) throw new Error("Firebase is not configured.");
  return collection(db, "users", userId, collectionName).withConverter(
    converter<T>(),
  );
}

function rootCollectionRef(collectionName: string) {
  if (!db) throw new Error("Firebase is not configured.");
  return collection(db, collectionName);
}

function isFirestorePermissionError(error: unknown) {
  const code = (error as { code?: string } | undefined)?.code;
  return (
    code === "permission-denied" ||
    (error instanceof Error &&
      error.message.includes("Missing or insufficient permissions"))
  );
}

function isFirestoreIndexError(error: unknown) {
  const code = (error as { code?: string } | undefined)?.code;
  return (
    code === "failed-precondition" ||
    (error instanceof Error && error.message.includes("requires an index"))
  );
}

function sortTransactionsByDate(transactions: Transaction[]) {
  return [...transactions].sort((a, b) => b.date.localeCompare(a.date));
}

function mapLegacyTransactionDocs(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
) {
  return docs.map((document) =>
    normalizeTransactionFromStore(
      document.id,
      document.data() as Record<string, unknown>,
    ),
  );
}

async function readLegacyTransactionsUnindexed(userId: string) {
  const snapshot = await getDocs(
    userCollection<Transaction>(userId, "transactions"),
  );

  return sortTransactionsByDate(mapLegacyTransactionDocs(snapshot.docs));
}

async function readLegacyTransactions(userId: string) {
  try {
    const snapshot = await getDocs(
      query(
        userCollection<Transaction>(userId, "transactions"),
        orderBy("date", "desc"),
      ),
    );

    return mapLegacyTransactionDocs(snapshot.docs);
  } catch (error) {
    if (isFirestoreIndexError(error) || isFirestorePermissionError(error)) {
      return readLegacyTransactionsUnindexed(userId);
    }
    throw error;
  }
}

function belongsToUser(
  data: Record<string, unknown>,
  userId: string,
) {
  const owner =
    (data.userId as string | undefined) ??
    (data.uid as string | undefined) ??
    (data.ownerId as string | undefined);
  return !owner || owner === userId;
}

async function readRootTransactionsUnfiltered(userId: string) {
  const snapshot = await getDocs(rootCollectionRef("transactions"));

  return sortTransactionsByDate(
    snapshot.docs
      .map((document) =>
        normalizeTransactionFromStore(document.id, document.data()),
      )
      .filter((transaction) => belongsToUser({ userId: transaction.userId }, userId)),
  );
}

async function migrateLegacyTransactions(userId: string) {
  if (!db) return;

  const legacySnapshot = await getDocs(
    query(
      userCollection<Transaction>(userId, "transactions"),
      orderBy("date", "desc"),
    ),
  );

  if (legacySnapshot.empty) return;

  try {
    await Promise.all(
      legacySnapshot.docs.map(async (document) => {
        const transaction = normalizeTransactionFromStore(
          document.id,
          document.data() as Record<string, unknown>,
        );
        await setDoc(doc(db, "transactions", document.id), {
          ...normalizeTransactionForStore(transaction),
          userId,
        });
        await deleteDoc(document.ref);
      }),
    );
  } catch (error) {
    if (isFirestorePermissionError(error)) return;
    throw error;
  }
}

async function readRootTransactionsUnindexed(userId: string) {
  const snapshot = await getDocs(
    query(rootCollectionRef("transactions"), where("userId", "==", userId)),
  );

  return sortTransactionsByDate(
    snapshot.docs.map((document) =>
      normalizeTransactionFromStore(document.id, document.data()),
    ),
  );
}

async function readRootTransactions(userId: string) {
  try {
    const snapshot = await getDocs(
      query(
        rootCollectionRef("transactions"),
        where("userId", "==", userId),
        orderBy("date", "desc"),
      ),
    );

    return snapshot.docs.map((document) =>
      normalizeTransactionFromStore(document.id, document.data()),
    );
  } catch (error) {
    if (isFirestoreIndexError(error)) {
      return readRootTransactionsUnindexed(userId);
    }
    throw error;
  }
}

async function resolveTransactionsForUser(userId: string) {
  const sources = await Promise.allSettled([
    readLegacyTransactions(userId),
    readRootTransactions(userId),
    readRootTransactionsUnindexed(userId),
  ]);

  const merged = new Map<string, Transaction>();

  for (const result of sources) {
    if (result.status !== "fulfilled") continue;
    for (const transaction of result.value) {
      merged.set(transaction.id, transaction);
    }
  }

  if (merged.size > 0) {
    return sortTransactionsByDate([...merged.values()]);
  }

  try {
    return await readRootTransactionsUnfiltered(userId);
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      return readLegacyTransactionsUnindexed(userId);
    }
    throw error;
  }
}

export async function fetchTransactions(userId?: string) {
  if (!db || !userId) return [];

  try {
    return await resolveTransactionsForUser(userId);
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      return readLegacyTransactionsUnindexed(userId);
    }
    if (isFirestoreIndexError(error)) {
      return readRootTransactionsUnindexed(userId);
    }
    throw error;
  }
}

function mapTransactionSnapshot(
  snapshot: { docs: Array<{ id: string; data: () => Record<string, unknown> }> },
) {
  return snapshot.docs.map((document) =>
    normalizeTransactionFromStore(document.id, document.data()),
  );
}

type TransactionSnapshot = {
  docs: Array<{ id: string; data: () => Record<string, unknown> }>;
};

function createRootTransactionSnapshotHandler(
  userId: string,
  onData: (transactions: Transaction[]) => void,
  onError: ((error: Error) => void) | undefined,
  options: {
    sort?: boolean;
    switchToLegacy: () => void;
  },
) {
  let sourceResolved = false;
  let usingLegacy = false;
  let pendingEmptyCheck = false;

  const publish = (transactions: Transaction[]) => {
    let next = transactions;
    if (options.sort) {
      next = sortTransactionsByDate(next);
    }
    onData(next);
  };

  const resolveEmptyRootSnapshot = () => {
    if (usingLegacy || pendingEmptyCheck) return;
    pendingEmptyCheck = true;

    void (async () => {
      try {
        const legacy = await readLegacyTransactions(userId);
        if (usingLegacy) return;

        if (legacy.length > 0) {
          sourceResolved = true;
          usingLegacy = true;
          publish(legacy);
          options.switchToLegacy();
          return;
        }

        const resolved = await fetchTransactions(userId);
        if (usingLegacy) return;

        sourceResolved = true;
        if (resolved.length > 0) {
          publish(resolved);
          return;
        }

        publish([]);
      } catch (error) {
        if (isFirestorePermissionError(error)) {
          usingLegacy = true;
          options.switchToLegacy();
          return;
        }
        onError?.(error as Error);
      } finally {
        pendingEmptyCheck = false;
      }
    })();
  };

  return (snapshot: TransactionSnapshot) => {
    if (usingLegacy) return;

    const transactions = mapTransactionSnapshot(snapshot);

    if (transactions.length > 0) {
      sourceResolved = true;
      publish(transactions);
      return;
    }

    if (!sourceResolved) {
      resolveEmptyRootSnapshot();
      return;
    }

    publish(transactions);
  };
}

function subscribeToRootTransactionsUnindexed(
  userId: string,
  onData: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
  setUnsubscribe?: (unsubscribe: () => void) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  let unsubscribe: (() => void) | undefined;

  const switchToLegacy = () => {
    unsubscribe?.();
    unsubscribe = subscribeToLegacyTransactions(userId, onData, onError);
    setUnsubscribe?.(unsubscribe);
  };

  unsubscribe = onSnapshot(
    query(rootCollectionRef("transactions"), where("userId", "==", userId)),
    createRootTransactionSnapshotHandler(userId, onData, onError, {
      sort: true,
      switchToLegacy,
    }),
    (error) => {
      if (isFirestorePermissionError(error)) {
        switchToLegacy();
        return;
      }
      onError?.(error as Error);
    },
  );

  setUnsubscribe?.(unsubscribe);
  return () => unsubscribe?.();
}

function subscribeToLegacyTransactions(
  userId: string,
  onData: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    query(
      userCollection<Transaction>(userId, "transactions"),
      orderBy("date", "desc"),
    ),
    (snapshot) => onData(mapTransactionSnapshot(snapshot)),
    (error) => onError?.(error as Error),
  );
}

function subscribeToTransactionQuery(
  userId: string,
  constraints: QueryConstraint[],
  onData: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
) {
  if (!db) {
    onData([]);
    return () => undefined;
  }

  let unsubscribe: (() => void) | undefined;
  let usingLegacy = false;

  const switchToLegacy = () => {
    if (usingLegacy) return;
    usingLegacy = true;
    unsubscribe?.();
    unsubscribe = subscribeToLegacyTransactions(userId, onData, onError);
  };

  const handleSnapshot = createRootTransactionSnapshotHandler(
    userId,
    onData,
    onError,
    { switchToLegacy },
  );

  unsubscribe = onSnapshot(
    query(rootCollectionRef("transactions"), ...constraints),
    handleSnapshot,
    (error) => {
      if (usingLegacy) return;

      if (isFirestoreIndexError(error)) {
        unsubscribe?.();
        unsubscribe = subscribeToRootTransactionsUnindexed(
          userId,
          onData,
          onError,
          (nextUnsubscribe) => {
            unsubscribe = nextUnsubscribe;
          },
        );
        return;
      }
      if (isFirestorePermissionError(error)) {
        switchToLegacy();
        return;
      }
      onError?.(error as Error);
    },
  );

  return () => unsubscribe?.();
}

export function subscribeToTransactions(
  userId: string | undefined,
  onData: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
) {
  if (!db || !userId) {
    onData([]);
    return () => undefined;
  }

  let unsubscribe: (() => void) | undefined;
  let cancelled = false;

  void (async () => {
    try {
      const [legacy, root] = await Promise.all([
        readLegacyTransactions(userId).catch(() => [] as Transaction[]),
        readRootTransactions(userId).catch(() => [] as Transaction[]),
      ]);

      if (cancelled) return;

      if (legacy.length > 0 && root.length === 0) {
        unsubscribe = subscribeToLegacyTransactions(userId, onData, onError);
        return;
      }

      unsubscribe = subscribeToTransactionQuery(
        userId,
        [where("userId", "==", userId), orderBy("date", "desc")],
        onData,
        onError,
      );
    } catch (error) {
      if (!cancelled) {
        onError?.(error as Error);
      }
    }
  })();

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export function subscribeToFilteredTransactions(
  userId: string | undefined,
  filters: FirestoreTransactionFilters,
  onData: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
) {
  if (!db || !userId) {
    onData([]);
    return () => undefined;
  }

  void migrateLegacyTransactions(userId);

  const constraints = buildTransactionQueryConstraints(userId, filters);

  return subscribeToTransactionQuery(userId, constraints, onData, onError);
}

export async function fetchFilteredTransactions(
  userId: string | undefined,
  filters: FirestoreTransactionFilters,
) {
  if (!db || !userId) return [];

  const constraints = buildTransactionQueryConstraints(userId, filters);

  try {
    const snapshot = await getDocs(
      query(rootCollectionRef("transactions"), ...constraints),
    );
    const transactions = mapTransactionSnapshot(snapshot);
    if (transactions.length > 0) {
      return transactions;
    }

    const legacy = await readLegacyTransactions(userId);
    return sortTransactionsByDate(
      applyFirestoreTransactionFilters(legacy, filters),
    );
  } catch (error) {
    if (isFirestoreIndexError(error)) {
      const all = await fetchTransactions(userId);
      return sortTransactionsByDate(applyFirestoreTransactionFilters(all, filters));
    }
    if (isFirestorePermissionError(error)) {
      const legacy = await readLegacyTransactions(userId);
      return sortTransactionsByDate(
        applyFirestoreTransactionFilters(legacy, filters),
      );
    }
    throw error;
  }
}

export async function fetchTransactionsPage(
  userId: string | undefined,
  filters: GlobalFilters,
  pageSize: number,
  startAfterDoc: any = null,
) {
  if (!db || !userId) {
    return { transactions: [], lastDoc: null, hasMore: false, error: null };
  }

  const runQuery = async (useRoot: boolean) => {
    let constraints: QueryConstraint[];
    let colRef: any;
    
    if (useRoot) {
      colRef = rootCollectionRef("transactions");
      constraints = buildTransactionQueryConstraints(userId, filters);
    } else {
      colRef = userCollection<Transaction>(userId, "transactions");
      constraints = [];
      if (filters.transactionType) {
        constraints.push(where("type", "==", filters.transactionType));
      }
      if (filters.account) {
        constraints.push(where("account", "==", filters.account));
      }
      if (filters.source) {
        constraints.push(where("source", "==", filters.source));
      }
      if (filters.dateFrom) {
        constraints.push(where("date", ">=", filters.dateFrom));
      }
      if (filters.dateTo) {
        constraints.push(where("date", "<=", `${filters.dateTo}T23:59:59.999Z`));
      }
      if (filters.categories.length > 0 && filters.categories.length <= 10) {
        constraints.push(where("category", "in", filters.categories));
      }
      constraints.push(orderBy("date", "desc"));
    }

    const qConstraints = [...constraints];
    if (startAfterDoc) {
      qConstraints.push(startAfter(startAfterDoc));
    }
    qConstraints.push(limit(pageSize + 1));

    const snapshot = await getDocs(query(colRef, ...qConstraints));
    const docs = snapshot.docs;
    const hasMore = docs.length > pageSize;
    const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;

    const transactions = pageDocs.map(doc =>
      normalizeTransactionFromStore(doc.id, doc.data() as Record<string, unknown>)
    );
    const lastDoc = pageDocs[pageDocs.length - 1] || null;

    return {
      transactions,
      lastDoc,
      hasMore,
    };
  };

  try {
    const res = await runQuery(true);
    return { ...res, error: null };
  } catch (err: any) {
    if (isFirestorePermissionError(err)) {
      try {
        const res = await runQuery(false);
        return { ...res, error: null };
      } catch (subErr: any) {
        console.error("Legacy subcollection query failed:", subErr);
        throw subErr;
      }
    }
    
    if (isFirestoreIndexError(err)) {
      console.warn("Firestore index required for paginated filter:", err.message);
      const colRef = rootCollectionRef("transactions");
      const fallbackConstraints: QueryConstraint[] = [
        where("userId", "==", userId),
        orderBy("date", "desc"),
      ];
      if (startAfterDoc) {
        fallbackConstraints.push(startAfter(startAfterDoc));
      }
      fallbackConstraints.push(limit(pageSize + 1));

      try {
        const snapshot = await getDocs(query(colRef, ...fallbackConstraints));
        const docs = snapshot.docs;
        const hasMore = docs.length > pageSize;
        const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;

        let transactions = pageDocs.map(doc =>
          normalizeTransactionFromStore(doc.id, doc.data() as Record<string, unknown>)
        );

        transactions = applyClientTransactionFilters(
          applyFirestoreTransactionFilters(transactions, filters),
          filters
        );

        const lastDoc = pageDocs[pageDocs.length - 1] || null;

        return {
          transactions,
          lastDoc,
          hasMore,
          error: err.message as string,
        };
      } catch (fallbackErr: any) {
        if (isFirestorePermissionError(fallbackErr)) {
          const subColRef = userCollection<Transaction>(userId, "transactions");
          const subFallbackConstraints: QueryConstraint[] = [orderBy("date", "desc")];
          if (startAfterDoc) {
            subFallbackConstraints.push(startAfter(startAfterDoc));
          }
          subFallbackConstraints.push(limit(pageSize + 1));

          const snapshot = await getDocs(query(subColRef, ...subFallbackConstraints));
          const docs = snapshot.docs;
          const hasMore = docs.length > pageSize;
          const pageDocs = hasMore ? docs.slice(0, pageSize) : docs;

          let transactions = pageDocs.map(doc =>
            normalizeTransactionFromStore(doc.id, doc.data() as Record<string, unknown>)
          );

          transactions = applyClientTransactionFilters(
            applyFirestoreTransactionFilters(transactions, filters),
            filters
          );

          const lastDoc = pageDocs[pageDocs.length - 1] || null;

          return {
            transactions,
            lastDoc,
            hasMore,
            error: err.message as string,
          };
        }
        throw fallbackErr;
      }
    }
    throw err;
  }
}

export async function fetchTransaction(
  userId: string | undefined,
  transactionId: string,
) {
  if (!db || !userId) return null;

  const rootSnapshot = await getDoc(doc(db, "transactions", transactionId));
  if (rootSnapshot.exists()) {
    const data = rootSnapshot.data() as Record<string, unknown>;
    if (data.userId !== userId) return null;
    return normalizeTransactionFromStore(rootSnapshot.id, data);
  }

  const legacySnapshot = await getDoc(
    doc(db, "users", userId, "transactions", transactionId),
  );
  if (!legacySnapshot.exists()) return null;

  return normalizeTransactionFromStore(
    legacySnapshot.id,
    legacySnapshot.data() as Record<string, unknown>,
  );
}

async function migrateLegacyOutings(userId: string) {
  if (!db) return;

  const legacySnapshot = await getDocs(userCollection<Outing>(userId, "outings"));
  if (legacySnapshot.empty) return;

  await Promise.all(
    legacySnapshot.docs.map(async (document) => {
      const outing = normalizeOutingFromStore(
        document.id,
        document.data() as Record<string, unknown>,
      );
      await setDoc(
        doc(db, "outings", document.id),
        normalizeOutingForStore(userId, outing),
      );
      await deleteDoc(document.ref);
    }),
  );
}

async function readRootOutings(userId: string) {
  const snapshot = await getDocs(
    query(rootCollectionRef("outings"), where("createdBy", "==", userId)),
  );

  return snapshot.docs
    .map((document) =>
      normalizeOutingFromStore(document.id, document.data()),
    )
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function subscribeToOutings(
  userId: string | undefined,
  onData: (outings: Outing[]) => void,
  onError?: (error: Error) => void,
) {
  if (!db || !userId) {
    onData([]);
    return () => undefined;
  }

  void migrateLegacyOutings(userId);

  return onSnapshot(
    query(rootCollectionRef("outings"), where("createdBy", "==", userId)),
    (snapshot) => {
      const outings = snapshot.docs
        .map((document) =>
          normalizeOutingFromStore(document.id, document.data()),
        )
        .sort((a, b) => b.startDate.localeCompare(a.startDate));
      onData(outings);
    },
    (error) => onError?.(error),
  );
}

export function subscribeToAlerts(
  userId: string | undefined,
  onData: (alerts: SmartAlert[]) => void,
  onError?: (error: Error) => void,
) {
  if (!db || !userId) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    userCollection<SmartAlert>(userId, "alerts"),
    (snapshot) => {
      const alerts = snapshot.docs
        .map((document) => document.data())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(alerts);
    },
    (error) => onError?.(error),
  );
}

export async function addTransaction(
  userId: string | undefined,
  transaction: Omit<Transaction, "id">,
) {
  if (!db || !userId) {
    return {
      id: crypto.randomUUID(),
      ...transaction,
    };
  }

  const payload = {
    ...normalizeTransactionForStore({ id: "", ...transaction }),
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const result = await addDoc(rootCollectionRef("transactions"), payload);
    return { id: result.id, ...transaction, userId };
  } catch (error) {
    if (!isFirestorePermissionError(error)) throw error;

    const id = crypto.randomUUID();
    await setDoc(doc(db, "users", userId, "transactions", id), {
      ...payload,
      id,
    });
    return { id, ...transaction, userId };
  }
}

export async function updateTransaction(
  userId: string | undefined,
  transactionId: string,
  transaction: Partial<Transaction>,
) {
  if (!db || !userId) return;

  const rootRef = doc(db, "transactions", transactionId);
  const rootSnapshot = await getDoc(rootRef);

  const payload = {
    ...transaction,
    ...(transaction.merchant
      ? { description: transaction.description ?? transaction.merchant }
      : {}),
    updatedAt: new Date().toISOString(),
  };

  if (rootSnapshot.exists()) {
    await updateDoc(rootRef, payload);
    return;
  }

  await updateDoc(doc(db, "users", userId, "transactions", transactionId), payload);
}

export async function deleteTransaction(
  userId: string | undefined,
  transactionId: string,
) {
  if (!db || !userId) return;

  const rootRef = doc(db, "transactions", transactionId);
  const rootSnapshot = await getDoc(rootRef);

  if (rootSnapshot.exists()) {
    await deleteDoc(rootRef);
    return;
  }

  await deleteDoc(doc(db, "users", userId, "transactions", transactionId));
}

async function readRootAccounts(userId: string) {
  const snapshot = await getDocs(
    query(rootCollectionRef(FIRESTORE_COLLECTIONS.accounts), where("userId", "==", userId)),
  );
  return resolveStoredAccounts(
    snapshot.docs.map((document) => {
      const data = document.data() as Account;
      return { ...data, id: data.id ?? document.id };
    }),
  );
}

async function readLegacyAccounts(userId: string) {
  const legacySnapshot = await getDocs(userCollection<Account>(userId, "accounts"));
  return resolveStoredAccounts(
    legacySnapshot.docs.map((document) => {
      const data = document.data();
      return { ...data, id: data.id ?? document.id };
    }),
  );
}

async function migrateLegacyAccountsToRoot(userId: string) {
  if (!db) return;

  const legacySnapshot = await getDocs(userCollection<Account>(userId, "accounts"));
  if (legacySnapshot.empty) return;

  await Promise.all(
    legacySnapshot.docs.map(async (document) => {
      const account = document.data();
      await setDoc(
        doc(db, FIRESTORE_COLLECTIONS.accounts, account.id),
        normalizeAccountForStore(userId, account),
      );
      await deleteDoc(document.ref);
    }),
  );
}

export async function fetchAccounts(userId?: string) {
  if (!db || !userId) return [];

  try {
    let accounts = await readRootAccounts(userId);
    if (accounts.length === 0) {
      await migrateLegacyAccountsToRoot(userId);
      accounts = await readRootAccounts(userId);
    }
    if (accounts.length === 0) {
      accounts = await readLegacyAccounts(userId);
    }
    return accounts;
  } catch (error) {
    if (isFirestorePermissionError(error)) {
      try {
        return await readLegacyAccounts(userId);
      } catch {
        return [];
      }
    }
    throw error;
  }
}

export async function saveAccount(userId: string | undefined, account: Account) {
  if (!db || !userId) {
    throw new Error("Sign in required to save accounts.");
  }

  const payload = normalizeAccountForStore(userId, { ...account, id: account.id });

  try {
    await setDoc(doc(db, FIRESTORE_COLLECTIONS.accounts, account.id), payload);
  } catch (error) {
    if (!isFirestorePermissionError(error)) throw error;

    await setDoc(doc(db, "users", userId, "accounts", account.id), payload);
    return;
  }

  const legacyRef = doc(db, "users", userId, "accounts", account.id);
  const legacySnapshot = await getDoc(legacyRef);
  if (legacySnapshot.exists()) {
    await deleteDoc(legacyRef);
  }
}

/**
 * Spec §4.2 — Accounts are soft-deleted only (is_active: false), never hard
 * deleted, so historical transactions that reference this account keep
 * resolving correctly.
 */
export async function deleteAccount(userId: string | undefined, accountId: string) {
  if (!db || !userId) return;

  const rootRef = doc(db, FIRESTORE_COLLECTIONS.accounts, accountId);
  const rootSnapshot = await getDoc(rootRef);
  if (rootSnapshot.exists()) {
    await saveAccount(userId, {
      ...(rootSnapshot.data() as Account),
      id: accountId,
      is_active: false,
    });
    return;
  }

  const legacyRef = doc(db, "users", userId, "accounts", accountId);
  const legacySnapshot = await getDoc(legacyRef);
  if (legacySnapshot.exists()) {
    await saveAccount(userId, {
      ...(legacySnapshot.data() as Account),
      id: accountId,
      is_active: false,
    });
  }
}

export async function fetchDefaultCategories() {
  if (!db) return defaultCategories;

  const snapshot = await getDocs(
    collection(db, "defaultCategories").withConverter(converter<Category>()),
  );
  const stored: Category[] = snapshot.docs.map((document) => ({
    ...document.data(),
    isDefault: true,
  }));

  if (stored.length === 0) return defaultCategories;

  const merged = [...stored];
  for (const defCat of defaultCategories) {
    if (!merged.some((c) => c.name.toLowerCase() === defCat.name.toLowerCase())) {
      merged.push(defCat);
      void setDoc(doc(db, "defaultCategories", defCat.id), {
        ...defCat,
        isDefault: true,
      }).catch(() => null);
    }
  }

  return merged;
}

export async function seedDefaultCategories() {
  if (!db) return defaultCategories;

  await Promise.all(
    defaultCategories.map((category) =>
      setDoc(doc(db, "defaultCategories", category.id), {
        ...category,
        isDefault: true,
      }),
    ),
  );

  return defaultCategories;
}

export async function saveDefaultCategory(category: Category) {
  if (!db) return;

  await setDoc(doc(db, "defaultCategories", category.id), {
    ...category,
    isDefault: true,
  });
}

export async function deleteDefaultCategory(categoryId: string) {
  if (!db) return;

  await deleteDoc(doc(db, "defaultCategories", categoryId));
}

async function readRootCategories(userId: string) {
  const snapshot = await getDocs(
    query(rootCollectionRef("categories"), where("userId", "==", userId)),
  );
  return snapshot.docs.map((document) => document.data() as Category);
}

async function migrateLegacyCategoriesToRoot(userId: string) {
  if (!db) return;

  const [customSnapshot, legacySnapshot] = await Promise.all([
    getDocs(userCollection<Category>(userId, "customCategories")),
    getDocs(userCollection<Category>(userId, "categories")),
  ]);

  const defaults = await fetchDefaultCategories();
  const defaultIds = new Set(defaults.map((category) => category.id));
  const defaultNames = new Set(defaults.map((category) => category.name));

  const toMigrate = [
    ...customSnapshot.docs.map((document) => document.data()),
    ...legacySnapshot.docs
      .map((document) => document.data())
      .filter(
        (category) =>
          !defaultIds.has(category.id) && !defaultNames.has(category.name),
      ),
  ];

  if (toMigrate.length === 0) return;

  await Promise.all(
    toMigrate.map(async (category) => {
      const payload = normalizeCategoryForStore(userId, {
        ...category,
        isDefault: false,
      });
      await setDoc(doc(db, "categories", category.id), payload);
    }),
  );

  await Promise.all([
    ...customSnapshot.docs.map((document) => deleteDoc(document.ref)),
    ...legacySnapshot.docs.map((document) => deleteDoc(document.ref)),
  ]);
}

export async function fetchCustomCategories(userId?: string) {
  if (!db || !userId) return [];

  let custom = await readRootCategories(userId);
  if (custom.length === 0) {
    await migrateLegacyCategoriesToRoot(userId);
    custom = await readRootCategories(userId);
  }

  return custom;
}

export async function saveCustomCategory(
  userId: string | undefined,
  category: Category,
) {
  if (!db || !userId) return;

  await setDoc(
    doc(db, "categories", category.id),
    normalizeCategoryForStore(userId, { ...category, isDefault: false }),
  );
}

/**
 * Spec §4.3 — Categories are soft-deleted only (is_active: false), never
 * hard deleted, so historical transactions keep their category label.
 */
export async function deleteCustomCategory(
  userId: string | undefined,
  categoryId: string,
) {
  if (!db || !userId) return;

  const rootRef = doc(db, "categories", categoryId);
  const rootSnapshot = await getDoc(rootRef);
  if (!rootSnapshot.exists()) return;

  await saveCustomCategory(userId, {
    ...(rootSnapshot.data() as Category),
    id: categoryId,
    is_active: false,
  });
}

export async function fetchCategories(userId?: string) {
  const defaults = await fetchDefaultCategories();
  if (!db || !userId) return defaults;

  const custom = await fetchCustomCategories(userId);
  return mergeCategories(defaults, custom);
}

async function readRootPurposes(userId: string) {
  const snapshot = await getDocs(
    query(rootCollectionRef(FIRESTORE_COLLECTIONS.purposes), where("userId", "==", userId)),
  );
  return resolveStoredPurposes(
    snapshot.docs.map((document) => {
      const data = document.data() as Purpose;
      return { ...data, id: data.id ?? document.id };
    }),
  );
}

async function migrateLegacyPurposesToRoot(userId: string) {
  if (!db) return;

  const legacySnapshot = await getDocs(userCollection<Purpose>(userId, "purposes"));
  if (legacySnapshot.empty) return;

  await Promise.all(
    legacySnapshot.docs.map(async (document) => {
      const purpose = document.data();
      await setDoc(
        doc(db, FIRESTORE_COLLECTIONS.purposes, purpose.id),
        normalizePurposeForStore(userId, purpose),
      );
      await deleteDoc(document.ref);
    }),
  );
}

export async function fetchPurposes(userId?: string) {
  if (!db || !userId) return [];

  let purposes = await readRootPurposes(userId);
  if (purposes.length === 0) {
    await migrateLegacyPurposesToRoot(userId);
    purposes = await readRootPurposes(userId);
  }
  return purposes;
}

const purposeSharesCollection = () => collection(db!, "purposeShares");

function readLocalPurposeShares() {
  if (typeof window === "undefined") return [] as PurposeShare[];
  try {
    const raw = window.localStorage.getItem("spentx_purpose_shares");
    return raw ? (JSON.parse(raw) as PurposeShare[]) : [];
  } catch {
    return [];
  }
}

function writeLocalPurposeShares(shares: PurposeShare[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("spentx_purpose_shares", JSON.stringify(shares));
}

export async function fetchPurposeShares(
  userId?: string,
  viewerEmail?: string,
) {
  if (!db || !userId) {
    const local = readLocalPurposeShares();
    const email = viewerEmail ? normalizeShareEmail(viewerEmail) : "";
    return local.filter(
      (share) =>
        share.ownerId === userId ||
        share.viewerUid === userId ||
        (email && normalizeShareEmail(share.viewerEmail) === email),
    );
  }

  const ownedQuery = query(
    purposeSharesCollection(),
    where("ownerId", "==", userId),
  );
  const ownedSnapshot = await getDocs(ownedQuery);
  const owned = ownedSnapshot.docs.map((document) => ({
    id: document.id,
    ...(document.data() as Omit<PurposeShare, "id">),
  }));

  if (!viewerEmail) {
    return owned;
  }

  const normalizedEmail = normalizeShareEmail(viewerEmail);
  const viewerEmailQuery = query(
    purposeSharesCollection(),
    where("viewerEmail", "==", normalizedEmail),
  );
  const viewerUidQuery = query(
    purposeSharesCollection(),
    where("viewerUid", "==", userId),
  );

  const [emailSnapshot, uidSnapshot] = await Promise.all([
    getDocs(viewerEmailQuery),
    getDocs(viewerUidQuery),
  ]);

  const merged = new Map<string, PurposeShare>();
  for (const document of [
    ...ownedSnapshot.docs,
    ...emailSnapshot.docs,
    ...uidSnapshot.docs,
  ]) {
    merged.set(document.id, {
      id: document.id,
      ...(document.data() as Omit<PurposeShare, "id">),
    });
  }

  return [...merged.values()];
}

export async function createPurposeShare(
  ownerId: string | undefined,
  viewerEmail: string,
  purposeId: string,
) {
  const normalizedEmail = normalizeShareEmail(viewerEmail);
  if (!ownerId || !normalizedEmail || !purposeId) {
    throw new Error("Owner, viewer email, and purpose are required.");
  }

  const payload: Omit<PurposeShare, "id"> = {
    ownerId,
    viewerEmail: normalizedEmail,
    purposeId,
    role: "viewer",
    createdAt: new Date().toISOString(),
  };

  if (!db) {
    const existing = readLocalPurposeShares().find(
      (share) =>
        share.ownerId === ownerId &&
        normalizeShareEmail(share.viewerEmail) === normalizedEmail &&
        share.purposeId === purposeId,
    );
    if (existing) return existing;

    const share: PurposeShare = {
      id: purposeSharePendingDocId(ownerId, purposeId, normalizedEmail),
      ...payload,
    };
    writeLocalPurposeShares([share, ...readLocalPurposeShares()]);
    return share;
  }

  const pendingId = purposeSharePendingDocId(ownerId, purposeId, normalizedEmail);
  const legacyPendingId = `${ownerId}__${purposeId}__pending__${emailToShareSlug(viewerEmail)}`;
  const existingPending = await getDoc(doc(db, "purposeShares", pendingId));
  if (existingPending.exists()) {
    return { id: pendingId, ...(existingPending.data() as Omit<PurposeShare, "id">) };
  }
  const existingLegacyPending = await getDoc(doc(db, "purposeShares", legacyPendingId));
  if (existingLegacyPending.exists()) {
    return {
      id: legacyPendingId,
      ...(existingLegacyPending.data() as Omit<PurposeShare, "id">),
    };
  }

  const existingOwned = await getDocs(
    query(
      purposeSharesCollection(),
      where("ownerId", "==", ownerId),
      where("viewerEmail", "==", normalizedEmail),
      where("purposeId", "==", purposeId),
    ),
  );
  if (!existingOwned.empty) {
    const document = existingOwned.docs[0];
    return {
      id: document.id,
      ...(document.data() as Omit<PurposeShare, "id">),
    };
  }

  await setDoc(doc(db, "purposeShares", pendingId), payload);
  return { id: pendingId, ...payload };
}

/**
 * Sends an email via the /api/send-email route, which relays it through
 * Resend. Requires RESEND_API_KEY (and optionally RESEND_FROM_EMAIL) to be
 * configured on the server — see .env.example.
 */
export async function sendEmail(payload: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}) {
  const response = await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const { error } = await response.json().catch(() => ({ error: "Failed to send email." }));
    throw new Error(error || "Failed to send email.");
  }

  return response.json();
}

/**
 * Sends the "you've been invited as a viewer" email for a purpose share.
 * Best-effort: a failure here should not block the share itself.
 */
export async function sendPurposeShareInviteEmail(params: {
  viewerEmail: string;
  purposeName: string;
  inviterName?: string;
  inviterEmail?: string;
  shareUrl?: string;
}) {
  const { viewerEmail, purposeName, inviterName, inviterEmail, shareUrl } = params;
  const inviter = inviterName?.trim() || inviterEmail?.trim() || "A SpentX user";
  const appUrl =
    (typeof window !== "undefined" && window.location.origin) ||
    "https://spentx.app";
  const linkUrl = shareUrl || appUrl;

  const subject = `${inviter} shared "${purposeName}" with you on SpentX`;
  const accessLine = shareUrl
    ? `Just click the button below to view the shared transactions — no
        sign-in or account needed. You'll see everything so far and every
        new transaction as it's added, view-only.`
    : `Sign in with <strong>${viewerEmail}</strong> to view the shared
        transactions and reports. You won't be able to add, edit, or delete anything.`;
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
      <h2 style="margin:0 0 12px">You've been invited to SpentX</h2>
      <p style="margin:0 0 12px;line-height:1.5">
        <strong>${inviter}</strong> has given you read-only access to the
        <strong>${purposeName}</strong> ledger on SpentX.
      </p>
      <p style="margin:0 0 12px;line-height:1.5">
        ${accessLine}
      </p>
      <p style="margin:20px 0">
        <a href="${linkUrl}" style="background:#10b981;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;display:inline-block">
          View ${purposeName} on SpentX
        </a>
      </p>
      <p style="margin:0 0 12px;font-size:12px;color:#64748b;line-height:1.5">
        Or copy this link into your browser: ${linkUrl}
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#64748b">
        If you weren't expecting this, you can ignore this email.
      </p>
    </div>
  `;
  const text = shareUrl
    ? `${inviter} has given you read-only access to the "${purposeName}" ledger on SpentX. Open ${linkUrl} to view it — no sign-in needed.`
    : `${inviter} has given you read-only access to the "${purposeName}" ledger on SpentX. Sign in with ${viewerEmail} at ${appUrl} to view it.`;

  return sendEmail({ to: viewerEmail, subject, html, text });
}

function generateShareLinkToken() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates (or reuses) a view-only share link for a purpose. The returned
 * token is the credential — anyone opening /share/{token} gets read-only
 * access to that purpose's transactions without signing in.
 */
export async function getOrCreateShareLink(params: {
  ownerId?: string;
  purposeId: string;
  purposeName: string;
  viewerEmail: string;
}) {
  const { ownerId, purposeId, purposeName, viewerEmail } = params;
  if (!db || !ownerId) {
    throw new Error("Share links require Firebase and a signed-in owner.");
  }

  const normalizedEmail = normalizeShareEmail(viewerEmail);
  const existing = await getDocs(
    query(
      collection(db, "shareLinks"),
      where("ownerId", "==", ownerId),
      where("purposeId", "==", purposeId),
      where("viewerEmail", "==", normalizedEmail),
    ),
  );
  if (!existing.empty) {
    return existing.docs[0].id;
  }

  const token = generateShareLinkToken();
  await setDoc(doc(db, "shareLinks", token), {
    ownerId,
    purposeId,
    purposeName,
    viewerEmail: normalizedEmail,
    createdAt: new Date().toISOString(),
  });
  return token;
}

export type ClaimedShareLink = {
  ownerId: string;
  purposeId: string;
  purposeName: string;
};

/**
 * Opens a share link without requiring login: signs the visitor in
 * anonymously (if needed) and registers a viewer claim validated by the
 * security rules against shareLinks/{token}.
 */
export async function claimShareLink(token: string): Promise<ClaimedShareLink> {
  if (!db || !auth) {
    throw new Error("Shared views require Firebase to be configured.");
  }

  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("Could not start a viewer session.");
  }

  const linkSnap = await getDoc(doc(db, "shareLinks", token));
  if (!linkSnap.exists()) {
    throw new Error("This share link is invalid or has been revoked.");
  }
  const link = linkSnap.data() as {
    ownerId: string;
    purposeId: string;
    purposeName?: string;
    viewerEmail?: string;
  };

  if (uid !== link.ownerId) {
    const claimId = purposeShareLinkedDocId(link.purposeId, uid);
    const existingClaim = await getDoc(doc(db, "purposeShares", claimId));
    if (!existingClaim.exists()) {
      await setDoc(doc(db, "purposeShares", claimId), {
        ownerId: link.ownerId,
        purposeId: link.purposeId,
        viewerEmail: link.viewerEmail ?? "",
        viewerUid: uid,
        role: "viewer",
        linkToken: token,
        createdAt: new Date().toISOString(),
      });
    }
  }

  return {
    ownerId: link.ownerId,
    purposeId: link.purposeId,
    purposeName: link.purposeName || link.purposeId,
  };
}

/**
 * Live read-only stream of one purpose's transactions for a share-link
 * viewer — includes all existing transactions and future ones as they land.
 */
export function subscribeToSharedTransactions(
  ownerId: string,
  purposeId: string,
  onChange: (transactions: Transaction[]) => void,
  onError: (error: Error) => void,
) {
  if (!db) {
    onError(new Error("Shared views require Firebase to be configured."));
    return () => {};
  }

  const sharedQuery = query(
    rootCollectionRef("transactions"),
    where("userId", "==", ownerId),
    where("purpose", "==", purposeId),
  );

  return onSnapshot(
    sharedQuery,
    (snapshot) => {
      onChange(
        sortTransactionsByDate(
          snapshot.docs.map((document) =>
            normalizeTransactionFromStore(document.id, document.data()),
          ),
        ),
      );
    },
    (error) => onError(error instanceof Error ? error : new Error(String(error))),
  );
}

async function syncViewerGrant(
  ownerId: string,
  viewerUid: string,
  purposeIds: string[],
) {
  if (!db) return;

  const grantId = viewerGrantDocId(viewerUid, ownerId);
  const uniquePurposeIds = [...new Set(purposeIds)];

  if (uniquePurposeIds.length === 0) {
    await deleteDoc(doc(db, "viewerGrants", grantId)).catch(() => null);
    return;
  }

  await setDoc(doc(db, "viewerGrants", grantId), {
    ownerId,
    viewerUid,
    purposeIds: uniquePurposeIds,
    updatedAt: new Date().toISOString(),
  });
}

async function removePurposeFromViewerGrant(
  ownerId: string,
  viewerUid: string,
  purposeId: string,
) {
  if (!db) return;

  const grantId = viewerGrantDocId(viewerUid, ownerId);
  const grantDoc = await getDoc(doc(db, "viewerGrants", grantId));
  if (!grantDoc.exists()) return;

  const remainingPurposeIds = (
    (grantDoc.data().purposeIds as string[] | undefined) ?? []
  ).filter((id) => id !== purposeId);

  await syncViewerGrant(ownerId, viewerUid, remainingPurposeIds);
}

export async function revokePurposeShare(
  ownerId: string | undefined,
  shareId: string,
) {
  if (!shareId) return;

  if (!db) {
    writeLocalPurposeShares(
      readLocalPurposeShares().filter((share) => share.id !== shareId),
    );
    return;
  }

  const existing = await getDoc(doc(db, "purposeShares", shareId));
  if (!existing.exists()) return;
  if (existing.data().ownerId !== ownerId) {
    throw new Error("Only the owner can revoke this share.");
  }

  const purposeId = existing.data().purposeId as string;
  const linkedUid = existing.data().viewerUid as string | undefined;
  const viewerEmail = existing.data().viewerEmail as string | undefined;

  await deleteDoc(doc(db, "purposeShares", shareId));

  // Cascade: revoke any no-login share links for this viewer + purpose,
  // along with every anonymous viewer claim minted from them.
  if (viewerEmail) {
    const links = await getDocs(
      query(
        collection(db, "shareLinks"),
        where("ownerId", "==", ownerId),
        where("purposeId", "==", purposeId),
        where("viewerEmail", "==", normalizeShareEmail(viewerEmail)),
      ),
    ).catch(() => null);

    for (const linkDoc of links?.docs ?? []) {
      const claims = await getDocs(
        query(
          purposeSharesCollection(),
          where("ownerId", "==", ownerId),
          where("linkToken", "==", linkDoc.id),
        ),
      ).catch(() => null);
      await Promise.all(
        (claims?.docs ?? []).map((claim) => deleteDoc(claim.ref)),
      );
      await deleteDoc(linkDoc.ref);
    }
  }

  if (linkedUid) {
    const linkedIds = [
      purposeShareLinkedDocId(purposeId, linkedUid),
      legacyPurposeShareLinkedDocId(ownerId!, purposeId, linkedUid),
    ];

    await Promise.all(
      linkedIds.map(async (linkedId) => {
        const linkedDoc = await getDoc(doc(db, "purposeShares", linkedId));
        if (linkedDoc.exists()) {
          await deleteDoc(doc(db, "purposeShares", linkedId));
        }
      }),
    );
    await removePurposeFromViewerGrant(ownerId!, linkedUid, purposeId);
  }
}

export async function linkPurposeSharesForViewer(
  viewerUid: string | undefined,
  viewerEmail: string | undefined,
) {
  if (!viewerUid || !viewerEmail) return;

  const normalizedEmail = normalizeShareEmail(viewerEmail);

  if (!db) {
    const shares = readLocalPurposeShares();
    const next = shares.map((share) => {
      if (normalizeShareEmail(share.viewerEmail) !== normalizedEmail) {
        return share;
      }
      return {
        ...share,
        viewerUid,
        id: purposeShareLinkedDocId(share.purposeId, viewerUid),
      };
    });
    writeLocalPurposeShares(next);
    return;
  }

  const snapshot = await getDocs(
    query(purposeSharesCollection(), where("viewerEmail", "==", normalizedEmail)),
  );

  const sharesByOwner = new Map<string, string[]>();

  await Promise.all(
    snapshot.docs.map(async (document) => {
      const data = document.data() as Omit<PurposeShare, "id">;
      const linkedId = purposeShareLinkedDocId(data.purposeId, viewerUid);
      const legacyLinkedId = legacyPurposeShareLinkedDocId(
        data.ownerId,
        data.purposeId,
        viewerUid,
      );

      await setDoc(doc(db, "purposeShares", linkedId), {
        ...data,
        viewerEmail: normalizedEmail,
        viewerUid,
      });

      const idsToDelete = new Set([document.id, legacyLinkedId]);
      idsToDelete.delete(linkedId);

      await Promise.all(
        [...idsToDelete].map(async (id) => {
          const ref = doc(db, "purposeShares", id);
          const snapshot = await getDoc(ref);
          if (snapshot.exists()) {
            await deleteDoc(ref);
          }
        }),
      );

      const ownerPurposeIds = sharesByOwner.get(data.ownerId) ?? [];
      ownerPurposeIds.push(data.purposeId);
      sharesByOwner.set(data.ownerId, ownerPurposeIds);
    }),
  );

  await Promise.all(
    [...sharesByOwner.entries()].map(([ownerId, purposeIds]) =>
      syncViewerGrant(ownerId, viewerUid, purposeIds),
    ),
  );
}

export async function saveCategory(
  userId: string | undefined,
  category: Category,
) {
  if (!db || !userId) return;

  if (category.isDefault) {
    await saveDefaultCategory(category);
    return;
  }

  await saveCustomCategory(userId, category);
}

export async function savePurpose(userId: string | undefined, purpose: Purpose) {
  if (!db || !userId) return;

  await setDoc(
    doc(db, FIRESTORE_COLLECTIONS.purposes, purpose.id),
    normalizePurposeForStore(userId, purpose),
  );

  const legacyRef = doc(db, "users", userId, "purposes", purpose.id);
  const legacySnapshot = await getDoc(legacyRef);
  if (legacySnapshot.exists()) {
    await deleteDoc(legacyRef);
  }
}

export async function deleteCategory(userId: string | undefined, categoryId: string) {
  if (!db || !userId) return;

  const defaults = await fetchDefaultCategories();
  if (defaults.some((category) => category.id === categoryId)) return;

  await deleteCustomCategory(userId, categoryId);
}

export async function archivePurpose(userId: string | undefined, purpose: Purpose) {
  if (!db || !userId) return;

  await savePurpose(userId, { ...purpose, is_active: false });
}

export async function deletePurpose(userId: string | undefined, purposeId: string) {
  if (!db || !userId) return;

  const rootRef = doc(db, FIRESTORE_COLLECTIONS.purposes, purposeId);
  const rootSnapshot = await getDoc(rootRef);
  if (rootSnapshot.exists()) {
    await savePurpose(userId, {
      ...(rootSnapshot.data() as Purpose),
      id: purposeId,
      is_active: false,
    });
    return;
  }

  const legacySnapshot = await getDoc(doc(db, "users", userId, "purposes", purposeId));
  if (!legacySnapshot.exists()) return;

  await savePurpose(userId, {
    ...(legacySnapshot.data() as Purpose),
    is_active: false,
  });
}

export async function archiveAccount(userId: string | undefined, account: Account) {
  if (!db || !userId) return;

  await saveAccount(userId, { ...account, is_active: false });
}

export async function fetchBalanceSnapshots(userId?: string, accountId?: string) {
  if (!db || !userId) return [];

  const constraints: QueryConstraint[] = [where("userId", "==", userId)];
  if (accountId) {
    constraints.push(where("accountId", "==", accountId));
  }

  const snapshot = await getDocs(
    query(
      collection(db, "snapshots").withConverter(converter<BalanceSnapshot>()),
      ...constraints,
    ),
  );

  return snapshot.docs
    .map((document) => document.data())
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function saveBalanceSnapshot(
  userId: string | undefined,
  snapshot: Omit<BalanceSnapshot, "id" | "createdAt"> & { id?: string },
) {
  if (!db || !userId) return null;

  const id = snapshot.id ?? crypto.randomUUID();
  const record: BalanceSnapshot = {
    ...snapshot,
    id,
    userId,
    createdAt: new Date().toISOString(),
  };

  await setDoc(doc(db, "snapshots", id), stripUndefinedDeep(record));
  return record;
}

export async function deleteBalanceSnapshot(snapshotId: string) {
  if (!db) return;
  await deleteDoc(doc(db, "snapshots", snapshotId));
}

function phase1MigrationKey(userId: string) {
  return `spentx_phase1_migrated_${userId}`;
}

export async function runPhase1Migration(userId: string | undefined) {
  if (!db || !userId) return { updated: 0 };

  if (
    typeof window !== "undefined" &&
    localStorage.getItem(phase1MigrationKey(userId)) === "done"
  ) {
    return { updated: 0 };
  }

  let updated = 0;
  const purposes = await fetchPurposes(userId);
  const normalizedPurposes =
    purposes.length > 0
      ? purposes.map((purpose) => normalizePurposeDocument(purpose))
      : defaultPurposes;

  if (purposes.length === 0) {
    await Promise.all(
      defaultPurposes.map((purpose) => savePurpose(userId, purpose)),
    );
    updated += defaultPurposes.length;
  } else {
    for (const purpose of normalizedPurposes) {
      const existing = purposes.find((item) => item.id === purpose.id);
      if (
        !existing ||
        existing.color !== purpose.color ||
        existing.is_active !== purpose.is_active
      ) {
        await savePurpose(userId, purpose);
        updated += 1;
      }
    }
  }

  const accounts = await fetchAccounts(userId);
  for (const account of accounts) {
    const patch = normalizeAccountFields(account);
    if (Object.keys(patch).length > 0) {
      await saveAccount(userId, { ...account, ...patch });
      updated += 1;
    }
  }

  const transactions = await fetchTransactions(userId);
  const transactionPatches = transactions
    .map((transaction) => ({
      transaction,
      patch: normalizeTransactionPurpose(transaction, normalizedPurposes),
    }))
    .filter(({ patch }) => Object.keys(patch).length > 0);

  const chunkSize = 10;
  for (let index = 0; index < transactionPatches.length; index += chunkSize) {
    const chunk = transactionPatches.slice(index, index + chunkSize);
    await Promise.all(
      chunk.map(({ transaction, patch }) =>
        updateTransaction(userId, transaction.id, {
          ...transaction,
          ...patch,
        }),
      ),
    );
    updated += chunk.length;
  }

  const plansSnapshot = await getDocs(
    query(
      collection(db, "monthlyPlans").withConverter(converter<MonthlyPlan>()),
      where("userId", "==", userId),
    ),
  );

  for (const planDoc of plansSnapshot.docs) {
    const plan = planDoc.data();
    const patch = normalizeMonthlyPlanPurpose(plan);
    if (Object.keys(patch).length > 0) {
      await setDoc(
        doc(db, "monthlyPlans", planDoc.id),
        { ...plan, ...patch },
        { merge: true },
      );
      updated += 1;
    }
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(phase1MigrationKey(userId), "done");
  }

  return { updated };
}

async function fetchLegacyUserParts(userId: string) {
  if (!db) return null;

  const [profileSnapshot, settingsSnapshot, preferencesSnapshot] = await Promise.all([
    getDoc(doc(db, "users", userId, "profile", "default")),
    getDoc(doc(db, "users", userId, "settings", "default")),
    getDoc(doc(db, "users", userId, "preferences", "default")),
  ]);

  const profile = profileSnapshot.exists()
    ? (profileSnapshot.data() as UserProfile)
    : null;

  let settings = defaultUserSettings;
  if (settingsSnapshot.exists()) {
    settings = { ...defaultUserSettings, ...(settingsSnapshot.data() as UserSettings) };
  } else if (preferencesSnapshot.exists()) {
    settings = {
      ...defaultUserSettings,
      ...(preferencesSnapshot.data() as Partial<UserSettings>),
    };
  }

  if (
    !profile &&
    !settingsSnapshot.exists() &&
    !preferencesSnapshot.exists()
  ) {
    return null;
  }

  return parseUserDocument(userId, {
    uid: userId,
    name: profile?.name ?? "SpentX User",
    email: profile?.email ?? "",
    photoURL: profile?.photoURL,
    phone: profile?.phone,
    joinedAt: profile?.joinedAt,
    role: profile?.role,
    settings,
  });
}

export async function fetchUserDocument(userId?: string) {
  if (!db || !userId) return null;

  const snapshot = await getDoc(doc(db, "users", userId));
  if (snapshot.exists()) {
    return parseUserDocument(userId, snapshot.data() as Record<string, unknown>);
  }

  const legacy = await fetchLegacyUserParts(userId);
  if (legacy) {
    await setDoc(
      doc(db, "users", userId),
      {
        ...buildUserDocumentPayload(legacy, legacy.settings),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  return legacy;
}

export async function fetchUserProfile(userId?: string): Promise<UserProfile | null> {
  const userDocument = await fetchUserDocument(userId);
  if (!userDocument) return null;

  const { settings: _settings, updatedAt: _updatedAt, ...profile } = userDocument;
  return profile;
}

export async function saveUserProfile(
  userId: string | undefined,
  profile: UserProfile,
) {
  if (!db || !userId) return;

  const settings = (await fetchUserDocument(userId))?.settings ?? defaultUserSettings;

  await setDoc(
    doc(db, "users", userId),
    {
      ...buildUserDocumentPayload({ ...profile, uid: userId }, settings),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export type UserWorkspaceInitResult = {
  profile: UserProfile;
  createdProfile: boolean;
  createdAccounts: boolean;
  createdPurposes: boolean;
};

/**
 * Ensures the merged users/{userId} doc exists and seeds missing defaults.
 * Skips collections that already have data (e.g. accounts, alerts from mobile).
 */
export async function ensureUserWorkspace(
  userId: string | undefined,
  seed: Pick<UserProfile, "name" | "email" | "photoURL">,
): Promise<UserWorkspaceInitResult | null> {
  if (!db || !userId) return null;

  try {
  const userDocSnapshot = await getDoc(doc(db, "users", userId));
  let profile = await fetchUserProfile(userId);
  let createdProfile = false;

  const seedName = seed.name?.trim() || "SpentX User";

  if (!profile) {
    profile = {
      uid: userId,
      name: seedName,
      email: seed.email,
      photoURL: seed.photoURL,
      joinedAt: new Date().toISOString(),
      role: "user",
    };
    await saveUserProfile(userId, profile);
    createdProfile = true;
  } else {
    if (
      seedName !== "SpentX User" &&
      (!profile.name || profile.name === "SpentX User")
    ) {
      profile = { ...profile, name: seedName };
      await saveUserProfile(userId, profile);
    }

    if (!userDocSnapshot.exists()) {
      await saveUserProfile(userId, profile);
      createdProfile = true;
    }
  }

  const [accounts, purposes, settings] = await Promise.all([
    fetchAccounts(userId),
    fetchPurposes(userId),
    fetchUserSettings(userId),
  ]);

  let createdAccounts = false;
  if (accounts.length === 0) {
    await Promise.all(
      defaultSignupAccounts.map((account) => saveAccount(userId, account)),
    );
    createdAccounts = true;
  }

  let createdPurposes = false;
  if (purposes.length === 0) {
    await Promise.all(
      defaultPurposes.map((purpose) => savePurpose(userId, purpose)),
    );
    createdPurposes = true;
  }

  const existingContributors = await fetchContributors(userId);
  if (existingContributors.length === 0) {
    // Deterministic doc id so re-running the seed (or two mounts racing) writes
    // the same document instead of creating a duplicate "Me".
    await saveContributor(userId, {
      id: defaultContributorDocId(userId),
      name: "Me",
      isDefault: true,
    });
  }

  await seedDefaultCategories();

  const resolvedAccounts = createdAccounts ? defaultSignupAccounts : accounts;
  const shouldSeedKpi =
    !settings.dashboardKpiCards || settings.dashboardKpiCards.length === 0;

  if (
    !settings.defaultAccount ||
    shouldSeedKpi ||
    createdAccounts ||
    createdPurposes
  ) {
    await saveUserSettings(userId, {
      ...settings,
      // Transactions reference accounts by name, and the Settings picker
      // stores the name — seed the default the same way so they line up.
      defaultAccount: settings.defaultAccount || resolvedAccounts[0]?.name || "",
      dashboardKpiCards: shouldSeedKpi
        ? [
            "net-worth",
            "total-income",
            "total-expense",
            "net-savings",
          ]
        : settings.dashboardKpiCards,
    });

    if (shouldSeedKpi && typeof window !== "undefined") {
      window.localStorage.setItem(
        "spentx-dashboard-kpi-config",
        JSON.stringify([
          "net-worth",
          "total-income",
          "total-expense",
          "net-savings",
        ]),
      );
    }
  }

  void runPhase1Migration(userId).catch(() => undefined);

  return {
    profile,
    createdProfile,
    createdAccounts,
    createdPurposes,
  };
  } catch {
    return null;
  }
}

export async function ensureUserProfile(
  userId: string | undefined,
  seed: Pick<UserProfile, "name" | "email" | "photoURL">,
) {
  const result = await ensureUserWorkspace(userId, seed);
  return result?.profile ?? null;
}

export async function fetchUserSettings(userId?: string): Promise<UserSettings> {
  const userDocument = await fetchUserDocument(userId);
  return userDocument?.settings ?? defaultUserSettings;
}

export async function saveUserSettings(
  userId: string | undefined,
  settings: UserSettings,
) {
  if (!db || !userId) return;

  const profile =
    (await fetchUserProfile(userId)) ??
    ({
      uid: userId,
      name: "SpentX User",
      email: "",
    } satisfies UserProfile);

  await setDoc(
    doc(db, "users", userId),
    {
      ...buildUserDocumentPayload(profile, settings),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function fetchAppConfig(): Promise<AppConfig> {
  if (!db) return defaultAppConfig;

  const snapshot = await getDoc(doc(db, "globalSettings", "appConfig"));
  return snapshot.exists()
    ? ({ ...defaultAppConfig, ...snapshot.data() } as AppConfig)
    : defaultAppConfig;
}

export async function saveAppConfig(config: AppConfig) {
  if (!db) return;

  await setDoc(doc(db, "globalSettings", "appConfig"), {
    ...config,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchPreferences(userId?: string): Promise<Preferences> {
  const settings = await fetchUserSettings(userId);
  return {
    theme: settings.theme,
    privateMode: settings.privateMode,
    autoSync: settings.autoSync,
  };
}

export async function savePreferences(
  userId: string | undefined,
  preferences: Preferences,
) {
  if (!db || !userId) return;

  const current = await fetchUserSettings(userId);
  await saveUserSettings(userId, { ...current, ...preferences });
}

const PLAN_STORAGE_KEY = "spentx-monthly-plans";
const PLAN_TEMPLATES_STORAGE_KEY = "spentx-plan-templates";

function readLocalPlans(): MonthlyPlan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PLAN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MonthlyPlan[]) : [];
  } catch {
    return [];
  }
}

function writeLocalPlans(plans: MonthlyPlan[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plans));
}

function readLocalPlanTemplates(): PlanTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PLAN_TEMPLATES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlanTemplate[]) : [];
  } catch {
    return [];
  }
}

function writeLocalPlanTemplates(templates: PlanTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAN_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

function legacyMonthlyPlanToTemplate(plan: MonthlyPlan): PlanTemplate {
  return {
    id: plan.id,
    userId: plan.userId,
    name: plan.templateName ?? "Untitled template",
    expectedIncome: plan.expectedIncome,
    allocations: plan.allocations,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

async function migrateLegacyPlanTemplate(
  userId: string,
  plan: MonthlyPlan,
): Promise<PlanTemplate> {
  const templateId = plan.id.startsWith("template-")
    ? plan.id
    : `template-${plan.id}`;
  const template = {
    ...legacyMonthlyPlanToTemplate(plan),
    id: templateId,
    userId,
  };

  if (db) {
    await setDoc(doc(db, "planTemplates", templateId), stripUndefinedDeep(template));
    await deleteDoc(doc(db, "monthlyPlans", plan.id));
  }

  return template;
}

async function migrateLegacyMonthlyPlan(userId: string, month: string) {
  if (!db) return null;

  const legacySnapshot = await getDoc(doc(db, "users", userId, "monthly_plans", month));
  if (!legacySnapshot.exists()) return null;

  const plan = { id: legacySnapshot.id, ...legacySnapshot.data() } as MonthlyPlan;
  const docId = monthlyPlanDocId(userId, month);
  const enriched = enrichMonthlyPlan({ ...plan, id: docId }, null, userId);

  await setDoc(doc(db, "monthlyPlans", docId), stripUndefinedDeep(enriched));
  await deleteDoc(legacySnapshot.ref);

  return enriched.isTemplate ? null : enriched;
}

export async function fetchMonthlyPlan(
  userId: string | undefined,
  month: string,
  purposeId = "personal",
) {
  if (!db || !userId) {
    return (
      readLocalPlans().find(
        (plan) =>
          plan.month === month &&
          !plan.isTemplate &&
          (plan.purposeId ?? "personal") === purposeId,
      ) ?? null
    );
  }

  for (const docId of monthlyPlanDocCandidates(userId, month, purposeId)) {
    try {
      const snapshot = await getDoc(doc(db, "monthlyPlans", docId));
      if (!snapshot.exists()) continue;

      const plan = { id: snapshot.id, ...snapshot.data() } as MonthlyPlan;
      if (plan.isTemplate) continue;
      return {
        ...plan,
        purposeId: plan.purposeId ?? purposeId,
      };
    } catch (error) {
      // A get() on a document that doesn't exist yet still runs security
      // rules, and older/undeployed rule sets can surface that as
      // "permission-denied" instead of a clean not-found. Treat it as "no
      // plan saved for this month" rather than failing the whole page.
      if (isFirestorePermissionError(error)) continue;
      throw error;
    }
  }

  if (purposeId === "personal") {
    try {
      return await migrateLegacyMonthlyPlan(userId, month);
    } catch (error) {
      if (isFirestorePermissionError(error)) return null;
      throw error;
    }
  }

  return null;
}

export async function fetchPlanTemplates(userId: string | undefined) {
  if (!db || !userId) {
    return readLocalPlanTemplates();
  }

  const [templatesSnapshot, legacyMonthlySnapshot, legacyUserSnapshot] =
    await Promise.all([
      getDocs(
        query(
          rootCollectionRef("planTemplates"),
          where("userId", "==", userId),
        ),
      ),
      getDocs(
        query(
          rootCollectionRef("monthlyPlans"),
          where("userId", "==", userId),
          where("isTemplate", "==", true),
        ),
      ),
      getDocs(userCollection<MonthlyPlan>(userId, "monthly_plans")),
    ]);

  const merged = new Map<string, PlanTemplate>();

  for (const document of templatesSnapshot.docs) {
    const template = { id: document.id, ...document.data() } as PlanTemplate;
    merged.set(template.id, template);
  }

  const legacyTemplates: MonthlyPlan[] = [
    ...legacyMonthlySnapshot.docs.map(
      (document) => ({ id: document.id, ...document.data() } as MonthlyPlan),
    ),
    ...legacyUserSnapshot.docs
      .map((document) => ({
        ...document.data(),
        id: document.id,
      }))
      .filter((plan) => plan.isTemplate),
  ];

  for (const legacy of legacyTemplates) {
    if (!legacy.isTemplate) continue;
    const migrated = await migrateLegacyPlanTemplate(userId, legacy);
    merged.set(migrated.id, migrated);
  }

  return [...merged.values()].sort((a, b) =>
    (b.updatedAt ?? b.createdAt ?? "").localeCompare(
      a.updatedAt ?? a.createdAt ?? "",
    ),
  );
}

export async function savePlanTemplate(
  userId: string | undefined,
  template: Omit<PlanTemplate, "id" | "userId" | "createdAt" | "updatedAt"> & {
    id?: string;
    description?: string;
  },
) {
  const templateId = template.id ?? `template-${crypto.randomUUID()}`;
  const payload: PlanTemplate = {
    ...template,
    id: templateId,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!db || !userId) {
    const templates = readLocalPlanTemplates().filter(
      (item) => item.id !== templateId,
    );
    writeLocalPlanTemplates([payload, ...templates]);
    return payload;
  }

  await setDoc(doc(db, "planTemplates", templateId), stripUndefinedDeep(payload));
  return payload;
}

export async function deletePlanTemplate(
  userId: string | undefined,
  templateId: string,
) {
  if (!db || !userId) {
    const templates = readLocalPlanTemplates().filter(
      (item) => item.id !== templateId,
    );
    writeLocalPlanTemplates(templates);
    return;
  }

  await deleteDoc(doc(db, "planTemplates", templateId));
}

export async function saveMonthlyPlan(
  userId: string | undefined,
  plan: MonthlyPlan,
) {
  if (!db || !userId) {
    const payload: MonthlyPlan = {
      ...plan,
      updatedAt: new Date().toISOString(),
      createdAt: plan.createdAt ?? new Date().toISOString(),
    };
    const plans = readLocalPlans().filter((item) => item.id !== plan.id);
    writeLocalPlans([payload, ...plans]);
    return payload;
  }

  const purposeId = plan.purposeId ?? "personal";
  const docId = monthlyPlanDocId(userId, plan.month, purposeId);

  const previousSnapshot = await getDoc(doc(db, "monthlyPlans", docId));
  const previous = previousSnapshot.exists()
    ? ({ id: docId, ...previousSnapshot.data() } as MonthlyPlan)
    : null;

  const payload = enrichMonthlyPlan(
    {
      ...plan,
      id: docId,
      updatedAt: new Date().toISOString(),
      createdAt: plan.createdAt ?? new Date().toISOString(),
    },
    previous,
    userId,
  );

  await setDoc(doc(db, "monthlyPlans", docId), stripUndefinedDeep(payload));

  const legacyRef = doc(db, "users", userId, "monthly_plans", plan.month);
  const legacySnapshot = await getDoc(legacyRef);
  if (legacySnapshot.exists()) {
    await deleteDoc(legacyRef);
  }

  return payload;
}

const REFLECTIONS_STORAGE_KEY = "spentx-reflections";

function readLocalReflections(): Reflection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REFLECTIONS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Reflection[]) : [];
  } catch {
    return [];
  }
}

function writeLocalReflections(reflections: Reflection[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REFLECTIONS_STORAGE_KEY, JSON.stringify(reflections));
}

export async function fetchReflections(userId?: string) {
  if (isDemoMode()) return readLocalReflections();
  if (!db || !userId) return [];

  const snapshot = await getDocs(
    query(
      userCollection<Reflection>(userId, "reflections"),
      orderBy("weekStart", "desc"),
    ),
  );
  return snapshot.docs.map((document) => document.data());
}

export async function fetchReflection(userId: string | undefined, weekStart: string) {
  if (isDemoMode()) {
    return (
      readLocalReflections().find(
        (reflection) => reflection.weekStart === weekStart,
      ) ?? null
    );
  }
  if (!db || !userId) return null;

  const snapshot = await getDoc(
    doc(db, "users", userId, "reflections", weekStart),
  );
  return snapshot.exists()
    ? ({ id: snapshot.id, ...snapshot.data() } as Reflection)
    : null;
}

export async function saveReflection(
  userId: string | undefined,
  reflection: Reflection,
) {
  const payload: Reflection = {
    ...reflection,
    id: reflection.weekStart,
    updatedAt: new Date().toISOString(),
    createdAt: reflection.createdAt ?? new Date().toISOString(),
  };

  if (isDemoMode() || !db || !userId) {
    const reflections = readLocalReflections().filter(
      (item) => item.weekStart !== reflection.weekStart,
    );
    writeLocalReflections([payload, ...reflections]);
    return payload;
  }

  await setDoc(doc(db, "users", userId, "reflections", reflection.weekStart), {
    ...payload,
    userId,
  });

  return payload;
}

const ALERTS_STORAGE_KEY = "spentx-alerts";
const INCOME_STREAMS_STORAGE_KEY = "spentx-income-streams";
const INCOME_TARGETS_STORAGE_KEY = "spentx-income-targets";
const INVESTMENTS_STORAGE_KEY = "spentx-investments";
const SAVINGS_GOALS_STORAGE_KEY = "spentx-savings-goals";
const PROJECTOR_SETTINGS_STORAGE_KEY = "spentx-projector-settings";
const OUTINGS_STORAGE_KEY = "spentx-outings";
const OUTING_EXPENSES_STORAGE_KEY = "spentx-outing-expenses";
const OUTING_SETTLEMENTS_STORAGE_KEY = "spentx-outing-settlements";
const FRIENDS_STORAGE_KEY = "spentx-friends";

function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export async function fetchAlerts(userId?: string) {
  if (isDemoMode()) return readLocalJson<SmartAlert[]>(ALERTS_STORAGE_KEY, []);
  if (!db || !userId) return [];

  const snapshot = await getDocs(
    query(
      userCollection<SmartAlert>(userId, "alerts"),
      orderBy("createdAt", "desc"),
    ),
  );
  return snapshot.docs.map((document) => document.data());
}

export async function upsertAlerts(
  userId: string | undefined,
  alerts: SmartAlert[],
) {
  if (isDemoMode() || !db || !userId) {
    const existing = readLocalJson<SmartAlert[]>(ALERTS_STORAGE_KEY, []);
    const map = new Map(existing.map((alert) => [alert.id, alert]));
    for (const alert of alerts) {
      const current = map.get(alert.id);
      map.set(alert.id, {
        ...alert,
        read: current?.read ?? alert.read,
        createdAt: current?.createdAt ?? alert.createdAt,
      });
    }
    const merged = [...map.values()].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    writeLocalJson(ALERTS_STORAGE_KEY, merged);
    return merged;
  }

  await Promise.all(
    alerts.map((alert) =>
      setDoc(doc(db, "users", userId, "alerts", alert.id), {
        ...alert,
        userId,
      }),
    ),
  );

  return fetchAlerts(userId);
}

export async function markAlertRead(
  userId: string | undefined,
  alertId: string,
) {
  if (isDemoMode() || !db || !userId) {
    const alerts = readLocalJson<SmartAlert[]>(ALERTS_STORAGE_KEY, []);
    const next = alerts.map((alert) =>
      alert.id === alertId ? { ...alert, read: true } : alert,
    );
    writeLocalJson(ALERTS_STORAGE_KEY, next);
    return next;
  }

  await updateDoc(doc(db, "users", userId, "alerts", alertId), { read: true });
  return fetchAlerts(userId);
}

export async function markAllAlertsRead(userId: string | undefined) {
  const alerts = await fetchAlerts(userId);
  const next = alerts.map((alert) => ({ ...alert, read: true }));

  if (isDemoMode() || !db || !userId) {
    writeLocalJson(ALERTS_STORAGE_KEY, next);
    return next;
  }

  await Promise.all(
    next.map((alert) =>
      updateDoc(doc(db, "users", userId, "alerts", alert.id), { read: true }),
    ),
  );
  return next;
}

export async function fetchIncomeStreams(userId?: string) {
  if (isDemoMode()) {
    return readLocalJson<IncomeStream[]>(INCOME_STREAMS_STORAGE_KEY, []);
  }
  if (!db || !userId) return [];

  const snapshot = await getDocs(
    userCollection<IncomeStream>(userId, "income_streams"),
  );
  return snapshot.docs.map((document) => document.data());
}

export async function saveIncomeStream(
  userId: string | undefined,
  stream: IncomeStream,
) {
  const payload: IncomeStream = {
    ...stream,
    updatedAt: new Date().toISOString(),
    createdAt: stream.createdAt ?? new Date().toISOString(),
  };

  if (isDemoMode() || !db || !userId) {
    const streams = readLocalJson<IncomeStream[]>(INCOME_STREAMS_STORAGE_KEY, []);
    const next = [payload, ...streams.filter((item) => item.id !== stream.id)];
    writeLocalJson(INCOME_STREAMS_STORAGE_KEY, next);
    return payload;
  }

  await setDoc(doc(db, "users", userId, "income_streams", stream.id), {
    ...payload,
    userId,
  });
  return payload;
}

export async function deleteIncomeStream(
  userId: string | undefined,
  streamId: string,
) {
  if (isDemoMode() || !db || !userId) {
    const streams = readLocalJson<IncomeStream[]>(INCOME_STREAMS_STORAGE_KEY, []);
    writeLocalJson(
      INCOME_STREAMS_STORAGE_KEY,
      streams.filter((item) => item.id !== streamId),
    );
    return;
  }

  await deleteDoc(doc(db, "users", userId, "income_streams", streamId));
}

export async function fetchIncomeTargets(userId?: string) {
  if (isDemoMode()) {
    return readLocalJson<IncomeTargets>(
      INCOME_TARGETS_STORAGE_KEY,
      defaultIncomeTargets,
    );
  }
  if (!db || !userId) return defaultIncomeTargets;

  const snapshot = await getDoc(
    doc(db, "users", userId, "income_targets", "default"),
  );
  return snapshot.exists()
    ? (snapshot.data() as IncomeTargets)
    : defaultIncomeTargets;
}

export async function saveIncomeTargets(
  userId: string | undefined,
  targets: IncomeTargets,
) {
  if (isDemoMode() || !db || !userId) {
    writeLocalJson(INCOME_TARGETS_STORAGE_KEY, targets);
    return targets;
  }

  await setDoc(doc(db, "users", userId, "income_targets", "default"), targets);
  return targets;
}

async function readRootInvestments(userId: string) {
  const snapshot = await getDocs(
    query(rootCollectionRef("investments"), where("userId", "==", userId)),
  );
  return snapshot.docs.map((document) =>
    normalizeInvestmentFromStore(document.id, document.data()),
  );
}

async function migrateLegacyInvestments(userId: string) {
  if (!db) return;

  const legacySnapshot = await getDocs(
    userCollection<Investment>(userId, "investments"),
  );
  if (legacySnapshot.empty) return;

  await Promise.all(
    legacySnapshot.docs.map(async (document) => {
      const investment = normalizeInvestmentFromStore(
        document.id,
        document.data() as Record<string, unknown>,
      );
      await setDoc(
        doc(db, "investments", document.id),
        normalizeInvestmentForStore(userId, investment),
      );
      await deleteDoc(document.ref);
    }),
  );
}

export async function fetchInvestments(userId?: string) {
  if (isDemoMode()) {
    return readLocalJson<Investment[]>(INVESTMENTS_STORAGE_KEY, []);
  }
  if (!db || !userId) return [];

  let investments = await readRootInvestments(userId);
  if (investments.length === 0) {
    await migrateLegacyInvestments(userId);
    investments = await readRootInvestments(userId);
  }

  return investments;
}

export async function saveInvestment(
  userId: string | undefined,
  investment: Investment,
) {
  const payload: Investment = {
    ...investment,
    updatedAt: new Date().toISOString(),
    createdAt: investment.createdAt ?? new Date().toISOString(),
  };

  if (isDemoMode() || !db || !userId) {
    const investments = readLocalJson<Investment[]>(
      INVESTMENTS_STORAGE_KEY,
      [],
    );
    const next = [
      payload,
      ...investments.filter((item) => item.id !== investment.id),
    ];
    writeLocalJson(INVESTMENTS_STORAGE_KEY, next);
    return payload;
  }

  await setDoc(
    doc(db, "investments", investment.id),
    normalizeInvestmentForStore(userId, payload),
  );
  return payload;
}

export async function deleteInvestment(
  userId: string | undefined,
  investmentId: string,
) {
  if (isDemoMode() || !db || !userId) {
    const investments = readLocalJson<Investment[]>(
      INVESTMENTS_STORAGE_KEY,
      [],
    );
    writeLocalJson(
      INVESTMENTS_STORAGE_KEY,
      investments.filter((item) => item.id !== investmentId),
    );
    return;
  }

  const rootRef = doc(db, "investments", investmentId);
  const rootSnapshot = await getDoc(rootRef);
  if (rootSnapshot.exists()) {
    await deleteDoc(rootRef);
    return;
  }

  await deleteDoc(doc(db, "users", userId, "investments", investmentId));
}

export async function fetchSavingsGoals(userId?: string) {
  if (isDemoMode()) {
    return readLocalJson<SavingsGoal[]>(
      SAVINGS_GOALS_STORAGE_KEY,
      [],
    );
  }
  if (!db || !userId) return [];

  const snapshot = await getDocs(
    userCollection<SavingsGoal>(userId, "savings_goals"),
  );
  return snapshot.docs.map((document) => document.data());
}

export async function saveSavingsGoal(
  userId: string | undefined,
  goal: SavingsGoal,
) {
  const payload: SavingsGoal = {
    ...goal,
    updatedAt: new Date().toISOString(),
    createdAt: goal.createdAt ?? new Date().toISOString(),
  };

  if (isDemoMode() || !db || !userId) {
    const goals = readLocalJson<SavingsGoal[]>(
      SAVINGS_GOALS_STORAGE_KEY,
      [],
    );
    const next = [payload, ...goals.filter((item) => item.id !== goal.id)];
    writeLocalJson(SAVINGS_GOALS_STORAGE_KEY, next);
    return payload;
  }

  await setDoc(doc(db, "users", userId, "savings_goals", goal.id), {
    ...payload,
    userId,
  });
  return payload;
}

export async function deleteSavingsGoal(
  userId: string | undefined,
  goalId: string,
) {
  if (isDemoMode() || !db || !userId) {
    const goals = readLocalJson<SavingsGoal[]>(
      SAVINGS_GOALS_STORAGE_KEY,
      [],
    );
    writeLocalJson(
      SAVINGS_GOALS_STORAGE_KEY,
      goals.filter((item) => item.id !== goalId),
    );
    return;
  }

  await deleteDoc(doc(db, "users", userId, "savings_goals", goalId));
}

export async function fetchProjectorSettings(userId?: string) {
  if (isDemoMode()) {
    return readLocalJson<FutureSelfInputs>(
      PROJECTOR_SETTINGS_STORAGE_KEY,
      defaultFutureSelfInputs,
    );
  }
  if (!db || !userId) return defaultFutureSelfInputs;

  const snapshot = await getDoc(
    doc(db, "users", userId, "wealth_projector", "default"),
  );
  return snapshot.exists()
    ? (snapshot.data() as FutureSelfInputs)
    : defaultFutureSelfInputs;
}

export async function saveProjectorSettings(
  userId: string | undefined,
  settings: FutureSelfInputs,
) {
  if (isDemoMode() || !db || !userId) {
    writeLocalJson(PROJECTOR_SETTINGS_STORAGE_KEY, settings);
    return settings;
  }

  await setDoc(doc(db, "users", userId, "wealth_projector", "default"), settings);
  return settings;
}

export async function fetchOutings(userId?: string) {
  if (isDemoMode()) {
    return readLocalJson<Outing[]>(OUTINGS_STORAGE_KEY, []);
  }
  if (!db || !userId) return [];

  let outings = await readRootOutings(userId);

  if (outings.length === 0) {
    await migrateLegacyOutings(userId);
    outings = await readRootOutings(userId);
  }

  return outings;
}

export async function saveOuting(userId: string | undefined, outing: Outing) {
  const payload: Outing = {
    ...outing,
    updatedAt: new Date().toISOString(),
    createdAt: outing.createdAt ?? new Date().toISOString(),
  };

  if (isDemoMode() || !db || !userId) {
    const outings = readLocalJson<Outing[]>(OUTINGS_STORAGE_KEY, []);
    const next = [payload, ...outings.filter((item) => item.id !== outing.id)];
    writeLocalJson(OUTINGS_STORAGE_KEY, next);
    return payload;
  }

  await setDoc(
    doc(db, "outings", outing.id),
    normalizeOutingForStore(userId, payload),
  );

  const legacyRef = doc(db, "users", userId, "outings", outing.id);
  const legacySnapshot = await getDoc(legacyRef);
  if (legacySnapshot.exists()) {
    await deleteDoc(legacyRef);
  }

  return payload;
}

export async function deleteOuting(userId: string | undefined, outingId: string) {
  if (isDemoMode() || !db || !userId) {
    const outings = readLocalJson<Outing[]>(OUTINGS_STORAGE_KEY, []);
    writeLocalJson(
      OUTINGS_STORAGE_KEY,
      outings.filter((item) => item.id !== outingId),
    );
    return;
  }

  const rootRef = doc(db, "outings", outingId);
  const rootSnapshot = await getDoc(rootRef);

  if (rootSnapshot.exists()) {
    await deleteDoc(rootRef);
    return;
  }

  await deleteDoc(doc(db, "users", userId, "outings", outingId));
}

async function readRootOutingExpenses(userId: string, outingId?: string) {
  const constraints: QueryConstraint[] = [where("userId", "==", userId)];
  if (outingId) {
    constraints.push(where("outingId", "==", outingId));
  }

  const snapshot = await getDocs(
    query(rootCollectionRef(FIRESTORE_COLLECTIONS.outingExpenses), ...constraints),
  );
  return snapshot.docs.map((document) => {
    const data = document.data() as OutingExpense;
    return { ...data, id: data.id ?? document.id };
  });
}

async function migrateLegacyOutingExpenses(userId: string) {
  if (!db) return;

  const legacySnapshot = await getDocs(
    userCollection<OutingExpense>(userId, "outing_expenses"),
  );
  if (legacySnapshot.empty) return;

  await Promise.all(
    legacySnapshot.docs.map(async (document) => {
      const expense = document.data();
      await setDoc(
        doc(db, FIRESTORE_COLLECTIONS.outingExpenses, expense.id),
        normalizeOutingExpenseForStore(userId, expense),
      );
      await deleteDoc(document.ref);
    }),
  );
}

export async function fetchOutingExpenses(userId?: string, outingId?: string) {
  if (isDemoMode()) {
    const expenses = readLocalJson<OutingExpense[]>(
      OUTING_EXPENSES_STORAGE_KEY,
      [],
    );
    return outingId
      ? expenses.filter((item) => item.outingId === outingId)
      : expenses;
  }
  if (!db || !userId) return [];

  let expenses = await readRootOutingExpenses(userId, outingId);
  if (expenses.length === 0 && !outingId) {
    await migrateLegacyOutingExpenses(userId);
    expenses = await readRootOutingExpenses(userId, outingId);
  }

  return expenses;
}

export async function saveOutingExpense(
  userId: string | undefined,
  expense: OutingExpense,
) {
  const payload: OutingExpense = {
    ...expense,
    updatedAt: new Date().toISOString(),
    createdAt: expense.createdAt ?? new Date().toISOString(),
  };

  if (isDemoMode() || !db || !userId) {
    const expenses = readLocalJson<OutingExpense[]>(
      OUTING_EXPENSES_STORAGE_KEY,
      [],
    );
    const next = [payload, ...expenses.filter((item) => item.id !== expense.id)];
    writeLocalJson(OUTING_EXPENSES_STORAGE_KEY, next);
    return payload;
  }

  await setDoc(
    doc(db, FIRESTORE_COLLECTIONS.outingExpenses, expense.id),
    normalizeOutingExpenseForStore(userId, payload),
  );

  const legacyRef = doc(db, "users", userId, "outing_expenses", expense.id);
  const legacySnapshot = await getDoc(legacyRef);
  if (legacySnapshot.exists()) {
    await deleteDoc(legacyRef);
  }

  return payload;
}

export async function deleteOutingExpense(
  userId: string | undefined,
  expenseId: string,
) {
  if (isDemoMode() || !db || !userId) {
    const expenses = readLocalJson<OutingExpense[]>(
      OUTING_EXPENSES_STORAGE_KEY,
      [],
    );
    writeLocalJson(
      OUTING_EXPENSES_STORAGE_KEY,
      expenses.filter((item) => item.id !== expenseId),
    );
    return;
  }

  const rootRef = doc(db, FIRESTORE_COLLECTIONS.outingExpenses, expenseId);
  const rootSnapshot = await getDoc(rootRef);
  if (rootSnapshot.exists()) {
    await deleteDoc(rootRef);
    return;
  }

  await deleteDoc(doc(db, "users", userId, "outing_expenses", expenseId));
}

async function readRootOutingSettlements(userId: string, outingId?: string) {
  const constraints: QueryConstraint[] = [where("userId", "==", userId)];
  if (outingId) {
    constraints.push(where("outingId", "==", outingId));
  }

  const snapshot = await getDocs(
    query(
      rootCollectionRef(FIRESTORE_COLLECTIONS.outingSettlements),
      ...constraints,
    ),
  );
  return snapshot.docs.map((document) => {
    const data = document.data() as OutingSettlement;
    return { ...data, id: data.id ?? document.id };
  });
}

async function migrateLegacyOutingSettlements(userId: string) {
  if (!db) return;

  const legacySnapshot = await getDocs(
    userCollection<OutingSettlement>(userId, "outing_settlements"),
  );
  if (legacySnapshot.empty) return;

  await Promise.all(
    legacySnapshot.docs.map(async (document) => {
      const settlement = document.data();
      await setDoc(
        doc(db, FIRESTORE_COLLECTIONS.outingSettlements, settlement.id),
        normalizeOutingSettlementForStore(userId, settlement),
      );
      await deleteDoc(document.ref);
    }),
  );
}

export async function fetchOutingSettlements(
  userId?: string,
  outingId?: string,
) {
  if (isDemoMode()) {
    const settlements = readLocalJson<OutingSettlement[]>(
      OUTING_SETTLEMENTS_STORAGE_KEY,
      [],
    );
    return outingId
      ? settlements.filter((item) => item.outingId === outingId)
      : settlements;
  }
  if (!db || !userId) return [];

  let settlements = await readRootOutingSettlements(userId, outingId);
  if (settlements.length === 0 && !outingId) {
    await migrateLegacyOutingSettlements(userId);
    settlements = await readRootOutingSettlements(userId, outingId);
  }

  return settlements;
}

export async function saveOutingSettlement(
  userId: string | undefined,
  settlement: OutingSettlement,
) {
  const payload: OutingSettlement = {
    ...settlement,
    createdAt: settlement.createdAt ?? new Date().toISOString(),
  };

  if (isDemoMode() || !db || !userId) {
    const settlements = readLocalJson<OutingSettlement[]>(
      OUTING_SETTLEMENTS_STORAGE_KEY,
      [],
    );
    const next = [
      payload,
      ...settlements.filter((item) => item.id !== settlement.id),
    ];
    writeLocalJson(OUTING_SETTLEMENTS_STORAGE_KEY, next);
    return payload;
  }

  await setDoc(
    doc(db, FIRESTORE_COLLECTIONS.outingSettlements, settlement.id),
    normalizeOutingSettlementForStore(userId, payload),
  );

  const legacyRef = doc(db, "users", userId, "outing_settlements", settlement.id);
  const legacySnapshot = await getDoc(legacyRef);
  if (legacySnapshot.exists()) {
    await deleteDoc(legacyRef);
  }

  return payload;
}

async function readRootFriends(userId: string) {
  const snapshot = await getDocs(
    query(rootCollectionRef("friends"), where("userId", "==", userId)),
  );
  return snapshot.docs.map((document) =>
    normalizeFriendFromStore(document.id, document.data()),
  );
}

async function migrateLegacyFriends(userId: string) {
  if (!db) return;

  const legacySnapshot = await getDocs(userCollection<Friend>(userId, "friends"));
  if (legacySnapshot.empty) return;

  await Promise.all(
    legacySnapshot.docs.map(async (document) => {
      const friend = normalizeFriendFromStore(
        document.id,
        document.data() as Record<string, unknown>,
      );
      await setDoc(
        doc(db, "friends", document.id),
        normalizeFriendForStore(userId, friend),
      );
      await deleteDoc(document.ref);
    }),
  );
}

export async function fetchFriends(userId?: string) {
  if (isDemoMode()) {
    return readLocalJson<Friend[]>(FRIENDS_STORAGE_KEY, []);
  }
  if (!db || !userId) return [];

  let friends = await readRootFriends(userId);
  if (friends.length === 0) {
    await migrateLegacyFriends(userId);
    friends = await readRootFriends(userId);
  }

  return friends;
}

export async function saveFriend(userId: string | undefined, friend: Friend) {
  const payload: Friend = {
    ...friend,
    updatedAt: new Date().toISOString(),
    createdAt: friend.createdAt ?? new Date().toISOString(),
  };

  if (isDemoMode() || !db || !userId) {
    const friends = readLocalJson<Friend[]>(FRIENDS_STORAGE_KEY, []);
    const next = [payload, ...friends.filter((item) => item.id !== friend.id)];
    writeLocalJson(FRIENDS_STORAGE_KEY, next);
    return payload;
  }

  await setDoc(
    doc(db, "friends", friend.id),
    normalizeFriendForStore(userId, payload),
  );
  return payload;
}

export async function deleteFriend(userId: string | undefined, friendId: string) {
  if (isDemoMode() || !db || !userId) {
    const friends = readLocalJson<Friend[]>(FRIENDS_STORAGE_KEY, []);
    writeLocalJson(
      FRIENDS_STORAGE_KEY,
      friends.filter((item) => item.id !== friendId),
    );
    return;
  }

  const rootRef = doc(db, "friends", friendId);
  const rootSnapshot = await getDoc(rootRef);
  if (rootSnapshot.exists()) {
    await deleteDoc(rootRef);
    return;
  }

  await deleteDoc(doc(db, "users", userId, "friends", friendId));
}

/**
 * Contributors — who gave Home/Family income (spec §9.2's Contributor
 * field). User-managed in Settings; "Me" is seeded on sign-up and can't be
 * deleted (enforced client-side in Settings, not by Firestore rules, since
 * it's a UX guardrail rather than a security boundary).
 */
export async function fetchContributors(userId?: string) {
  if (!db || !userId) return [];

  const snapshot = await getDocs(
    query(rootCollectionRef(FIRESTORE_COLLECTIONS.contributors), where("userId", "==", userId)),
  );
  const contributors = snapshot.docs.map((document) => {
    const data = document.data() as Contributor;
    return { ...data, id: data.id ?? document.id };
  });

  const sorted = contributors.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  });

  // De-duplicate by name (case-insensitive). Older data or a race on the
  // one-time "Me" seed could have created duplicate rows; the default-first
  // sort above means the canonical "Me" wins when collapsing duplicates.
  const seenNames = new Set<string>();
  return sorted.filter((contributor) => {
    const key = contributor.name.trim().toLowerCase();
    if (seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });
}

/** Stable, per-user document id for the seeded "Me" contributor. */
export function defaultContributorDocId(userId: string) {
  return `${userId}__me`;
}

export async function saveContributor(
  userId: string | undefined,
  contributor: Contributor,
) {
  if (!db || !userId) return contributor;

  const payload = normalizeContributorForStore(userId, contributor);
  await setDoc(doc(db, FIRESTORE_COLLECTIONS.contributors, contributor.id), payload);
  return { ...contributor, ...payload } as Contributor;
}

export async function deleteContributor(
  userId: string | undefined,
  contributorId: string,
) {
  if (!db || !userId) return;
  await deleteDoc(doc(db, FIRESTORE_COLLECTIONS.contributors, contributorId));
}

const AI_CHAT_STORAGE_KEY = "spentx-ai-chat-history";

export async function fetchAiChatHistory(
  userId?: string,
  limit = 100,
): Promise<AiChatMessage[]> {
  if (isDemoMode()) {
    return readLocalJson<AiChatMessage[]>(AI_CHAT_STORAGE_KEY, []);
  }
  if (!db || !userId) return [];

  const snapshot = await getDocs(
    query(
      userCollection<AiChatMessage>(userId, "aiChatHistory"),
      orderBy("timestamp", "asc"),
    ),
  );

  const messages = snapshot.docs.map((document) => document.data());
  return limit > 0 ? messages.slice(-limit) : messages;
}

export function subscribeToAiChatHistory(
  userId: string | undefined,
  onData: (messages: AiChatMessage[]) => void,
  onError?: (error: Error) => void,
) {
  if (isDemoMode()) {
    onData(readLocalJson<AiChatMessage[]>(AI_CHAT_STORAGE_KEY, []));
    return () => undefined;
  }

  if (!db || !userId) {
    onData([]);
    return () => undefined;
  }

  return onSnapshot(
    query(
      userCollection<AiChatMessage>(userId, "aiChatHistory"),
      orderBy("timestamp", "asc"),
    ),
    (snapshot) => onData(snapshot.docs.map((document) => document.data())),
    (error) => onError?.(error),
  );
}

export async function saveAiChatMessage(
  userId: string | undefined,
  message: Pick<AiChatMessage, "role" | "content">,
) {
  const payload: AiChatMessage = {
    id: crypto.randomUUID(),
    role: message.role,
    content: message.content,
    userId,
    timestamp: new Date().toISOString(),
  };

  if (isDemoMode() || !db || !userId) {
    const history = readLocalJson<AiChatMessage[]>(AI_CHAT_STORAGE_KEY, []);
    writeLocalJson(AI_CHAT_STORAGE_KEY, [...history, payload]);
    return payload;
  }

  await setDoc(
    doc(db, "users", userId, "aiChatHistory", payload.id),
    payload,
  );

  return payload;
}

export async function fetchAiInsight(
  userId: string | undefined,
  month: string,
  type: AiInsight["type"] = "financial_health",
) {
  if (!db || !userId) return null;

  const docId = `${userId}_${month}_${type}`;
  const snapshot = await getDoc(doc(db, "aiInsights", docId));
  if (!snapshot.exists()) return null;

  return { id: snapshot.id, ...snapshot.data() } as AiInsight;
}

export async function saveAiInsight(
  userId: string | undefined,
  insight: Omit<AiInsight, "id" | "userId"> & { id?: string },
) {
  if (!db || !userId) return null;

  const docId = insight.id ?? `${userId}_${insight.month}_${insight.type}`;
  const payload: AiInsight = {
    id: docId,
    userId,
    month: insight.month,
    type: insight.type,
    healthScore: insight.healthScore,
    summary: insight.summary,
    tips: insight.tips,
    generatedAt: insight.generatedAt ?? new Date().toISOString(),
  };

  await setDoc(doc(db, "aiInsights", docId), {
    ...payload,
    updatedAt: serverTimestamp(),
  });

  return payload;
}

function stampSmsRule<T extends { createdAt?: string; updatedAt?: string }>(
  rule: T,
  adminId?: string,
): T & { createdBy?: string; createdAt: string; updatedAt: string } {
  const now = new Date().toISOString();
  return {
    ...rule,
    createdBy: adminId ?? (rule as { createdBy?: string }).createdBy ?? "admin",
    createdAt: rule.createdAt ?? now,
    updatedAt: now,
  };
}

export async function fetchSmsTemplateRules() {
  if (!db) return [];

  const snapshot = await getDocs(rootCollectionRef("smsTemplateRules"));
  return snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() } as SmsTemplateRule))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function saveSmsTemplateRule(
  rule: SmsTemplateRule,
  adminId?: string,
) {
  if (!db) return rule;

  const payload = stampSmsRule(rule, adminId);
  await setDoc(doc(db, "smsTemplateRules", rule.id), payload);
  return payload;
}

export async function deleteSmsTemplateRule(ruleId: string) {
  if (!db) return;
  await deleteDoc(doc(db, "smsTemplateRules", ruleId));
}

export async function fetchSmsDetectionRules() {
  if (!db) return [];

  const snapshot = await getDocs(rootCollectionRef("smsDetectionRules"));
  return snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() } as SmsDetectionRule))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function saveSmsDetectionRule(
  rule: SmsDetectionRule,
  adminId?: string,
) {
  if (!db) return rule;

  const payload = stampSmsRule(rule, adminId);
  await setDoc(doc(db, "smsDetectionRules", rule.id), payload);
  return payload;
}

export async function deleteSmsDetectionRule(ruleId: string) {
  if (!db) return;
  await deleteDoc(doc(db, "smsDetectionRules", ruleId));
}

export async function fetchSmsBlockRules() {
  if (!db) return [];

  const snapshot = await getDocs(rootCollectionRef("smsBlockRules"));
  return snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() } as SmsBlockRule))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

export async function saveSmsBlockRule(rule: SmsBlockRule, adminId?: string) {
  if (!db) return rule;

  const payload = stampSmsRule(rule, adminId);
  await setDoc(doc(db, "smsBlockRules", rule.id), payload);
  return payload;
}

export async function deleteSmsBlockRule(ruleId: string) {
  if (!db) return;
  await deleteDoc(doc(db, "smsBlockRules", ruleId));
}

export async function clearAiChatHistory(userId: string | undefined) {
  if (isDemoMode() || !db || !userId) {
    writeLocalJson(AI_CHAT_STORAGE_KEY, []);
    return;
  }

  const snapshot = await getDocs(
    userCollection<AiChatMessage>(userId, "aiChatHistory"),
  );
  await Promise.all(snapshot.docs.map((document) => deleteDoc(document.ref)));
}

// --- Data Safety — Backup & Restore (LLD Addendum A5) ---

export const BACKUP_VERSION = "1.0";

export type SpentXBackup = {
  exportDate: string;
  version: string;
  purposes: Purpose[];
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  snapshots: BalanceSnapshot[];
  monthlyPlans: MonthlyPlan[];
  planTemplates: PlanTemplate[];
  investments: Investment[];
  friends: Friend[];
  outings: Outing[];
  outingExpenses: OutingExpense[];
};

const BACKUP_REQUIRED_KEYS: Array<keyof SpentXBackup> = [
  "version",
  "purposes",
  "accounts",
  "categories",
  "transactions",
];

export function isValidBackupFile(data: unknown): data is SpentXBackup {
  if (!data || typeof data !== "object") return false;
  return BACKUP_REQUIRED_KEYS.every((key) => key in (data as Record<string, unknown>));
}

async function gatherMonthlyPlansForBackup(
  userId: string,
  purposes: Purpose[],
) {
  const activePurposes = purposes.filter((purpose) => purpose.isActive !== false);
  const months = Array.from({ length: 24 }, (_, index) =>
    shiftPlanMonth(getCurrentPlanMonth(), -index),
  );

  const results = await Promise.all(
    activePurposes.flatMap((purpose) =>
      months.map((month) => fetchMonthlyPlan(userId, month, purpose.id)),
    ),
  );

  return results.filter((plan): plan is MonthlyPlan => Boolean(plan));
}

/** Gathers every collection listed in spec A5.1 for a full JSON export. */
export async function gatherAllUserData(userId: string): Promise<SpentXBackup> {
  const [
    purposes,
    accounts,
    categories,
    transactions,
    snapshots,
    planTemplates,
    investments,
    friends,
    outings,
    outingExpenses,
  ] = await Promise.all([
    fetchPurposes(userId),
    fetchAccounts(userId),
    fetchCategories(userId),
    fetchTransactions(userId),
    fetchBalanceSnapshots(userId),
    fetchPlanTemplates(userId),
    fetchInvestments(userId),
    fetchFriends(userId),
    fetchOutings(userId),
    fetchOutingExpenses(userId),
  ]);

  const monthlyPlans = await gatherMonthlyPlansForBackup(userId, purposes);

  return {
    exportDate: new Date().toISOString(),
    version: BACKUP_VERSION,
    purposes,
    accounts,
    categories,
    transactions,
    snapshots,
    monthlyPlans,
    planTemplates,
    investments,
    friends,
    outings,
    outingExpenses,
  };
}

/**
 * Best-effort upload to Firebase Storage. Requires storage.rules (see
 * /storage.rules) to be deployed — callers should treat failures as
 * non-fatal, matching spec A5.2's "silent failure" design.
 */
export async function uploadBackupToStorage(
  userId: string,
  backup: SpentXBackup,
) {
  if (!storage) throw new Error("Firebase Storage is not configured.");
  const fileName = `backups/${userId}/auto_${backup.exportDate.slice(0, 10)}.json`;
  await uploadString(storageRef(storage, fileName), JSON.stringify(backup), "raw", {
    contentType: "application/json",
  });
  return fileName;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/**
 * Restores a backup by upserting every record at its original document id,
 * tagged with the current userId. This does not delete documents created
 * after the backup was taken — it merges the backup back in rather than
 * wiping the collections first, to avoid catastrophic data loss if the
 * restore is interrupted partway through.
 */
export async function restoreBackupData(userId: string, backup: SpentXBackup) {
  if (!db) throw new Error("Firebase is not configured.");

  const collectionsToRestore: Array<[
    string,
    Array<{ id: string } & Record<string, unknown>>,
  ]> = [
    [FIRESTORE_COLLECTIONS.purposes, backup.purposes],
    [FIRESTORE_COLLECTIONS.accounts, backup.accounts],
    // Default categories live in their own global collection — only
    // restore the user's custom ones to avoid duplicating defaults.
    [
      FIRESTORE_COLLECTIONS.categories,
      backup.categories.filter((category) => !category.isDefault),
    ],
    [FIRESTORE_COLLECTIONS.transactions, backup.transactions],
    [FIRESTORE_COLLECTIONS.snapshots, backup.snapshots],
    [FIRESTORE_COLLECTIONS.monthlyPlans, backup.monthlyPlans],
    [FIRESTORE_COLLECTIONS.planTemplates, backup.planTemplates],
    [FIRESTORE_COLLECTIONS.investments, backup.investments],
    [FIRESTORE_COLLECTIONS.friends, backup.friends],
    [FIRESTORE_COLLECTIONS.outings, backup.outings],
    [FIRESTORE_COLLECTIONS.outingExpenses, backup.outingExpenses],
  ];

  for (const [collectionName, records] of collectionsToRestore) {
    const withIds = (records ?? []).filter((record) => Boolean(record?.id));
    for (const batchChunk of chunk(withIds, 400)) {
      const batch = writeBatch(db);
      for (const record of batchChunk) {
        batch.set(
          doc(db, collectionName, record.id),
          stripUndefinedDeep({
            ...record,
            userId,
          }),
        );
      }
      await batch.commit();
    }
  }
}

export const firestoreSecurityRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAdmin() {
      return request.auth != null
        && exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }

    match /transactions/{transactionId} {
      allow read, update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
    }

    match /outings/{outingId} {
      allow read: if request.auth != null && (
        resource.data.createdBy == request.auth.uid
        || (resource.data.participants != null
          && request.auth.uid in resource.data.participants)
      );
      allow create: if request.auth != null
        && request.resource.data.createdBy == request.auth.uid;
      allow update, delete: if request.auth != null
        && resource.data.createdBy == request.auth.uid;
    }

    match /monthlyPlans/{planId} {
      allow read, update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
    }

    match /planTemplates/{templateId} {
      allow read, update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
    }

    match /friends/{friendId} {
      allow read, update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
    }

    match /categories/{categoryId} {
      allow read, update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
    }

    match /investments/{investmentId} {
      allow read, update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
    }

    match /defaultCategories/{categoryId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && isAdmin();
    }

    match /globalSettings/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && isAdmin();
    }

    match /aiInsights/{insightId} {
      allow read, update, delete: if request.auth != null
        && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null
        && request.resource.data.userId == request.auth.uid;
    }

    match /smsTemplateRules/{ruleId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && isAdmin();
    }

    match /smsDetectionRules/{ruleId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && isAdmin();
    }

    match /smsBlockRules/{ruleId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && isAdmin();
    }
  }
}`;
