import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "../game/game";
import type { DecisionAssessment, WeaknessTag } from "./types";
import {
  chooseAutomaticTarget,
  summarizeWeaknesses,
} from "./curriculum";

function assessment(
  tag: WeaknessTag,
  index: number,
  loss: number,
): DecisionAssessment {
  return {
    scored: true,
    id: `${index}`,
    handNo: index + 1,
    logIndex: index,
    street: "turn",
    actual: { type: "call" },
    recommended: { type: "fold" },
    candidates: [],
    normalizedEvLoss: loss,
    severity: loss <= 0.03 ? "good" : loss <= 0.1 ? "review" : "major",
    intent: "pot-control",
    tags: loss <= 0.03 ? [] : [tag],
    coreRules: [],
    facts: { relevantTags: [tag] },
  };
}

function handWith(items: DecisionAssessment[]): GameState {
  const hand = newGame(items[0]?.handNo ?? 1);
  hand.assessments = items;
  hand.deepReviewStatus = "completed";
  return hand;
}

describe("weakness curriculum", () => {
  it("excludes hands whose deep review did not complete", () => {
    const cancelled = handWith([assessment("overcalling", 1, 0.2)]);
    cancelled.deepReviewStatus = "cancelled";
    const failed = handWith([assessment("overcalling", 2, 0.2)]);
    failed.deepReviewStatus = "failed";
    expect(
      summarizeWeaknesses([cancelled, failed]).every((item) => item.samples === 0),
    ).toBe(true);
  });

  it("does not switch normal training to an automatic specialty after one hand", () => {
    const summaries = summarizeWeaknesses([
      handWith(Array.from({ length: 6 }, (_, i) =>
        assessment("multiway-top-pair", i, 0.2),
      )),
    ]);

    expect(chooseAutomaticTarget(summaries)).toEqual({ mode: "none" });
  });

  it("requires five relevant decisions across multiple hands before issuing a weakness result", () => {
    const collecting = summarizeWeaknesses([
      handWith(Array.from({ length: 4 }, (_, i) => assessment("overcalling", i, 0.2))),
    ]).find((item) => item.tag === "overcalling")!;
    const formal = summarizeWeaknesses(
      Array.from({ length: 5 }, (_, i) =>
        handWith([assessment("overcalling", i, 0.2)]),
      ),
    ).find((item) => item.tag === "overcalling")!;
    expect(collecting).toMatchObject({ status: "collecting", samples: 4 });
    expect(formal).toMatchObject({ status: "weakness", samples: 5 });
  });

  it("distinguishes a clear skill from a formal weakness", () => {
    const summaries = summarizeWeaknesses(
      Array.from({ length: 5 }, (_, i) =>
        handWith([assessment("dirty-outs", i, 0.01)]),
      ),
    );
    expect(summaries.find((item) => item.tag === "dirty-outs")).toMatchObject({
      status: "clear",
      recentAccuracy: 1,
    });
  });

  it("ranks formal weaknesses by weighted loss, error rate and confidence", () => {
    const low = Array.from({ length: 12 }, (_, i) => assessment("overcalling", i, 0.06));
    const high = Array.from({ length: 8 }, (_, i) =>
      assessment("players-behind", i + 20, 0.22),
    );
    const summaries = summarizeWeaknesses(
      [...low, ...high].map((item) => handWith([item])),
    );
    const formal = summaries.filter((item) => item.status === "weakness");
    expect(formal[0].tag).toBe("players-behind");
    expect(chooseAutomaticTarget(summaries)).toEqual({
      mode: "automatic",
      tag: "players-behind",
    });
  });

  it("reports improvement when the latest three losses are lower", () => {
    const losses = [0.22, 0.2, 0.18, 0.06, 0.04, 0.02];
    const summary = summarizeWeaknesses([
      handWith(losses.map((loss, i) => assessment("multiway-top-pair", i, loss))),
    ]).find((item) => item.tag === "multiway-top-pair")!;
    expect(summary.trend).toBe("improving");
  });

  it("uses balanced training when no formal weakness exists", () => {
    expect(chooseAutomaticTarget(summarizeWeaknesses([]))).toEqual({ mode: "none" });
  });

  it("excludes safe-fallback assessments from weakness samples", () => {
    const unscored = assessment("overcalling", 1, 0.2);
    unscored.scored = false;
    const summary = summarizeWeaknesses([handWith([unscored])])
      .find((item) => item.tag === "overcalling")!;
    expect(summary).toMatchObject({ samples: 0, status: "collecting" });
  });
});
