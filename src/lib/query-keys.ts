export const queryKeys = {
  accounts: (userId?: string) => ["accounts", userId] as const,
  categories: (userId?: string) => ["categories", userId] as const,
  globalSettings: () => ["globalSettings"] as const,
  purposes: (userId?: string) => ["purposes", userId] as const,
  transactions: (userId?: string) => ["transactions", userId] as const,
  sharedTransactions: (token: string) => ["sharedTransactions", token] as const,
  sharedPurposes: (token: string) => ["sharedPurposes", token] as const,
  sharedMonthlyPlan: (token: string, month: string) =>
    ["sharedMonthlyPlan", token, month] as const,
  monthlyPlan: (
    userId: string | undefined,
    month: string,
    purposeId = "personal",
  ) => ["monthlyPlan", userId, month, purposeId] as const,
  planTemplates: (userId?: string) => ["planTemplates", userId] as const,
  allMonthlyPlans: (userId?: string) => ["allMonthlyPlans", userId] as const,
  allMonthlyPlanActuals: (userId?: string) => ["allMonthlyPlanActuals", userId] as const,
  preferences: (userId?: string) => ["preferences", userId] as const,
  reflections: (userId?: string) => ["reflections", userId] as const,
  reflection: (userId: string | undefined, weekStart: string) =>
    ["reflection", userId, weekStart] as const,
  alerts: (userId?: string) => ["alerts", userId] as const,
  incomeStreams: (userId?: string) => ["incomeStreams", userId] as const,
  incomeTargets: (userId?: string) => ["incomeTargets", userId] as const,
  investmentTotal: (userId?: string) => ["investmentTotal", userId] as const,
  savingsGoals: (userId?: string) => ["savingsGoals", userId] as const,
  projectorSettings: (userId?: string) => ["projectorSettings", userId] as const,
  outings: (userId?: string) => ["outings", userId] as const,
  deletedOutings: (userId?: string) => ["deletedOutings", userId] as const,
  outingCategories: (userId?: string) => ["outingCategories", userId] as const,
  outingExpenses: (userId?: string, outingId?: string) =>
    ["outingExpenses", userId, outingId] as const,
  allOutingExpenses: (userId?: string) =>
    ["outingExpenses", userId, "all"] as const,
  outingSettlements: (userId?: string, outingId?: string) =>
    ["outingSettlements", userId, outingId] as const,
  friends: (userId?: string) => ["friends", userId] as const,
  /** Includes soft-deleted friends — historical records still reference them. */
  allFriends: (userId?: string) => ["friends", userId, "all"] as const,
  friendSplits: (userId?: string, transactionId?: string) =>
    ["friendSplits", userId, transactionId] as const,
  allFriendSplits: (userId?: string) => ["friendSplits", userId, "all"] as const,
  friendSettlements: (userId?: string, friendSplitId?: string) =>
    ["friendSettlements", userId, friendSplitId] as const,
  allFriendSettlements: (userId?: string) =>
    ["friendSettlements", userId, "all"] as const,
  aiChatHistory: (userId?: string) => ["aiChatHistory", userId] as const,
  balanceSnapshots: (userId?: string, accountId?: string) =>
    ["balanceSnapshots", userId, accountId] as const,
  netWorthHistory: (userId?: string) => ["netWorthHistory", userId] as const,
  purposeShares: (userId?: string) => ["purposeShares", userId] as const,
  contributors: (userId?: string) => ["contributors", userId] as const,
  smartViews: (userId?: string) => ["smartViews", userId] as const,
  userMerchants: (userId?: string) => ["userMerchants", userId] as const,
};