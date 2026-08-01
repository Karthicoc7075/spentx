import {
  ArrowDownCircle,
  ArrowUpCircle,
  Briefcase,
  Car,
  CreditCard,
  HeartPulse,
  Home,
  LineChart,
  LucideIcon,
  Receipt,
  ShoppingBag,
  Sparkles,
  Store,
  UtensilsCrossed,
  Zap,
  Heart,
  Play,
  Book,
  Plane,
  FileText,
  User,
  Gift,
  MoreHorizontal,
  TrendingUp,
  Award,
  Percent,
  Plus,
} from "lucide-react";
import type { Transaction, TransactionType } from "@/types";

export type TransactionTypeMeta = {
  label: string;
  description: string;
  icon: LucideIcon;
  sheetTitle: string;
  sheetDescription: string;
  accent: {
    border: string;
    surface: string;
    icon: string;
    text: string;
    button: string;
    preview: string;
  };
};

export const transactionTypeMeta: Record<TransactionType, TransactionTypeMeta> = {
  expense: {
    label: "Expense",
    description: "Track money going out",
    icon: ArrowDownCircle,
    sheetTitle: "Add expense",
    sheetDescription: "Record spending with category, account, and purpose details.",
    accent: {
      border: "border-red-200 dark:border-red-500/25",
      surface: "bg-red-50 dark:bg-red-500/10",
      icon: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
      text: "text-red-600 dark:text-red-400",
      button: "bg-primary text-primary-foreground hover:bg-primary/90",
      preview: "from-red-50/90 via-transparent to-transparent dark:from-red-500/10",
    },
  },
  income: {
    label: "Income",
    description: "Track money coming in",
    icon: ArrowUpCircle,
    sheetTitle: "Add income",
    sheetDescription: "Capture earnings with source, account, and category details.",
    accent: {
      border: "border-emerald-200 dark:border-emerald-500/25",
      surface: "bg-emerald-50 dark:bg-emerald-500/10",
      icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
      text: "text-emerald-600 dark:text-emerald-400",
      button: "bg-primary text-primary-foreground hover:bg-primary/90",
      preview: "from-emerald-50/90 via-transparent to-transparent dark:from-emerald-500/10",
    },
  },
};

const categoryIconMap: Record<string, LucideIcon> = {
  // Expenses
  "Food & Dining": UtensilsCrossed,
  "Groceries": ShoppingBag,
  "Transportation": Car,
  "Rent / Housing": Home,
  "Utilities": Zap,
  "Healthcare": Heart,
  "Entertainment": Play,
  "Shopping": Store,
  "Education": Book,
  "Travel": Plane,
  "Bills & EMI": FileText,
  "Personal Care": User,
  "Gifts & Donations": Gift,
  "Miscellaneous": MoreHorizontal,
  
  // Income
  "Salary": Briefcase,
  "Freelance / Business": TrendingUp,
  "Investments": TrendingUp,
  "Rental Income": Home,
  "Bonus": Award,
  "Gifts Received": Gift,
  "Interest": Percent,
  "Other Income": Plus,
  
  // Legacy / Fallbacks
  "Freelance": Sparkles,
  "Dining": UtensilsCrossed,
  "Rent": Home,
  "Health": HeartPulse,
  "Subscriptions": CreditCard,
  "Investment": LineChart,
};

export function getCategoryIcon(name: string): LucideIcon {
  return categoryIconMap[name] ?? Receipt;
}

export function getTransactionAmountClass(type: TransactionType) {
  return type === "income"
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
}

export function getTransactionTypeMeta(type: TransactionType) {
  return transactionTypeMeta[type];
}

/**
 * Title / Itemization display precedence (shared by web list views; the
 * Flutter app mirrors this logic in `Transaction.displayTitle`):
 *   1. 2+ items  -> merchant name + "{n} Items" indicator.
 *   2. a title   -> the title, in place of the merchant name.
 *   3. otherwise -> the merchant name (unchanged default behavior).
 * Independent of Split Expense — never reads `splits`/`hasSplits`.
 */
export function getTransactionDisplayTitle(transaction: Transaction): {
  primary: string;
  itemsLabel?: string;
} {
  const itemCount = transaction.items?.length ?? 0;
  if (itemCount >= 2) {
    return { primary: transaction.merchant, itemsLabel: `${itemCount} Items` };
  }
  if (transaction.title?.trim()) {
    return { primary: transaction.title.trim() };
  }
  return { primary: transaction.merchant };
}