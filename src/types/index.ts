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
  createdAt?: string;
};

export type TransactionSource = "manual" | "mobile" | "bank-sync" | "import";

/** How a transaction was entered (LLD §4.4). */
export type EntrySource = "manual" | "mobile-manual" | "sms-auto-detected";

export type TransactionStatus =
  | "completed"
  | "pending"
  | "failed"
  | "refunded";

export type InvestmentDetailType =
  | "mutual-fund"
  | "stocks"
  | "gold-etf"
  | "physical-gold"
  | "fd"
  | "ppf-epf"
  | "crypto"
  | "other";

export type InvestmentDetails = Record<string, string | number>;

export type Transaction = {
  id: string;
  userId?: string;
  type: TransactionType;
  amount: number;
  merchant: string;
  category: string;
  account: string;
  purpose: string;
  source: TransactionSource;
  /** Canonical entry channel — written to Firestore as entrySource. */
  entrySource?: EntrySource;
  /** Denormalized YYYY-MM for indexed month queries (LLD A6). */
  monthKey?: string;
  date: string;
  time?: string;
  paymentType?: string;
  reference?: string;
  /** Cross-platform alias for reference */
  referenceId?: string;
  upiId?: string;
  note?: string;
  description?: string;
  outingId?: string | null;
  splitWith?: string[];
  isInvestment?: boolean;
  investmentType?: InvestmentDetailType;
  investmentDetails?: InvestmentDetails;
  linkedInvestmentId?: string;
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
  type: "bank" | "cash" | "wallet" | "credit";
  last4?: string;
  openingBalance: number;
  /** YYYY-MM-DD — opening balance applies from this date onward */
  openingBalanceDate?: string;
  createdAt?: string;
  is_active?: boolean;
};

export type Category = {
  id: string;
  userId?: string;
  name: string;
  type: TransactionType;
  color: string;
  icon?: string;
  isDefault?: boolean;
  /** Soft-delete flag — archived categories are never hard-deleted. */
  is_active?: boolean;
};

export type Purpose = {
  id: string;
  userId?: string;
  name: string;
  color?: string;
  /** Soft-delete flag — archived purposes are never hard-deleted. */
  is_active?: boolean;
  isActive?: boolean;
  createdAt?: string;
};

export type BalanceSnapshot = {
  id: string;
  userId: string;
  accountId: string;
  date: string;
  balance: number;
  note?: string;
  createdAt: string;
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

/** Single Firestore document at users/{userId} */
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

export type UserSettings = {
  theme: ThemePreference;
  currency: string;
  notifications: boolean;
  defaultAccount: string;
  monthlySafeSpendingAlert: boolean;
  privateMode: boolean;
  autoSync: boolean;
  /** Cross-platform alias stored in Firestore for mobile */
  autoDetection?: boolean;
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
  isActive: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SmsDetectionRule = {
  id: string;
  matchPattern: string;
  containsKeywords: string[];
  excludeKeywords: string[];
  amountPattern?: string;
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

export type SavedAnalyticsFilterView = {
  id: string;
  name: string;
  filters: AnalyticsFilters;
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
export type Preferences = Pick<UserSettings, "privateMode" | "autoSync" | "theme">;

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
  | "income";

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

export type InvestmentType = InvestmentDetailType;

export type Investment = {
  id: string;
  userId?: string;
  name: string;
  type: InvestmentType;
  investedAmount: number;
  currentValue: number;
  /** Cross-platform single-value field */
  amount?: number;
  growthPercent?: number;
  details?: InvestmentDetails;
  transactionId?: string;
  account?: string;
  date?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
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
  wallet: number;
  investments: number;
  monthlyChange: number;
};

export type WealthFilter =
  | { type: "all" }
  | { type: "segment"; segment: "bank" | "cash" | "wallet" | "investments" }
  | { type: "account"; accountName: string }
  | { type: "investment"; investmentId: string; investmentName: string };

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

export type InvestmentSummary = {
  totalInvested: number;
  totalCurrentValue: number;
  overallReturnPercent: number;
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

export type OutingStatus = "active" | "completed" | "cancelled";

export type OutingSummary = {
  totalIncome: number;
  totalExpense: number;
};

export const OUTING_CATEGORIES = [
  "Trip",
  "Temple",
  "Restaurant",
  "Movies",
  "Other",
] as const;

export type OutingCategory = (typeof OUTING_CATEGORIES)[number];

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
  members: TripMember[];
  autoAddMode: boolean;
  createdBy?: string;
  title?: string;
  description?: string;
  participants?: string[];
  totalSpent?: number;
  summary?: OutingSummary;
  createdAt?: string;
  updatedAt?: string;
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

export type Friend = {
  id: string;
  userId?: string;
  name: string;
  upiId?: string;
  upiIds?: string[];
  phone?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TripSummary = {
  totalSpent: number;
  yourShare: number;
  pendingSettlements: number;
};

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
