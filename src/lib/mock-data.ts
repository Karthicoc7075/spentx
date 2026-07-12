import {
  Account,
  AppConfig,
  Category,
  Friend,
  Investment,
  Outing,
  OutingExpense,
  OutingSettlement,
  Purpose,
  SavingsGoal,
  Transaction,
  UserSettings,
} from "@/types";

const today = new Date();

function daysAgo(days: number, hour = 10) {
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  date.setHours(hour, days * 7, 0, 0);
  return date.toISOString();
}

export const mockTransactions: Transaction[] = [
  {
    id: "txn-001",
    type: "expense",
    amount: 1280,
    merchant: "Big Basket",
    category: "Groceries",
    account: "HDFC Bank",
    purpose: "Home",
    source: "mobile",
    date: daysAgo(0, 9),
    reference: "UPI/BB/8421",
  },
  {
    id: "txn-002",
    type: "income",
    amount: 125000,
    merchant: "Acme Payroll",
    category: "Salary",
    account: "HDFC Bank",
    purpose: "Income",
    source: "bank-sync",
    date: daysAgo(1, 8),
  },
  {
    id: "txn-003",
    type: "expense",
    amount: 680,
    merchant: "Uber",
    category: "Transport",
    account: "Amex Card",
    purpose: "Commute",
    source: "mobile",
    date: daysAgo(1, 20),
  },
  {
    id: "txn-004",
    type: "expense",
    amount: 2350,
    merchant: "Mainland China",
    category: "Dining",
    account: "HDFC Bank",
    purpose: "Family",
    source: "manual",
    date: daysAgo(2, 21),
    note: "Weekend dinner",
  },
  {
    id: "txn-005",
    type: "expense",
    amount: 1599,
    merchant: "Amazon",
    category: "Shopping",
    account: "Amazon Pay",
    purpose: "Personal",
    source: "import",
    date: daysAgo(3, 13),
  },
  {
    id: "txn-006",
    type: "expense",
    amount: 8200,
    merchant: "Nestaway",
    category: "Rent",
    account: "HDFC Bank",
    purpose: "Home",
    source: "bank-sync",
    date: daysAgo(4, 11),
  },
  {
    id: "txn-007",
    type: "income",
    amount: 18000,
    merchant: "Freelance Client",
    category: "Freelance",
    account: "ICICI Bank",
    purpose: "Income",
    source: "manual",
    date: daysAgo(5, 16),
  },
  {
    id: "txn-008",
    type: "expense",
    amount: 499,
    merchant: "Spotify",
    category: "Subscriptions",
    account: "Amex Card",
    purpose: "Personal",
    source: "bank-sync",
    date: daysAgo(6, 7),
  },
  {
    id: "txn-009",
    type: "expense",
    amount: 3200,
    merchant: "Apollo Pharmacy",
    category: "Health",
    account: "Cash",
    purpose: "Family",
    source: "mobile",
    date: daysAgo(7, 18),
  },
  {
    id: "txn-010",
    type: "expense",
    amount: 2100,
    merchant: "Tata Power",
    category: "Utilities",
    account: "ICICI Bank",
    purpose: "Home",
    source: "bank-sync",
    date: daysAgo(8, 12),
  },
];

const mockTransactionIds = new Set(mockTransactions.map((transaction) => transaction.id));

export function isMockTransaction(transaction: Transaction) {
  return mockTransactionIds.has(transaction.id);
}

export function withoutMockTransactions(transactions: Transaction[]) {
  return transactions.filter((transaction) => !isMockTransaction(transaction));
}

/** Seeded on sign-up per LLD §9.0 — Cash only */
export const defaultSignupAccounts: Account[] = [
  { id: "acc-cash", name: "Cash", type: "cash", openingBalance: 0, is_active: true },
];

/** Used when re-seeding demo / legacy workspaces */
export const defaultStarterAccounts: Account[] = defaultSignupAccounts;

export const mockAccounts: Account[] = [
  {
    id: "acc-1",
    name: "HDFC Bank",
    type: "bank",
    last4: "8124",
    openingBalance: 285000,
  },
  {
    id: "acc-2",
    name: "ICICI Bank",
    type: "bank",
    last4: "4431",
    openingBalance: 86000,
  },
  {
    id: "acc-3",
    name: "Amex Card",
    type: "credit",
    last4: "1006",
    openingBalance: -42000,
  },
  {
    id: "acc-4",
    name: "Cash",
    type: "cash",
    openingBalance: 12500,
  },
  {
    id: "acc-5",
    name: "Paytm Wallet",
    type: "wallet",
    openingBalance: 4200,
  },
  {
    id: "acc-6",
    name: "PhonePe",
    type: "wallet",
    openingBalance: 7800,
  },
];

export const defaultCategories: Category[] = [
  // Income
  { id: "cat-inc-1", name: "Salary", type: "income", color: "#10b981", isDefault: true },
  { id: "cat-inc-2", name: "Freelance / Business", type: "income", color: "#0ea5e9", isDefault: true },
  { id: "cat-inc-3", name: "Investments", type: "income", color: "#22c55e", isDefault: true },
  { id: "cat-inc-4", name: "Rental Income", type: "income", color: "#6366f1", isDefault: true },
  { id: "cat-inc-5", name: "Bonus", type: "income", color: "#f59e0b", isDefault: true },
  { id: "cat-inc-6", name: "Gifts Received", type: "income", color: "#ec4899", isDefault: true },
  { id: "cat-inc-7", name: "Interest", type: "income", color: "#14b8a6", isDefault: true },
  { id: "cat-inc-8", name: "Other Income", type: "income", color: "#94a3b8", isDefault: true },
  // Expense
  { id: "cat-exp-1", name: "Food & Dining", type: "expense", color: "#f97316", icon: "utensils", isDefault: true },
  { id: "cat-exp-2", name: "Groceries", type: "expense", color: "#22c55e", isDefault: true },
  { id: "cat-exp-3", name: "Transportation", type: "expense", color: "#3b82f6", isDefault: true },
  { id: "cat-exp-4", name: "Rent / Housing", type: "expense", color: "#6366f1", isDefault: true },
  { id: "cat-exp-5", name: "Utilities", type: "expense", color: "#eab308", isDefault: true },
  { id: "cat-exp-6", name: "Healthcare", type: "expense", color: "#ef4444", isDefault: true },
  { id: "cat-exp-7", name: "Entertainment", type: "expense", color: "#a855f7", isDefault: true },
  { id: "cat-exp-8", name: "Shopping", type: "expense", color: "#ec4899", isDefault: true },
  { id: "cat-exp-9", name: "Education", type: "expense", color: "#06b6d4", isDefault: true },
  { id: "cat-exp-10", name: "Travel", type: "expense", color: "#14b8a6", isDefault: true },
  { id: "cat-exp-11", name: "Bills & EMI", type: "expense", color: "#64748b", isDefault: true },
  { id: "cat-exp-12", name: "Personal Care", type: "expense", color: "#f43f5e", isDefault: true },
  { id: "cat-exp-13", name: "Gifts & Donations", type: "expense", color: "#f59e0b", isDefault: true },
  { id: "cat-exp-14", name: "Miscellaneous", type: "expense", color: "#94a3b8", isDefault: true },
  { id: "cat-exp-15", name: "Investment", type: "expense", color: "#6366f1", isDefault: true },
];

export const defaultPurposes: Purpose[] = [
  {
    id: "personal",
    name: "Personal",
    color: "#6366F1",
    is_active: true,
  },
  {
    id: "home",
    name: "Home/Family",
    color: "#14B8A6",
    is_active: true,
  },
];

export const defaultUserSettings: UserSettings = {
  theme: "dark",
  currency: "INR",
  notifications: true,
  defaultAccount: "",
  monthlySafeSpendingAlert: true,
  privateMode: false,
  autoSync: true,
};

/** @deprecated Use defaultUserSettings */
export const defaultPreferences = defaultUserSettings;

export const defaultAppConfig: AppConfig = {
  defaultSafeSpendingPercentage: 40,
  maxCategoryLimit: 20,
  appVersion: "1.0.0",
  maintenanceMode: false,
  defaultMonthlyBudget: 30000,
  maxPurposesLimit: 5,
  maxAccountsLimit: 10,
};

export const mockInvestments: Investment[] = [
  {
    id: "inv-1",
    name: "Nifty 50 Index Fund",
    type: "mutual-fund",
    investedAmount: 50000,
    currentValue: 62000,
  },
  {
    id: "inv-2",
    name: "HDFC Fixed Deposit",
    type: "fd",
    investedAmount: 100000,
    currentValue: 108500,
  },
];

export const mockFriends: Friend[] = [
  {
    id: "friend-1",
    name: "Arjun Mehta",
    upiId: "arjun@okaxis",
    phone: "+91 98765 43210",
  },
  {
    id: "friend-2",
    name: "Priya Sharma",
    upiId: "priya@paytm",
    phone: "+91 91234 56789",
  },
  {
    id: "friend-3",
    name: "Rohan Das",
    upiId: "rohan@ybl",
  },
];

export const mockOutings: Outing[] = [
  {
    id: "outing-1",
    name: "Goa Trip 2026",
    startDate: daysAgo(14).slice(0, 10),
    endDate: daysAgo(7).slice(0, 10),
    status: "active",
    autoAddMode: true,
    members: [
      { id: "member-me", name: "You", isCurrentUser: true, upiId: "you@upi" },
      {
        id: "member-1",
        name: "Arjun Mehta",
        friendId: "friend-1",
        upiId: "arjun@okaxis",
      },
      {
        id: "member-2",
        name: "Priya Sharma",
        friendId: "friend-2",
        upiId: "priya@paytm",
      },
    ],
  },
  {
    id: "outing-2",
    name: "Bangalore Brunch",
    startDate: daysAgo(45).slice(0, 10),
    endDate: daysAgo(45).slice(0, 10),
    status: "completed",
    autoAddMode: false,
    members: [
      { id: "member-me", name: "You", isCurrentUser: true },
      {
        id: "member-3",
        name: "Rohan Das",
        friendId: "friend-3",
        upiId: "rohan@ybl",
      },
    ],
  },
];

export const mockOutingExpenses: OutingExpense[] = [
  {
    id: "exp-1",
    outingId: "outing-1",
    description: "Beach resort booking",
    amount: 18000,
    category: "Stay",
    date: daysAgo(12).slice(0, 10),
    paidByMemberId: "member-me",
    splitType: "equally",
    splits: [
      { memberId: "member-me", amount: 6000 },
      { memberId: "member-1", amount: 6000 },
      { memberId: "member-2", amount: 6000 },
    ],
    source: "manual",
  },
  {
    id: "exp-2",
    outingId: "outing-1",
    description: "Seafood dinner",
    amount: 4500,
    category: "Dining",
    date: daysAgo(10).slice(0, 10),
    paidByMemberId: "member-1",
    splitType: "equally",
    splits: [
      { memberId: "member-me", amount: 1500 },
      { memberId: "member-1", amount: 1500 },
      { memberId: "member-2", amount: 1500 },
    ],
    source: "bank-detected",
    linkedTransactionId: "txn-004",
  },
  {
    id: "exp-3",
    outingId: "outing-1",
    description: "Cab to airport",
    amount: 1200,
    category: "Transport",
    date: daysAgo(8).slice(0, 10),
    paidByMemberId: "member-2",
    splitType: "equally",
    splits: [
      { memberId: "member-me", amount: 400 },
      { memberId: "member-1", amount: 400 },
      { memberId: "member-2", amount: 400 },
    ],
    source: "manual",
  },
  {
    id: "exp-4",
    outingId: "outing-2",
    description: "Brunch at Third Wave",
    amount: 3200,
    category: "Dining",
    date: daysAgo(45).slice(0, 10),
    paidByMemberId: "member-me",
    splitType: "equally",
    splits: [
      { memberId: "member-me", amount: 1600 },
      { memberId: "member-3", amount: 1600 },
    ],
    source: "manual",
  },
];

export const mockOutingSettlements: OutingSettlement[] = [
  {
    id: "settle-1",
    outingId: "outing-2",
    fromMemberId: "member-3",
    toMemberId: "member-me",
    amount: 1600,
    date: daysAgo(44).slice(0, 10),
    note: "UPI settlement",
  },
];

export const mockSavingsGoals: SavingsGoal[] = [
  {
    id: "goal-1",
    name: "Emergency Fund",
    targetAmount: 150000,
    savedAmount: 85000,
    monthlyContribution: 8000,
  },
  {
    id: "goal-2",
    name: "MacBook Pro",
    targetAmount: 180000,
    savedAmount: 42000,
    monthlyContribution: 5000,
  },
];


