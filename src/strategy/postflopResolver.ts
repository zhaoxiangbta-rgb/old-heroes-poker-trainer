import type { PostflopHandBucket } from "./postflopHandBucket";
import type { HeadsUpPostflopNode } from "./postflopNode";
import type { StrategyRequest, StrategyResult } from "./types";

function requiresResolution(node: HeadsUpPostflopNode) {
  return node.facingFraction > 1.5 ||
    (node.line === "facing-raise" && node.facingFraction >= 1);
}

export function resolveHeadsUpPostflop(
  base: StrategyResult,
  request: StrategyRequest,
  node: HeadsUpPostflopNode,
  bucket: PostflopHandBucket,
): StrategyResult {
  if (request.deadlineMs <= 1 || !requiresResolution(node) || base.actions.length < 2) {
    return base;
  }
  const iterations = Math.min(32, Math.max(4, Math.floor(request.deadlineMs / 5)));
  const regrets = base.actions.map(() => 0);
  let current = base.actions.map((action) => action.frequency);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const average = base.actions.reduce(
      (sum, action, index) => sum + action.ev * current[index],
      0,
    );
    for (let index = 0; index < regrets.length; index += 1) {
      regrets[index] = Math.max(0, regrets[index] + base.actions[index].ev - average);
    }
    const regretTotal = regrets.reduce((sum, regret) => sum + regret, 0);
    current = base.actions.map((action, index) =>
      action.frequency * 0.75 +
      (regretTotal > 0 ? regrets[index] / regretTotal : action.frequency) * 0.25);
    const total = current.reduce((sum, frequency) => sum + frequency, 0);
    current = current.map((frequency) => frequency / total);
  }

  return {
    ...base,
    actions: base.actions.map((action, index) => ({ ...action, frequency: current[index] })),
    confidence: Math.min(0.82, base.confidence + 0.06),
    source: "blueprint+resolver",
    explanationFacts: {
      ...base.explanationFacts,
      resolverIterations: iterations,
      resolverBudgetMs: request.deadlineMs,
      resolverEquity: bucket.equity,
    },
  };
}
