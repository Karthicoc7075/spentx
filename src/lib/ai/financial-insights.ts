import {
  calculateDailySafeSpending,
  isTransactionInMonth,
} from "@/lib/calculators/dailyLimit";
import {
  buildHealthScoreMetrics,
  calculateBaseHealthScore,
  countDaysOverSafeLimit,
  resolveFinalHealthScore,
} from "@/lib/financial-health";
import { isSpendingExpense } from "@/lib/investments";
import { formatPlanMonth, sumPlanned } from "@/lib/plan";
import type {
  AiInsight,
  FinancialInsightContext,
  MonthlyPlan,
  Transaction,
} from "@/types";

export type GeneratedFinancialInsight = Pick<
  AiInsight,
  "summary" | "tips" | "healthScore"
>;

export function aiInsightDocId(
  userId: string,
  month: string,
  type: AiInsight["type"] = "financial_health",
) {
  return `${userId}_${month}_${type}`;
}

function sumByType(transactions: Transaction[], type: Transaction["type"]) {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
}

function getBurnRateLabel(burnPercent: number) {
  if (burnPercent >= 95) return "High";
  if (burnPercent >= 75) return "Moderate";
  if (burnPercent >= 50) return "Steady";
  return "Low";
}

export function buildFinancialInsightContext(
  transactions: Transaction[],
  plan: MonthlyPlan | null | undefined,
  month: string,
  baseHealthScore?: number,
): FinancialInsightContext {
  const monthTransactions = transactions.filter((transaction) =>
    isTransactionInMonth(transaction, month),
  );
  const expenses = monthTransactions.filter(isSpendingExpense);
  const totalIncome = sumByType(monthTransactions, "income");
  const totalExpense = expenses.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );
  const savings = totalIncome - totalExpense;

  const categoryTotals = new Map<string, number>();
  for (const transaction of expenses) {
    categoryTotals.set(
      transaction.category,
      (categoryTotals.get(transaction.category) ?? 0) + transaction.amount,
    );
  }

  const topCategories = [...categoryTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({
      name,
      amount,
      percentage:
        totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
    }));

  const plannedTotal = plan ? sumPlanned(plan.allocations) : 0;
  const dailyLimit = calculateDailySafeSpending({
    plannedTotal,
    transactions,
    month,
  });

  const healthMetrics = buildHealthScoreMetrics({
    month,
    income: totalIncome,
    expense: totalExpense,
    planned: plannedTotal,
    dailySafeLimit: dailyLimit.dailySafeLimit,
    transactions,
  });

  const baseScore =
    baseHealthScore ?? calculateBaseHealthScore(healthMetrics);

  const burnPercent =
    plannedTotal > 0
      ? Math.round((totalExpense / plannedTotal) * 100)
      : healthMetrics.budgetUtilization;

  let weekendSpend = 0;
  let weekdaySpend = 0;
  for (const transaction of expenses) {
    const day = new Date(transaction.date).getDay();
    if (day === 0 || day === 6) weekendSpend += transaction.amount;
    else weekdaySpend += transaction.amount;
  }
  const weekendSpendRatio =
    weekendSpend + weekdaySpend > 0
      ? Math.round((weekendSpend / (weekendSpend + weekdaySpend)) * 100)
      : undefined;

  const daysOverSafeLimit = countDaysOverSafeLimit(
    transactions,
    month,
    dailyLimit.dailySafeLimit > 0
      ? dailyLimit.dailySafeLimit
      : healthMetrics.income > 0
        ? Math.round(healthMetrics.income / healthMetrics.daysTracked)
        : 0,
  );

  return {
    month,
    monthLabel: formatPlanMonth(month),
    totalIncome,
    totalExpense,
    savings,
    savingsRate: healthMetrics.savingsRate,
    budgetUtilization: healthMetrics.budgetUtilization,
    daysUnderSafeLimit: healthMetrics.daysUnderSafeLimit,
    daysTracked: healthMetrics.daysTracked,
    topCategories,
    dailyAverageSpend: healthMetrics.avgDailySpend,
    safeSpendingLimit: dailyLimit.dailySafeLimit,
    daysOverSafeLimit,
    burnRate: getBurnRateLabel(burnPercent),
    baseHealthScore: baseScore,
    healthScore: baseScore,
    weekendSpendRatio,
  };
}

export function buildRuleBasedFinancialInsights(
  context: FinancialInsightContext,
): GeneratedFinancialInsight {
  const topCategory = context.topCategories[0];
  const tips: string[] = [];

  if (context.savingsRate >= 40) {
    tips.push(
      `Excellent savings rate of ${context.savingsRate}% — you're keeping ₹${context.savings.toLocaleString("en-IN")} this month.`,
    );
  }

  if (topCategory) {
    tips.push(
      `${topCategory.name} is your top spending category at ₹${topCategory.amount.toLocaleString("en-IN")} (${topCategory.percentage}% of expenses).`,
    );
  }

  if (context.daysOverSafeLimit > 0) {
    tips.push(
      `You crossed your daily safe spending limit on ${context.daysOverSafeLimit} day(s). Pace discretionary spends earlier in the week.`,
    );
  } else if (context.safeSpendingLimit > 0) {
    tips.push(
      `Strong discipline — you stayed within your daily safe limit of ₹${context.safeSpendingLimit.toLocaleString("en-IN")} on all tracked days.`,
    );
  }

  if (context.budgetUtilization > 90) {
    tips.push(
      `Budget utilization is ${context.budgetUtilization}%. Review discretionary categories to protect your savings.`,
    );
  } else if (context.savingsRate < 20) {
    tips.push(
      `Savings rate is ${context.savingsRate}%. Aim for 20–30% by trimming non-essential spends.`,
    );
  }

  const summary =
    context.savingsRate >= 40
      ? `Strong month in ${context.monthLabel}: ₹${context.totalExpense.toLocaleString("en-IN")} spent against ₹${context.totalIncome.toLocaleString("en-IN")} income with a ${context.savingsRate}% savings rate.`
      : `In ${context.monthLabel}, you spent ₹${context.totalExpense.toLocaleString("en-IN")} against ₹${context.totalIncome.toLocaleString("en-IN")} income (${context.savingsRate}% savings rate). Burn rate is ${context.burnRate.toLowerCase()}.`;

  return {
    healthScore: context.baseHealthScore,
    summary,
    tips: tips.slice(0, 4),
  };
}

export async function generateFinancialInsights(
  context: FinancialInsightContext,
): Promise<GeneratedFinancialInsight> {
  const baseScore = context.baseHealthScore;
  const ruleBased = buildRuleBasedFinancialInsights(context);
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return ruleBased;
  }

  try {
    const prompt = `You are a financial health analyst for SpentX (India).

Monthly data:
- Income: ₹${context.totalIncome.toLocaleString("en-IN")}
- Expenses: ₹${context.totalExpense.toLocaleString("en-IN")}
- Savings: ₹${context.savings.toLocaleString("en-IN")}
- Savings rate: ${context.savingsRate}%
- Budget utilization: ${context.budgetUtilization}%
- Days under safe spending limit: ${context.daysUnderSafeLimit}/${context.daysTracked}
- Average daily spend: ₹${context.dailyAverageSpend.toLocaleString("en-IN")}
- Rule-based base score: ${baseScore}

Score high (85-95) when savings rate is very high and spending is well controlled.
Score lower when overspending, negative savings, or poor budget discipline.

Return JSON only:
{
  "healthScore": number (0-100),
  "summary": "one line summary under 30 words",
  "tips": ["insight 1", "insight 2", "insight 3"]
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );

    if (!response.ok) {
      return ruleBased;
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return ruleBased;

    const parsed = JSON.parse(text) as GeneratedFinancialInsight;
    if (!parsed.summary || !Array.isArray(parsed.tips) || parsed.tips.length === 0) {
      return ruleBased;
    }

    return {
      healthScore: resolveFinalHealthScore(baseScore, parsed.healthScore),
      summary: parsed.summary,
      tips: parsed.tips.slice(0, 4),
    };
  } catch {
    return ruleBased;
  }
}