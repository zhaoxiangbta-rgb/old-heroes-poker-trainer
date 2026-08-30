import type { Card } from "../../engine/cards";
import type { WeightedCombo } from "../../engine/ranges";
import { classifyPostflopSituation } from "../postflopSituation";
import { classifyPostflopTexture } from "../postflopTexture";
import { replayFixture } from "../replayFixtures";
import type { StrategyResult } from "../types";
import { decidePostflopV3, type DecidePostflopV3Input } from "./postflopStrategy";

export type PostflopAuditIssueCode =
  | "PF3_FREQUENCY_INVALID"
  | "PF3_ACTION_ILLEGAL"
  | "PF3_EV_INVALID"
  | "PF3_VALUE_WITHOUT_WORSE_CONTINUE";

export type PostflopAuditIssue = {
  code: PostflopAuditIssueCode;
  fixtureId: string;
  detail: string;
};

export type PostflopAuditFixture = DecidePostflopV3Input & { fixtureId: string };

export type PostflopAuditReport = {
  fatal: boolean;
  fixtureCount: number;
  independentlyVerified: number;
  unverifiedExpertBaseline: number;
  issues: PostflopAuditIssue[];
};

function combos(items: Array<[[Card, Card], number]>): WeightedCombo[] {
  return items.map(([cards, weight]) => ({ cards, weight, label: cards.join(""), history: [] }));
}

function fixture(
  fixtureId: string,
  hole: [Card, Card],
  board: Card[],
  opponentRange: WeightedCombo[],
): PostflopAuditFixture {
  const request = replayFixture("turn-overbet-set");
  request.state.street = board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river";
  request.state.heroHole = hole;
  request.state.board = board;
  request.state.pot = 40;
  request.state.currentBet = 0;
  const actor = request.state.players.find((player) => player.seat === request.state.actingSeat)!;
  actor.streetBet = 0;
  request.state.legal = {
    canFold: false,
    canCheck: true,
    canCall: false,
    canRaise: true,
    callAmount: 0,
    minRaiseTo: 10,
    maxRaiseTo: actor.stack,
  };
  const texture = classifyPostflopTexture(board);
  return {
    fixtureId,
    request,
    situation: classifyPostflopSituation(request.state, texture),
    opponentRange,
  };
}

export function representativePostflopV3Fixtures(): PostflopAuditFixture[] {
  return [
    fixture("paired-board-trips", ["As", "2s"], ["Ah", "Ac", "7d"], combos([
      [["Ks", "Kc"], 0.3], [["Qh", "Qd"], 0.25], [["Ad", "Kd"], 0.15],
      [["7s", "7c"], 0.1], [["6s", "5s"], 0.2],
    ])),
    fixture("dry-top-pair", ["Ks", "Qd"], ["Kh", "7c", "2d"], combos([
      [["Kc", "Jc"], 0.25], [["Qh", "Qd"], 0.2], [["8s", "8c"], 0.2],
      [["7s", "6s"], 0.15], [["5h", "4h"], 0.2],
    ])),
    fixture("wet-nut-draw", ["Ah", "Jh"], ["Kh", "7h", "4c"], combos([
      [["Ks", "Qc"], 0.25], [["Kc", "Tc"], 0.2], [["Qh", "Th"], 0.2],
      [["8s", "7s"], 0.15], [["6c", "5c"], 0.2],
    ])),
  ];
}

function legal(result: StrategyResult, input: DecidePostflopV3Input) {
  const { legal } = input.request.state;
  return result.actions.every((action) => {
    if (action.action === "fold") return legal.canFold;
    if (action.action === "check") return legal.canCheck;
    if (action.action === "call") return legal.canCall;
    return legal.canRaise && action.toAmount !== undefined &&
      action.toAmount >= legal.minRaiseTo && action.toAmount <= legal.maxRaiseTo;
  });
}

export function auditPostflopStrategy(
  fixtures: readonly PostflopAuditFixture[],
  decide: (input: DecidePostflopV3Input) => StrategyResult = decidePostflopV3,
): PostflopAuditReport {
  const issues: PostflopAuditIssue[] = [];
  for (const { fixtureId, ...input } of fixtures) {
    const result = decide(input);
    const total = result.actions.reduce((sum, action) => sum + action.frequency, 0);
    if (!Number.isFinite(total) || Math.abs(total - 1) > 1e-9 ||
      result.actions.some((action) => !Number.isFinite(action.frequency) || action.frequency <= 0)) {
      issues.push({ code: "PF3_FREQUENCY_INVALID", fixtureId, detail: `total=${total}` });
    }
    if (!legal(result, input)) {
      issues.push({ code: "PF3_ACTION_ILLEGAL", fixtureId, detail: "result contains illegal action" });
    }
    if (result.actions.some((action) => !Number.isFinite(action.ev))) {
      issues.push({ code: "PF3_EV_INVALID", fixtureId, detail: "result contains non-finite EV" });
    }
  }
  return {
    fatal: issues.length > 0,
    fixtureCount: fixtures.length,
    independentlyVerified: 0,
    unverifiedExpertBaseline: fixtures.length,
    issues,
  };
}
