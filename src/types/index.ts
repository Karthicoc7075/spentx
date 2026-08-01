export type TransactionType = "income" | "expense";

/**
 * Free-form now — user-managed via Settings > Contributors (Friend's/Father's
 * names vary per household). "Me" is the permanent, non-deletable default.
 */
export type ContributorSource = string;

export type Contributor = {
  id: string;
  userId?: string;
  name: string;
  color?: string;
  /** true only for the permanent "Me" entry — cannot be deleted. */
  isDefault?: boolean;
  /** spec §2.5 */
  canDelete?: boolean;
  /** Soft-delete flag — archived contributors are never hard-deleted. */
  isActive?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdAt?: string;
};

/**
 * Verified merchant, shared across manual entry + SMS learning (mobile).
 * Not created for outing expenses — those stay one-off free text.
 */
export type UserMerchant = {
  id: string;
  /** Raw identifier used for exact matching — a UPI VPA when known, else the merchant name. */
  payee: string;
  normalizedPayee: string;
  /** Display name shown to the user (e.g. "Zomato"). */
  title: string;
};

export type TransactionSource = "manual" | "mobile" | "bank-sync" | "import";

/** How a transaction was entered (LLD §4.4). */
export type EntrySource = "manual" | "mobile-manual" | "sms-auto-detected";

export type TransactionStatus =
  | "completed"
  | "pending"
  | "failed"
  | "refunded";

export type Transaction = {
  id: string;
  userId?: string;
  type: TransactionType;
  merchant: string;
  /**
   * FIRESTORE_REBUILD_SPEC §2.6/§2.7 canonical fields. The parent
   * `transactions` doc stores identity + total amount only; per-purpose
   * amount/category/contributor live in `transactionSplits`. `category` and
   * `purpose` here are the single-split-derived read-model value that hooks
   * assemble (spec Step 7) so components can bind them directly — they are
   * never a second, independently-writable field on the parent doc.
   */
  totalAmount?: number;
  /** Legacy UI alias for totalAmount. */
  amount?: number;
  category: string;
  accountId?: string;
  accountName?: string;
  /** Legacy UI alias for accountName. */
  account?: string;
  purposeId?: string;
  /** Legacy UI alias for purposeId. */
  purpose?: string;
  transactionDate?: string;
  /** Legacy UI alias for transactionDate. */
  date?: string;
  /** Legacy read-model alias retained for UI compatibility. */
  purposeIds?: string[];
  hasSplits?: boolean;
  /** Per-purpose/category splits — source of truth for multi-category expenses. */
  splits?: TransactionSplit[];
  /**
   * Optional single display title (e.g. "College Backpack") distinct from
   * `merchant`. Independent of Split Expense — purely descriptive, never
   * used for allocation math.
   */
  title?: string;
  hasItems?: boolean;
  /** Optional purchased line items (name/category/amount). Independent of `splits`. */
  items?: TransactionItem[];
  paymentMethod?: string;
  source: TransactionSource;
  /** Canonical entry channel — stored as entry_source in Postgres. */
  entrySource?: EntrySource;
  /** Denormalized YYYY-MM for indexed month queries (LLD A6). */
  monthKey?: string;
  time?: string;
  paymentType?: string;
  reference?: string;
  /** Cross-platform alias for reference */
  referenceId?: string;
  upiId?: string;
  note?: string;
  description?: string;
  outingId?: string | null;
  /**
   * Display-only (never persisted): every account the current user paid from
   * on this outing, set on the Transactions-page rollup row so the account
   * filter still matches while the row itself reads "Mixed".
   */
  rollupAccountNames?: string[];
  /** Display-only / search index: child expense titles inside this outing */
  outingExpenseTitles?: string[];
  splitWith?: string[];
  status?: TransactionStatus;
  tags?: string[];
  /** Flutter/Android field — mapped to type on read */
  isExpense?: boolean;
  isAutoDetected?: boolean;
  receiptImageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Who contributed income — Home/Family income only */
  contributorSource?: ContributorSource;
};

export type Account = {
  id: string;
  userId?: string;
  name: string;
  type: "bank" | "cash" | "wallet" | "credit" | "investment" | "mutual_fund" | "stocks";
  last4?: string;
  openingBalance: number;
  /** YYYY-MM-DD — opening balance applies from this date onward */
  openingBalanceDate?: string;
  /** spec §2.2 */
  purposeIds?: string[];
  isDefault?: boolean;
  canDelete?: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** Soft-delete flag — archived accounts are never hard-deleted. */
  isActive?: boolean;
  /** spec §2.0(c) — set together with isActive:false, cleared on reactivate. */
  deletedAt?: string;
  deletedBy?: string;
};

export type Category = {
  id: string;
  userId?: string;
  name: string;
  type: TransactionType;
  color: string;
  icon?: string;
  /** @deprecated defaults now live in globalSettings.defaultCategories */
  isDefault?: boolean;
  canDelete?: boolean;
  /** Soft-delete flag — archived categories are never hard-deleted. */
  isActive?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  /** Merged read-model marker (spec Step 7): "global" | "custom" */
  source?: "global" | "custom";
  /** Expense transactions in this category count toward Wealth's Total Investment. */
  isInvestment?: boolean;
};

export type Purpose = {
  id: string;
  userId?: string;
  name: string;
  color?: string;
  isDefault?: boolean;
  canDelete?: boolean;
  /** Soft-delete flag — archived purposes are never hard-deleted. */
  isActive?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdAt?: string;
};

export type BalanceSnapshot = {
  id?: string;
  userId: string;
  accountId: string;
  date: string;
  balance: number;
  note?: string;
  createdAt?: string;
};

/** net_worth_history/{id} — Daily Snapshot feature. One row per user/day. */
export type NetWorthSnapshot = {
  id?: string;
  userId: string;
  date: string;
  cashBalance: number;
  bankBalance: number;
  walletBalance: number;
  investmentValue: number;
  netWorth: number;
  createdAt?: string;
};

export type PurposeShareRole = "viewer";

export type PurposeShare = {
  id: string;
  ownerId: string;
  viewerEmail: string;
  viewerUid?: string;
  purposeId: string;
  role: PurposeShareRole;
  /** Set on viewer claims minted from a no-login share link. */
  linkToken?: string;
  /** Narrows the share to one contributor's transactions within the
   * purpose; undefined means every contributor. */
  contributorId?: string;
  /** spec §2.15 */
  expiresAt?: string;
  status: PurposeShareStatus;
  /** Denormalized rollup of shareAccessLogs (spec §2.15) — updated atomically
   * alongside each shareAccessLogs write via logShareAccess(). */
  lastViewedAt?: string;
  totalViews: number;
  createdAt: string;
};

export type ViewerGrant = {
  id: string;
  ownerId: string;
  viewerUid: string;
  purposeIds: string[];
  updatedAt: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  photoUrl?: string;
};

export type UserRole = "user" | "admin";

export type ThemePreference = "light" | "dark" | "system";

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  photoURL?: string;
  phone?: string;
  joinedAt?: string;
  role?: UserRole;
};

/** User profile row keyed to auth.users(id). */
export type UserDocument = UserProfile & {
  settings: UserSettings;
  updatedAt?: string;
};

export type DashboardKpiKey =
  | "net-worth"
  | "total-income"
  | "total-expense"
  | "net-savings"
  | "cash-in-hand"
  | "bank-balance"
  | "investment-value"
  | "monthly-balance";

export type NotificationPreferences = {
  dailySummary?: boolean;
  weeklySummary?: boolean;
  monthlySummary?: boolean;
  salaryAlerts?: boolean;
  budgetAlerts?: boolean;
  dailyLimitAlerts?: boolean;
  burnRateAlerts?: boolean;
  settlementReminders?: boolean;
  snapshotReminders?: boolean;
};

export type UserSettings = {
  theme: ThemePreference;
  notifications: boolean;
  notificationPreferences?: NotificationPreferences;
  /** spec §2.1 (renamed from defaultAccount) */
  defaultAccountId: string;
  monthlySafeSpendingAlert: boolean;
  privateMode: boolean;
  /** Whether dashboard analytics and reports include outing expenses (default false) */
  includeOutingExpenses?: boolean;
  /** Dashboard KPI card order — LLD §4.10 */
  dashboardKpiCards?: DashboardKpiKey[];
};

export type AppConfig = {
  defaultSafeSpendingPercentage: number;
  maxCategoryLimit: number;
  appVersion: string;
  maintenanceMode: boolean;
  defaultMonthlyBudget: number;
  maxPurposesLimit?: number;
  maxAccountsLimit?: number;
};

export type SmsTemplateRuleType = "debit" | "credit" | "transfer";
export type SmsRuleMode = "upi" | "atm" | "card";

export type SmsTemplateRule = {
  id: string;
  bankName: string;
  type: SmsTemplateRuleType;
  mode: SmsRuleMode;
  templatePattern: string;
  extractionMap?: Record<string, string>;
  keywords: string[];
  /** Training SMS — same idea as mobile template training. */
  sampleMessage?: string;
  similarityThreshold?: number;
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** Matches mobile `SmsRule` training fields (detection / regex rules). */
export type SmsDetectionRule = {
  id: string;
  matchPattern: string;
  containsKeywords: string[];
  excludeKeywords: string[];
  amountPattern?: string;
  namePattern?: string;
  datePattern?: string;
  refPattern?: string;
  accountPattern?: string;
  upiPattern?: string;
  sampleMessage?: string;
  type: string;
  mode: string;
  bankName: string;
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SmsBlockRule = {
  id: string;
  name: string;
  keywords: string[];
  pattern?: string;
  /** Example OTP/promo SMS to block — mobile BlockRule.sampleMessage. */
  sampleMessage?: string;
  similarityThreshold: number;
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type KpiDelta = {
  label: string;
  percent: number | null;
  amount: number | null;
};

export type KpiData = {
  netWorth: number;
  income: number;
  expense: number;
  invested: number;
  savings: number;
  savingsRate: number;
  incomeChange: string;
  expenseChange: string;
  savingsChange: string;
  netWorthDelta: KpiDelta;
  incomeDelta: KpiDelta;
  expenseDelta: KpiDelta;
  savingsDelta: KpiDelta;
  netWorthSparkline: number[];
  incomeSparkline: number[];
  expenseSparkline: number[];
  savingsSparkline: number[];
};

export type DashboardInsights = {
  topCategory: string | null;
  topCategoryAmount: number;
  transactionCount: number;
  expenseRatio: number;
  savingsRate: number;
  averageDailySpend: number;
  highlights: Array<{
    label: string;
    tone: "success" | "warning" | "danger";
    timestamp?: string;
  }>;
};

export type DashboardData = {
  kpis: KpiData;
  insights: DashboardInsights;
  recentTransactions: Transaction[];
  incomeExpenseTrend: Array<{
    day: string;
    income: number;
    expense: number;
  }>;
  incomeExpenseTrend30: Array<{
    day: string;
    income: number;
    expense: number;
  }>;
  topCategories: Array<{
    name: string;
    value: number;
    color: string;
  }>;
};

export type DashboardDatePreset =
  | "last-7-days"
  | "this-month"
  | "last-month"
  | "specific-month"
  | "last-3-months"
  | "last-6-months"
  | "last-12-months"
  | "custom";

export type GlobalFilters = {
  dateFrom: string;
  dateTo: string;
  categories: string[];
  account: string;
  source: string;
  search: string;
  minAmount: string;
  maxAmount: string;
  transactionType: "" | "income" | "expense";
  dashboardMonth: string;
  dashboardDatePreset: DashboardDatePreset;
  purposeId: string;
  contributorSource: "" | ContributorSource;
  specificMonth: string;
};

export type AnalyticsDatePreset =
  | "this-month"
  | "last-month"
  | "last-3-months"
  | "this-year"
  | "custom";

export type AnalyticsSortBy =
  | "newest"
  | "oldest"
  | "amount-high"
  | "amount-low"
  | "merchant-az"
  | "category-az";

export type OutingFilterType =
  | ""
  | "trip"
  | "movies"
  | "dinner"
  | "temple"
  | "vacation"
  | "shopping"
  | "other";

export type OutingWithWhomFilter =
  | ""
  | "alone"
  | "friends"
  | "family"
  | "colleagues";

export type AnalyticsCompareMode =
  | ""
  | "previous-month"
  | "avg-3-months"
  | "avg-6-months";

export type AnalyticsFilters = GlobalFilters & {
  purpose: string;
  merchant: string;
  transactionStatus: "" | TransactionStatus;
  tags: string[];
  categoryGroup: string;
  sortBy: AnalyticsSortBy;
  outingType: OutingFilterType;
  outingWithWhom: OutingWithWhomFilter;
  outingStatus: "" | OutingStatus;
  trendGranularity: "daily" | "weekly";
  datePreset: AnalyticsDatePreset;
  compareMode: AnalyticsCompareMode;
};

/**
 * A named, reusable filter template — Account + Purpose + Category + Contributor.
 * Deliberately excludes date/month: a Smart View applies its dimensional
 * filters on top of whatever month is currently selected, never its own.
 */
export type SmartView = {
  id: string;
  userId: string;
  name: string;
  accountId: string | null;
  purposeId: string | null;
  categoryIds: string[];
  contributorId: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AnalyticsHeroStats = {
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  savingsRate: number;
  investmentTotal: number;
  investmentRate: number;
  transactionCount: number;
};

export type PlanComparisonSummary = {
  plannedTotal: number;
  actualTotal: number;
  variancePercent: number;
  status: "under" | "over" | "on-track";
  message: string;
};

export type PlanAllocation = {
  id: string;
  category: string;
  plannedAmount: number;
  color: string;
  notes?: string;
  /** Spec A3 — carry unused budget from this category into next month. */
  rollover?: boolean;
};

export type PlanChangeType =
  | "budget_updated"
  | "safe_limit_changed"
  | "income_updated"
  | "allocation_changed";

export type PlanChangeHistoryEntry = {
  date: string;
  type: PlanChangeType;
  oldValue?: number;
  newValue?: number;
  changedBy?: string;
  note?: string;
};

export type MonthlyPlan = {
  id: string;
  userId?: string;
  month: string;
  title?: string;
  purposeId?: string;
  expectedIncome: number;
  allocations: PlanAllocation[];
  /** @deprecated Templates live in planTemplates collection */
  templateName?: string;
  /** @deprecated Templates live in planTemplates collection */
  isTemplate?: boolean;
  budgetSetAt?: string;
  isBudgetLocked?: boolean;
  dailySafeLimit?: number;
  totalPlanned?: number;
  savingsTarget?: number;
  monthlyBudget?: number;
  safeSpendingLimit?: number;
  totalIncome?: number;
  totalExpense?: number;
  remainingBudget?: number;
  savingsRate?: number;
  changeHistory?: PlanChangeHistoryEntry[];
  lastModifiedBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PlanTemplate = {
  id: string;
  userId?: string;
  name: string;
  description?: string;
  expectedIncome: number;
  allocations: PlanAllocation[];
  createdAt?: string;
  updatedAt?: string;
};

export type PlanSuggestion = {
  category: string;
  currentAmount: number;
  suggestedAmount: number;
  savings: number;
};

export type PlanBudgetStatus = "within" | "slight-over" | "over";

/** @deprecated Use UserSettings — kept for backward-compatible reads */
export type Preferences = Pick<UserSettings, "privateMode" | "theme">;

export type Reflection = {
  id: string;
  userId?: string;
  weekStart: string;
  mood: number;
  wins: string;
  unnecessarySpend: string;
  planAdherence: number;
  planAdherenceNote?: string;
  differentNextWeek: string;
  standoutTransactions?: string;
  aiSummary?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PersonalizedSuggestion = {
  id: string;
  title: string;
  message: string;
  tone: "success" | "warning" | "info";
  category?: string;
};

export type AIWeeklySummary = {
  patterns: string[];
  suggestions: string[];
  encouragement: string;
  narrative: string;
};

export type AlertSeverity = "low" | "medium" | "high";

export type AlertType =
  | "burn-rate"
  | "plan-deviation"
  | "daily-limit"
  | "budget-threshold"
  | "reflection-reminder"
  | "income"
  | "daily-summary"
  | "weekly-summary"
  | "monthly-summary"
  | "snapshot-reminder"
  | "settlement-reminder";

export type SmartAlert = {
  id: string;
  userId?: string;
  type: AlertType;
  title: string;
  message: string;
  severity: AlertSeverity;
  read: boolean;
  createdAt: string;
};

export type IncomeStream = {
  id: string;
  userId?: string;
  source: string;
  amount: number;
  frequency: "monthly" | "one-time";
  lastReceived?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type IncomeTargets = {
  target3Months: number;
  target6Months: number;
  target12Months: number;
  activeHorizon: 3 | 6 | 12;
};

export type SavingsGoal = {
  id: string;
  userId?: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  monthlyContribution?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type NetWorthBreakdown = {
  total: number;
  bankAccounts: number;
  cash: number;
  investmentValue: number;
  monthlyChange: number;
};

export type WealthFilter =
  | { type: "all" }
  | { type: "segment"; segment: "bank" | "cash" | "investment" }
  | { type: "account"; accountName: string };

export type NetWorthHistoryPoint = {
  month: string;
  label: string;
  netWorth: number;
};

export type EmergencyFundHealth = {
  liquidBalance: number;
  monthlyExpenses: number;
  monthsCovered: number;
  status: "healthy" | "moderate" | "low";
  message: string;
};

export type FutureSelfInputs = {
  currentAge: number;
  monthlySavings: number;
  incomeGrowthRate: number;
  investmentReturnRate: number;
};

export type ProjectionMilestone = {
  age: number;
  netWorth: number;
};

export type ProjectionScenario = {
  id: "current" | "disciplined" | "aggressive";
  label: string;
  milestones: ProjectionMilestone[];
  chartData: Array<{ age: number; label: string; netWorth: number }>;
};

export type TripMember = {
  id: string;
  name: string;
  upiId?: string;
  friendId?: string;
  isCurrentUser?: boolean;
};

export type OutingStatus = "active" | "completed" | "archived" | "cancelled";

export type OutingSummary = {
  totalIncome: number;
  totalExpense: number;
};

/** Default system outing categories (seeded in outing_categories table). */
export const OUTING_CATEGORIES = [
  "Trip",
  "Temple",
  "Restaurant",
  "Movies",
  "Family",
  "Work",
  "Other",
] as const;

export type OutingCategory = (typeof OUTING_CATEGORIES)[number] | string;

export type OutingCategoryRow = {
  id: string;
  userId?: string;
  name: string;
  sortOrder?: number;
  isSystem?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Outing = {
  id: string;
  userId?: string;
  name: string;
  category?: string;
  location?: string;
  budget?: number;
  startDate: string;
  endDate?: string;
  status: OutingStatus;
  /** Purpose applied to this outing's rollup + auto-linked transactions. */
  purposeId?: string;
  members: TripMember[];
  autoAddMode: boolean;
  createdBy?: string;
  title?: string;
  description?: string;
  participants?: string[];
  totalSpent?: number;
  summary?: OutingSummary;
  /** spec §2.0(c) — new soft-delete pattern for outings. */
  isActive?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Auto-created behind the scenes for a "Friend split" on a normal
   * transaction — hidden from the Outings list and outing pickers. */
  isQuickSplit?: boolean;
};

export type AiInsightType = "financial_health";

export type AiInsight = {
  id: string;
  userId: string;
  month: string;
  type: AiInsightType;
  healthScore: number;
  summary: string;
  tips: string[];
  generatedAt: string;
};

export type FinancialInsightCategory = {
  name: string;
  amount: number;
  percentage: number;
};

export type FinancialInsightContext = {
  month: string;
  monthLabel: string;
  totalIncome: number;
  totalExpense: number;
  savings: number;
  savingsRate: number;
  budgetUtilization: number;
  daysUnderSafeLimit: number;
  daysTracked: number;
  topCategories: FinancialInsightCategory[];
  dailyAverageSpend: number;
  safeSpendingLimit: number;
  daysOverSafeLimit: number;
  burnRate: string;
  baseHealthScore: number;
  healthScore: number;
  weekendSpendRatio?: number;
};

export type AiChatRole = "user" | "assistant";

export type AiChatMessage = {
  id: string;
  userId?: string;
  role: AiChatRole;
  content: string;
  timestamp: string;
};

export type FriendshipStatus = "pending" | "accepted" | "blocked";

/** Future social graph — use friendships/ collection when implemented */
export type Friendship = {
  id: string;
  userId1: string;
  userId2: string;
  status: FriendshipStatus;
  createdAt?: string;
};

export type SplitType = "equally" | "solo" | "custom";

export type ExpenseSplit = {
  memberId: string;
  amount: number;
};

export type OutingExpense = {
  id: string;
  userId?: string;
  outingId: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  paidByMemberId: string;
  splitType: SplitType;
  splits: ExpenseSplit[];
  source: "manual" | "bank-detected";
  linkedTransactionId?: string;
  /** Paying account display name (Cash, bank name, …). */
  accountName?: string;
  /** Cash | Online | Bank | Wallet — how it was paid. */
  paymentMode?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type OutingSettlement = {
  id: string;
  userId?: string;
  outingId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  date: string;
  note?: string;
  createdAt?: string;
};

/**
 * A one-off shared expense between friends — a restaurant bill, a taxi fare.
 * Standalone by design: a friend split never creates an outing, an outing
 * expense, outing members or an outing settlement.
 */
export type FriendSplit = {
  id: string;
  userId?: string;
  /** The personal-ledger transaction this split describes. */
  transactionId: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  /** Roster for this single split — "me" plus the friends involved. */
  members: TripMember[];
  paidByMemberId: string;
  splitType: SplitType;
  splits: ExpenseSplit[];
  accountName?: string;
  paymentMode?: string;
  note?: string;
  isActive?: boolean;
  deletedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type FriendSettlement = {
  id: string;
  userId?: string;
  friendSplitId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  date: string;
  note?: string;
  createdAt?: string;
};

export type Friend = {
  id: string;
  userId?: string;
  name: string;
  upiId?: string;
  upiIds?: string[];
  phone?: string;
  email?: string;
  notes?: string;
  /** spec §2.0(c) — new soft-delete pattern for friends. */
  isActive?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TripSummary = {
  totalSpent: number;
  yourShare: number;
  pendingSettlements: number;
};

// --- FIRESTORE_REBUILD_SPEC new collections ---

/** transactionSplits/{id} — spec §2.7. Source of truth for per-purpose math. */
export type TransactionSplit = {
  id: string;
  transactionId: string;
  userId: string;
  purposeId: string;
  categoryId: string;
  contributorId?: string;
  outingId?: string;
  amount: number;
  note?: string;
};

/**
 * transaction_items/{id} — one purchased line item on a transaction.
 * Separate table from transaction_splits: this describes *what* was bought,
 * splits describe *how the amount is allocated*. Never reuses split rows.
 */
export type TransactionItem = {
  id: string;
  transactionId: string;
  userId: string;
  name: string;
  categoryId?: string;
  amount: number;
  position?: number;
};

/** budgetTemplates/{id} — spec §2.9. */
export type BudgetTemplate = {
  id: string;
  userId: string;
  templateName: string;
  expectedIncome: number;
  allocations: {
    categoryId: string;
    plannedAmount: number;
    color: string;
    notes?: string;
  }[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

/** settlements/{id} — spec §2.14 (replaces outingSettlements). */
export type Settlement = {
  id: string;
  userId: string;
  outingId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  isPartial: boolean;
  date: string;
  note?: string;
  createdAt: string;
};

/** shareLinks/{token} — spec §2.15. Doc id IS the secret token. */
export type ShareLink = {
  ownerId: string;
  purposeId: string;
  purposeName: string;
  viewerEmail: string;
  expiresAt?: string;
  createdAt: string;
};

/** shareAccessLogs/{id} — spec §2.16. */
export type ShareAccessLog = {
  id: string;
  shareId: string;
  ownerId: string;
  purposeId: string;
  token: string;
  viewedAt: string;
  page: string;
  device?: string;
  browser?: string;
  os?: string;
  country?: string;
};

/** auditLogs/{id} — spec §2.17. Append-only. */
export type AuditLogAction = "create" | "update" | "delete";

export type AuditLog = {
  id: string;
  userId: string;
  collection: string;
  documentId: string;
  action: AuditLogAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  timestamp: string;
};

/** backupHistory/{id} — spec §2.18. */
export type BackupHistoryEntry = {
  id: string;
  userId: string;
  type: "automatic" | "manual";
  frequency?: "daily" | "weekly" | "monthly";
  storagePath?: string;
  sizeBytes?: number;
  schemaVersion: string;
  manifest: string[];
  status: "success" | "failed";
  errorMessage?: string;
  createdAt: string;
};

/** globalSettings.defaultCategories[] — spec §2.19. Admin-owned, shared. */
export type DefaultCategory = {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  order: number;
  isInvestment?: boolean;
};

/** globalSettings/app — spec §2.19. Single shared doc. */
export type GlobalSettings = AppConfig & {
  id: "app";
  maxContributorsLimit?: number;
  defaultCategories: DefaultCategory[];
};

/** PurposeShare status + link fields — spec §2.15. */
export type PurposeShareStatus = "pending" | "active" | "revoked";

export type ReportType = "monthly" | "custom" | "plan-vs-actual";

export type FinancialReportData = {
  title: string;
  periodLabel: string;
  generatedAt: string;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  savingsRate: number;
  categories: Array<{ name: string; amount: number; percent: number }>;
  topMerchants: Array<{ merchant: string; amount: number }>;
  planSummary?: {
    plannedTotal: number;
    actualTotal: number;
    variancePercent: number;
    message: string;
  };
  narrative: string;
};
