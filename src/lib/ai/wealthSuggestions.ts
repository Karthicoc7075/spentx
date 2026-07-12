import { projectNetWorthAtAge } from "@/lib/calculators/projections";
import type { FutureSelfInputs, PersonalizedSuggestion } from "@/types";

function formatLakh(value: number) {
  if (value >= 100000) {
    return `₹${(value / 100000).toFixed(1)} lakh`;
  }
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function buildWealthInsight({
  currentNetWorth,
  inputs,
}: {
  currentNetWorth: number;
  inputs: FutureSelfInputs;
}): PersonalizedSuggestion {
  const extraSavings = 2000;
  const boostedInputs: FutureSelfInputs = {
    ...inputs,
    monthlySavings: inputs.monthlySavings + extraSavings,
  };

  const currentAt40 = projectNetWorthAtAge(currentNetWorth, inputs, 40, {
    id: "current",
    label: "Current Habits",
    savingsMultiplier: 1,
    incomeGrowthMultiplier: 1,
    returnMultiplier: 1,
  });
  const boostedAt40 = projectNetWorthAtAge(
    currentNetWorth,
    boostedInputs,
    40,
    {
      id: "current",
      label: "Current Habits",
      savingsMultiplier: 1,
      incomeGrowthMultiplier: 1,
      returnMultiplier: 1,
    },
  );
  const difference = boostedAt40 - currentAt40;

  if (difference > 0) {
    return {
      id: "wealth-savings-boost",
      title: "Small change, big future impact",
      message: `If you increase monthly savings by ₹${extraSavings.toLocaleString("en-IN")}, you could have approximately ${formatLakh(difference)} more by age 40.`,
      tone: "info",
    };
  }

  if (inputs.monthlySavings <= 0) {
    return {
      id: "wealth-start-saving",
      title: "Start building wealth today",
      message:
        "Even ₹2,000/month invested at 12% returns can grow to over ₹10 lakh in 20 years. Set a monthly savings target to see your future self projection.",
      tone: "warning",
    };
  }

  return {
    id: "wealth-stay-consistent",
    title: "Consistency compounds",
    message: `At your current pace, you could reach ${formatLakh(currentAt40)} by age 40. Staying disciplined with your Monthly Plan accelerates this further.`,
    tone: "success",
  };
}