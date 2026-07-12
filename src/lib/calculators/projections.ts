import type { FutureSelfInputs, ProjectionScenario } from "@/types";

const MILESTONE_AGES = [25, 30, 40] as const;

type ScenarioConfig = {
  id: ProjectionScenario["id"];
  label: string;
  savingsMultiplier: number;
  incomeGrowthMultiplier: number;
  returnMultiplier: number;
};

const SCENARIO_CONFIGS: ScenarioConfig[] = [
  {
    id: "current",
    label: "Current Habits",
    savingsMultiplier: 1,
    incomeGrowthMultiplier: 1,
    returnMultiplier: 1,
  },
  {
    id: "disciplined",
    label: "Disciplined",
    savingsMultiplier: 1.25,
    incomeGrowthMultiplier: 1.15,
    returnMultiplier: 1,
  },
  {
    id: "aggressive",
    label: "Aggressive",
    savingsMultiplier: 1.5,
    incomeGrowthMultiplier: 1.35,
    returnMultiplier: 1.1,
  },
];

export function projectNetWorthAtAge(
  currentNetWorth: number,
  inputs: FutureSelfInputs,
  targetAge: number,
  config: ScenarioConfig,
) {
  if (targetAge <= inputs.currentAge) return currentNetWorth;

  let wealth = currentNetWorth;
  let monthlyContribution =
    inputs.monthlySavings * config.savingsMultiplier;
  const monthlyReturn =
    (inputs.investmentReturnRate * config.returnMultiplier) / 100 / 12;
  const annualIncomeGrowth =
    (inputs.incomeGrowthRate * config.incomeGrowthMultiplier) / 100;

  for (let age = inputs.currentAge; age < targetAge; age++) {
    for (let month = 0; month < 12; month++) {
      wealth = wealth * (1 + monthlyReturn) + monthlyContribution;
    }
    monthlyContribution *= 1 + annualIncomeGrowth;
  }

  return Math.round(wealth);
}

export function buildScenarioChartData(
  currentNetWorth: number,
  inputs: FutureSelfInputs,
  config: ScenarioConfig,
  maxAge = 40,
) {
  const points: Array<{ age: number; label: string; netWorth: number }> = [];

  for (let age = inputs.currentAge; age <= maxAge; age++) {
    points.push({
      age,
      label: `Age ${age}`,
      netWorth: projectNetWorthAtAge(currentNetWorth, inputs, age, config),
    });
  }

  return points;
}

export function buildProjectionScenarios(
  currentNetWorth: number,
  inputs: FutureSelfInputs,
): ProjectionScenario[] {
  return SCENARIO_CONFIGS.map((config) => ({
    id: config.id,
    label: config.label,
    milestones: MILESTONE_AGES.filter((age) => age >= inputs.currentAge).map(
      (age) => ({
        age,
        netWorth: projectNetWorthAtAge(currentNetWorth, inputs, age, config),
      }),
    ),
    chartData: buildScenarioChartData(currentNetWorth, inputs, config),
  }));
}

export function getScenarioConfigs() {
  return SCENARIO_CONFIGS;
}