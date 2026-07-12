import type {
  Investment,
  InvestmentDetailType,
  InvestmentDetails,
  Transaction,
} from "@/types";

export const INVESTMENT_CATEGORY = "Investment";

export type InvestmentFieldConfig = {
  key: string;
  label: string;
  type: "text" | "number";
  placeholder?: string;
  required?: boolean;
};

export type InvestmentTypeOption = {
  value: InvestmentDetailType;
  label: string;
  fields: InvestmentFieldConfig[];
};

export const investmentTypeOptions: InvestmentTypeOption[] = [
  {
    value: "mutual-fund",
    label: "Mutual Fund",
    fields: [
      { key: "fundName", label: "Fund Name", type: "text", required: true },
      { key: "folioNumber", label: "Folio Number", type: "text" },
      { key: "units", label: "Units", type: "number" },
      { key: "nav", label: "NAV", type: "number" },
    ],
  },
  {
    value: "stocks",
    label: "Stocks",
    fields: [
      { key: "stockName", label: "Stock Name", type: "text", required: true },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "buyPrice", label: "Buy Price", type: "number" },
      { key: "broker", label: "Broker", type: "text" },
    ],
  },
  {
    value: "gold-etf",
    label: "Gold ETF",
    fields: [
      { key: "etfName", label: "ETF Name", type: "text", required: true },
      { key: "units", label: "Units", type: "number" },
      { key: "price", label: "Price", type: "number" },
    ],
  },
  {
    value: "physical-gold",
    label: "Physical Gold",
    fields: [
      { key: "weightGrams", label: "Weight (grams)", type: "number", required: true },
      { key: "purity", label: "Purity", type: "text" },
      { key: "purchasePrice", label: "Purchase Price", type: "number" },
    ],
  },
  {
    value: "fd",
    label: "Fixed Deposit",
    fields: [
      { key: "bankName", label: "Bank Name", type: "text", required: true },
      { key: "tenure", label: "Tenure", type: "text" },
      { key: "interestRate", label: "Interest Rate (%)", type: "number" },
    ],
  },
  {
    value: "ppf-epf",
    label: "PPF / EPF",
    fields: [
      { key: "accountNumber", label: "Account Number", type: "text", required: true },
      { key: "contributionMonth", label: "Contribution Month", type: "text" },
    ],
  },
  {
    value: "crypto",
    label: "Crypto",
    fields: [
      { key: "coinName", label: "Coin Name", type: "text", required: true },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "buyPrice", label: "Buy Price", type: "number" },
    ],
  },
  {
    value: "other",
    label: "Other",
    fields: [
      { key: "assetName", label: "Asset Name", type: "text", required: true },
      { key: "customField1", label: "Custom Field 1", type: "text" },
      { key: "customField2", label: "Custom Field 2", type: "text" },
    ],
  },
];

export function getInvestmentTypeLabel(type: InvestmentDetailType) {
  return (
    investmentTypeOptions.find((option) => option.value === type)?.label ?? type
  );
}

export function getInvestmentTypeFields(type: InvestmentDetailType) {
  return (
    investmentTypeOptions.find((option) => option.value === type)?.fields ?? []
  );
}

export function isInvestmentCategory(category: string) {
  return category.trim().toLowerCase() === INVESTMENT_CATEGORY.toLowerCase();
}

export function isInvestmentTransaction(transaction: Transaction) {
  return (
    transaction.isInvestment === true ||
    isInvestmentCategory(transaction.category)
  );
}

export function isTransferTransaction(transaction: Transaction) {
  return transaction.category.trim().toLowerCase() === "settlements";
}

export function isSpendingExpense(transaction: Transaction) {
  return (
    transaction.type === "expense" &&
    !isInvestmentTransaction(transaction) &&
    !isTransferTransaction(transaction)
  );
}

export function sumInvestments(transactions: Transaction[]) {
  return transactions
    .filter(isInvestmentTransaction)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function sumSpendingExpenses(transactions: Transaction[]) {
  return transactions
    .filter(isSpendingExpense)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function deriveInvestmentName(
  type: InvestmentDetailType,
  details: InvestmentDetails,
) {
  const nameKeys: Record<InvestmentDetailType, string> = {
    "mutual-fund": "fundName",
    stocks: "stockName",
    "gold-etf": "etfName",
    "physical-gold": "weightGrams",
    fd: "bankName",
    "ppf-epf": "accountNumber",
    crypto: "coinName",
    other: "assetName",
  };

  const key = nameKeys[type];
  const value = details[key];

  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") {
    if (type === "physical-gold") return `Gold · ${value}g`;
    return String(value);
  }

  return getInvestmentTypeLabel(type);
}

export type InvestmentFormValues = {
  amount: number;
  date: string;
  account: string;
  note?: string;
  investmentType: InvestmentDetailType;
  details: InvestmentDetails;
};

export function buildInvestmentRecord(
  values: InvestmentFormValues,
  transactionId: string,
): Omit<Investment, "id" | "userId" | "createdAt" | "updatedAt"> {
  const name = deriveInvestmentName(values.investmentType, values.details);

  return {
    name,
    type: values.investmentType,
    investedAmount: values.amount,
    currentValue: values.amount,
    details: values.details,
    transactionId,
    account: values.account,
    date: new Date(values.date).toISOString(),
    note: values.note,
  };
}

export function buildInvestmentTransaction(
  values: InvestmentFormValues,
  linkedInvestmentId: string,
): Omit<Transaction, "id"> {
  const merchant = deriveInvestmentName(values.investmentType, values.details);

  return {
    type: "expense",
    amount: values.amount,
    merchant,
    category: INVESTMENT_CATEGORY,
    account: values.account,
    purpose: "Personal",
    source: "manual",
    date: new Date(values.date).toISOString(),
    note: values.note,
    isInvestment: true,
    investmentType: values.investmentType,
    investmentDetails: values.details,
    linkedInvestmentId,
  };
}