export const queryKeys = {
  accounts: (userId?: string) => ["accounts", userId] as const,
  categories: (userId?: string) => ["categories", userId] as const,
  purposes: (userId?: string) => ["purposes", userId] as const,
  transactions: (userId?: string) => ["transactions", userId] as const,
  monthlyPlan: (
    userId: string | undefined,
    month: string,
    purposeId = "personal",
  ) => ["monthlyPlan", userId, month, purposeId] as const,
  planTemplates: (userId?: string) => ["planTemplates", userId] as const,
  preferences: (userId?: string) => ["preferences", userId] as const,
  reflections: (userId?: string) => ["reflections", userId] as const,
  reflection: (userId: string | undefined, weekStart: string) =>
    ["reflection", userId, weekStart] as const,
  alerts: (userId?: string) => ["alerts", userId] as const,
  incomeStreams: (userId?: string) => ["incomeStreams", userId] as const,
  incomeTargets: (userId?: string) => ["incomeTargets", userId] as const,
  investments: (userId?: string) => ["investments", userId] as const,
  savingsGoals: (userId?: string) => ["savingsGoals", userId] as const,
  projectorSettings: (userId?: string) => ["projectorSettings", userId] as const,
  outings: (userId?: string) => ["outings", userId] as const,
  outingExpenses: (userId?: string, outingId?: string) =>
    ["outingExpenses", userId, outingId] as const,
  allOutingExpenses: (userId?: string) =>
    ["outingExpenses", userId, "all"] as const,
  outingSettlements: (userId?: string, outingId?: string) =>
    ["outingSettlements", userId, outingId] as const,
  friends: (userId?: string) => ["friends", userId] as const,
  aiChatHistory: (userId?: string) => ["aiChatHistory", userId] as const,
  balanceSnapshots: (userId?: string, accountId?: string) =>
    ["balanceSnapshots", userId, accountId] as const,
  purposeShares: (userId?: string) => ["purposeShares", userId] as const,
  contributors: (userId?: string) => ["contributors", userId] as const,
};