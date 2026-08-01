import { formatOutingDates } from "@/lib/outing-display";
import { computeSpendingByCategory } from "@/lib/outings";
import type { FinancialReportData, Outing, OutingExpense, TripSummary } from "@/types";

function escapeCsvField(value: string | number | undefined) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function outingExpensesToCsv(expenses: OutingExpense[]) {
  const headers = ["Date", "Description", "Category", "Amount", "Paid by", "Split mode"];

  return [
    headers.join(","),
    ...expenses.map((expense) =>
      [
        expense.date,
        expense.description,
        expense.category,
        expense.amount,
        expense.paidByMemberId,
        expense.splitType,
      ]
        .map(escapeCsvField)
        .join(","),
    ),
  ].join("\n");
}

/** Shapes a single outing's expenses into the same FinancialReportData the
 * regular Analysis-page PDF export uses, so `downloadReportPdf` can be
 * reused unchanged for a per-outing export. */
export function buildOutingReport(
  outing: Outing,
  expenses: OutingExpense[],
  summary: TripSummary,
): FinancialReportData {
  const categoryTotals = computeSpendingByCategory(expenses);
  const total = summary.totalSpent;

  const topExpenses = [...expenses]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
    .map((expense) => ({ merchant: expense.description, amount: expense.amount }));

  return {
    title: outing.name,
    periodLabel: formatOutingDates(outing) || "All time",
    generatedAt: new Date().toISOString(),
    totalIncome: 0,
    totalExpense: total,
    netSavings: -total,
    savingsRate: 0,
    categories: categoryTotals.map((item) => ({
      name: item.name,
      amount: item.amount,
      percent: total > 0 ? Math.round((item.amount / total) * 100) : 0,
    })),
    topMerchants: topExpenses,
    narrative: `${outing.name} cost ${expenses.length} expense${
      expenses.length === 1 ? "" : "s"
    } totalling ₹${total.toLocaleString("en-IN")}, with your share at ₹${summary.yourShare.toLocaleString(
      "en-IN",
    )}.`,
  };
}
