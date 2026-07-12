import {
  filterTransactionsForWeek,
  formatWeekLabel,
  getMonthReflections,
} from "@/lib/journal";
import { sumPlanned } from "@/lib/plan";
import type {
  AIWeeklySummary,
  MonthlyPlan,
  Reflection,
  Transaction,
} from "@/types";

export type SummaryContext = {
  reflection: Omit<Reflection, "id" | "aiSummary" | "createdAt" | "updatedAt">;
  transactions: Transaction[];
  monthlyPlan?: MonthlyPlan | null;
  pastReflections?: Reflection[];
};

function formatInr(value: number) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function buildRuleBasedWeeklySummary(
  context: SummaryContext,
): AIWeeklySummary {
  const { reflection, transactions, monthlyPlan } = context;
  const weekTransactions = filterTransactionsForWeek(
    transactions,
    reflection.weekStart,
  );
  const weekExpenses = weekTransactions.filter(
    (transaction) => transaction.type === "expense",
  );
  const topCategory = weekExpenses.reduce<Map<string, number>>((map, transaction) => {
    map.set(
      transaction.category,
      (map.get(transaction.category) ?? 0) + transaction.amount,
    );
    return map;
  }, new Map());

  const leadingCategory = [...topCategory.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

  const weekendSpend = weekExpenses
    .filter((transaction) => {
      const day = new Date(transaction.date).getDay();
      return day === 0 || day === 6;
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const patterns: string[] = [];
  const suggestions: string[] = [];

  if (leadingCategory) {
    patterns.push(
      `${leadingCategory[0]} led your week at ${formatInr(leadingCategory[1])}.`,
    );
  }

  if (reflection.planAdherence >= 80) {
    patterns.push(
      `You stayed close to your plan with ${reflection.planAdherence}% adherence.`,
    );
  } else if (reflection.planAdherence > 0) {
    patterns.push(
      `Plan adherence came in at ${reflection.planAdherence}%, leaving room to tighten discretionary spend.`,
    );
  }

  if (weekendSpend > 0 && leadingCategory) {
    patterns.push(
      `Weekend spending accounted for ${formatInr(weekendSpend)} of the week.`,
    );
  }

  if (reflection.mood <= 2) {
    patterns.push(
      "Your mood rating was lower this week — spending stress may have played a role.",
    );
  }

  if (reflection.unnecessarySpend.trim()) {
    suggestions.push(
      `You called out unnecessary spend: "${reflection.unnecessarySpend.trim()}". Naming it is the first step to changing it.`,
    );
  }

  if (reflection.differentNextWeek.trim()) {
    suggestions.push(
      `Carry this intention into next week: ${reflection.differentNextWeek.trim()}`,
    );
  }

  if (monthlyPlan && leadingCategory) {
    const allocation = monthlyPlan.allocations.find(
      (item) => item.category === leadingCategory[0],
    );
    if (allocation && leadingCategory[1] > allocation.plannedAmount * 0.35) {
      suggestions.push(
        `Try planning ${leadingCategory[0]} purchases earlier in the week — it helped you stay within limits before.`,
      );
    }
  }

  if (suggestions.length === 0) {
    suggestions.push(
      "Keep logging transactions through the week so your reflections get sharper over time.",
    );
  }

  const encouragement =
    reflection.mood >= 4
      ? "Strong week. You're building awareness that compounds into better money habits."
      : reflection.wins.trim()
        ? "You still found a win this week — anchor to that momentum."
        : "Showing up to reflect is a win. Small consistent changes beat perfect months.";

  const narrative = [
    `For ${formatWeekLabel(reflection.weekStart)}, `,
    patterns[0] ?? "your spending patterns are starting to take shape.",
    patterns[1] ? ` ${patterns[1]}` : "",
    reflection.mood <= 3 && reflection.unnecessarySpend
      ? ` Your mood was lower on days tied to ${reflection.unnecessarySpend.slice(0, 60)}${reflection.unnecessarySpend.length > 60 ? "..." : ""}.`
      : "",
    suggestions[0] ? ` ${suggestions[0]}` : "",
  ].join("");

  return {
    patterns,
    suggestions,
    encouragement,
    narrative,
  };
}

export function buildMonthlyReflectionSummary({
  reflections,
  transactions,
  month,
  monthlyPlan,
}: {
  reflections: Reflection[];
  transactions: Transaction[];
  month: string;
  monthlyPlan?: MonthlyPlan | null;
}) {
  const monthReflections = getMonthReflections(reflections, month);
  if (!monthReflections.length) {
    return "No weekly reflections saved for this month yet. Start with one short entry to unlock your monthly narrative.";
  }

  const averageMood =
    monthReflections.reduce((sum, reflection) => sum + reflection.mood, 0) /
    monthReflections.length;
  const averageAdherence =
    monthReflections.reduce(
      (sum, reflection) => sum + reflection.planAdherence,
      0,
    ) / monthReflections.length;

  const plannedTotal = monthlyPlan ? sumPlanned(monthlyPlan.allocations) : 0;
  const [year, monthIndex] = month.split("-").map(Number);
  const monthExpenses = transactions
    .filter((transaction) => {
      if (transaction.type !== "expense") return false;
      const date = new Date(transaction.date);
      return (
        date.getFullYear() === year && date.getMonth() + 1 === monthIndex
      );
    })
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  const wins = monthReflections
    .map((reflection) => reflection.wins.trim())
    .filter(Boolean)
    .slice(0, 2);

  return [
    `Across ${monthReflections.length} weekly reflection${monthReflections.length === 1 ? "" : "s"}, your average mood was ${averageMood.toFixed(1)}/5 and plan adherence averaged ${Math.round(averageAdherence)}%.`,
    plannedTotal > 0
      ? `You planned ${formatInr(plannedTotal)} and spent ${formatInr(monthExpenses)} this month.`
      : null,
    wins.length
      ? `Highlights included: ${wins.join(" · ")}.`
      : "Keep noting weekly wins to strengthen your monthly story.",
    averageAdherence >= 75
      ? "Recommendation: protect the routines that kept you near plan, then redirect one discretionary category into savings."
      : "Recommendation: pick one category to cap next month and review it every Sunday in your journal.",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function generateWeeklySummary(
  context: SummaryContext,
): Promise<AIWeeklySummary> {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return buildRuleBasedWeeklySummary(context);
  }

  try {
    const prompt = `You are a supportive personal finance coach for SpentX, an Indian finance app. Write a concise weekly reflection summary.

Week: ${formatWeekLabel(context.reflection.weekStart)}
Mood: ${context.reflection.mood}/5
Wins: ${context.reflection.wins}
Unnecessary spend: ${context.reflection.unnecessarySpend}
Plan adherence: ${context.reflection.planAdherence}%
Next week intention: ${context.reflection.differentNextWeek}

Return JSON only with keys: patterns (string array, 2-3 items), suggestions (string array, 2-3 items), encouragement (single string), narrative (single warm paragraph combining insights). Use ₹ for amounts. Be encouraging, not scolding.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      return buildRuleBasedWeeklySummary(context);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return buildRuleBasedWeeklySummary(context);

    const parsed = JSON.parse(text) as AIWeeklySummary;
    if (!parsed.narrative) return buildRuleBasedWeeklySummary(context);
    return parsed;
  } catch {
    return buildRuleBasedWeeklySummary(context);
  }
}