import type {
  AnalyticsCompareMode,
  AnalyticsFilters,
  AnalyticsSortBy,
  OutingFilterType,
  OutingWithWhomFilter,
  TransactionStatus,
} from "@/types";

export const analyticsSources = [
  "manual",
  "mobile",
  "bank-sync",
  "import",
] as const;

export const transactionStatusOptions: Array<{
  value: "" | TransactionStatus;
  label: string;
}> = [
  { value: "", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "refunded", label: "Refunded" },
];

export const amountQuickChips = [
  { value: "500", label: "₹500+" },
  { value: "1000", label: "₹1000+" },
  { value: "5000", label: "₹5000+" },
  { value: "10000", label: "₹10000+" },
] as const;

export const categoryGroups: Record<string, string[]> = {
  Food: ["Dining", "Groceries"],
  Home: ["Rent", "Utilities", "Subscriptions"],
  Lifestyle: ["Shopping", "Health", "Transport"],
  Wealth: ["Investment", "Settlements"],
};

export const outingTypeOptions: Array<{
  value: OutingFilterType;
  label: string;
}> = [
  { value: "", label: "All outings" },
  { value: "trip", label: "Trip" },
  { value: "movies", label: "Movies" },
  { value: "dinner", label: "Dinner" },
  { value: "temple", label: "Temple" },
  { value: "vacation", label: "Vacation" },
  { value: "shopping", label: "Shopping" },
  { value: "other", label: "Other" },
];

export const outingWithWhomOptions: Array<{
  value: OutingWithWhomFilter;
  label: string;
}> = [
  { value: "", label: "Anyone" },
  { value: "alone", label: "Alone" },
  { value: "friends", label: "Friends" },
  { value: "family", label: "Family" },
  { value: "colleagues", label: "Colleagues" },
];

export const outingStatusOptions = [
  { value: "", label: "All trips" },
  { value: "active", label: "Active trip" },
  { value: "completed", label: "Completed trip" },
] as const;

export const compareModeOptions: Array<{
  value: Exclude<AnalyticsCompareMode, "">;
  label: string;
}> = [
  { value: "previous-month", label: "Compare Previous Month" },
  { value: "avg-3-months", label: "Average of Last 3 Months" },
  { value: "avg-6-months", label: "Average of Last 6 Months" },
];

export const compareModeLabels: Record<AnalyticsCompareMode, string> = {
  "": "No comparison",
  "previous-month": "Compare Previous Month",
  "avg-3-months": "Average of Last 3 Months",
  "avg-6-months": "Average of Last 6 Months",
};

export const sortByOptions: Array<{ value: AnalyticsSortBy; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount-high", label: "Highest amount" },
  { value: "amount-low", label: "Lowest amount" },
  { value: "merchant-az", label: "Merchant A–Z" },
  { value: "category-az", label: "Category A–Z" },
];

export const presetSavedViews: Array<{
  id: string;
  name: string;
  filters: Partial<AnalyticsFilters>;
}> = [
  {
    id: "monthly-review",
    name: "Monthly Review",
    filters: { datePreset: "this-month", transactionType: "", categories: [] },
  },
  {
    id: "food-analysis",
    name: "Food Analysis",
    filters: {
      transactionType: "expense",
      categoryGroup: "Food",
      categories: ["Dining", "Groceries"],
    },
  },
  {
    id: "salary-analysis",
    name: "Salary Analysis",
    filters: {
      transactionType: "income",
      categories: ["Salary", "Freelance"],
    },
  },
  {
    id: "travel-expenses",
    name: "Travel Expenses",
    filters: { outingType: "trip", transactionType: "expense" },
  },
  {
    id: "festival-spending",
    name: "Festival Spending",
    filters: { tags: ["Festival"], transactionType: "expense" },
  },
];

export const SAVED_VIEWS_STORAGE_KEY = "spentx-analytics-saved-views";