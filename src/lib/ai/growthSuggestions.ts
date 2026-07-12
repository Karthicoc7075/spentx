import type { IncomeStream, Transaction } from "@/types";
import type { PersonalizedSuggestion } from "@/types";

function formatInr(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

function getMonthlyFoodSpend(transactions: Transaction[]) {
  const now = new Date();
  return transactions
    .filter((transaction) => {
      if (transaction.type !== "expense") return false;
      const date = new Date(transaction.date);
      return (
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear() &&
        ["Food", "Dining", "Groceries"].includes(transaction.category)
      );
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

export function buildGrowthSuggestions({
  transactions,
  streams,
  currentIncome,
  targetIncome,
}: {
  transactions: Transaction[];
  streams: IncomeStream[];
  currentIncome: number;
  targetIncome: number;
}): PersonalizedSuggestion[] {
  const suggestions: PersonalizedSuggestion[] = [];
  const foodSpend = getMonthlyFoodSpend(transactions);
  const gap = Math.max(0, targetIncome - currentIncome);

  if (foodSpend >= 5000) {
    suggestions.push({
      id: "growth-food-freelance",
      title: "Turn spending insight into income",
      message: `You spend ${formatInr(foodSpend)}/month on Food. Learning advanced Flutter or AI tools could help you earn an extra ${formatInr(15000)}–${formatInr(25000)}/month through freelancing in 4–6 months.`,
      tone: "info",
    });
  }

  if (gap > 0) {
    suggestions.push({
      id: "growth-target-gap",
      title: "Close your income gap",
      message: `You're ${formatInr(gap)} away from your target. Adding one freelance stream or negotiating a raise could close half that gap within a quarter.`,
      tone: "warning",
    });
  }

  const hasFreelance = streams.some((stream) =>
    stream.source.toLowerCase().includes("freelance"),
  );
  if (!hasFreelance && currentIncome > 0) {
    suggestions.push({
      id: "growth-diversify",
      title: "Diversify income",
      message:
        "You rely on a single income source. A side project in your strongest skill area reduces risk and accelerates growth.",
      tone: "info",
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: "growth-start",
      title: "Set your first target",
      message:
        "Add income streams and set a 6-month target. SpentX will connect spending patterns to realistic growth ideas.",
      tone: "success",
    });
  }

  return suggestions.slice(0, 3);
}