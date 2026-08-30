import { describe, expect, it } from "vitest";
import type { PublicAction, PublicDecisionState } from "./types";
import { classifyPostflopTexture } from "./postflopTexture";
import { classifyPostflopSituation } from "./postflopSituation";
import { replayFixture } from "./replayFixtures";

function action(
  street: PublicAction["street"],
  actorSeat: number,
  kind: PublicAction["kind"],
  amount: number,
  toAmount: number,
  potBefore: number,
): PublicAction {
  return { street, actorSeat, kind, amount, toAmount, potBefore, potAfter: potBefore + amount };
}

function state(
  street: "flop" | "turn" | "river",
  board: PublicDecisionState["board"],
  actions: PublicAction[],
  actingSeat = 0,
): PublicDecisionState {
  const result = replayFixture("turn-overbet-set").state;
  result.street = street;
  result.board = board;
  result.actions = actions;
  result.actingSeat = actingSeat;
  result.buttonSeat = 1;
  result.players[0].position = "BB";
  result.players[1].position = "BTN";
  result.players[0].folded = false;
  result.players[1].folded = false;
  result.players[0].stack = 190;
  result.players[1].stack = 150;
  result.pot = 50;
  return result;
}

const open = action("preflop", 1, "raise", 4, 4, 3);

describe("postflop situation v2", () => {
  it("classifies an out-of-position first-to-act flop with initiative and SPR", () => {
    const input = state("flop", ["Ah", "7c", "2s"], [open], 0);
    const situation = classifyPostflopSituation(input, classifyPostflopTexture(input.board));

    expect(situation).toMatchObject({
      version: 2,
      headsUp: true,
      inPosition: false,
      initiative: false,
      lastToAct: false,
      line: "first-to-act",
      street: "flop",
      spr: 3,
      playersBehind: 1,
    });
  });

  it("separates a turn probe after a check-through from a donk opportunity", () => {
    const checkedThrough = state("turn", ["Ah", "7c", "2s", "6d"], [
      open,
      action("flop", 0, "check", 0, 0, 9),
      action("flop", 1, "check", 0, 0, 9),
    ]);
    expect(classifyPostflopSituation(
      checkedThrough,
      classifyPostflopTexture(checkedThrough.board),
    ).line).toBe("probe");

    const ledIntoAggressor = state("turn", ["Ah", "7c", "2s", "6d"], [
      open,
      action("flop", 0, "check", 0, 0, 9),
      action("flop", 1, "bet", 6, 6, 9),
      action("flop", 0, "call", 6, 6, 15),
    ]);
    expect(classifyPostflopSituation(
      ledIntoAggressor,
      classifyPostflopTexture(ledIntoAggressor.board),
    ).line).toBe("donk");
  });

  it("marks public cards that can shift the nut advantage and replays node ids", () => {
    const input = state("turn", ["Kh", "8c", "7s", "6d"], [
      open,
      action("flop", 0, "check", 0, 0, 9),
      action("flop", 1, "bet", 6, 6, 9),
      action("flop", 0, "call", 6, 6, 15),
    ]);
    const texture = classifyPostflopTexture(input.board);
    const first = classifyPostflopSituation(input, texture);
    const replay = classifyPostflopSituation(structuredClone(input), texture);

    expect(first.rangeShiftCard).toBe(true);
    expect(replay).toEqual(first);
    expect(first.nodeId).toContain("pfs2:turn:srp:oop:noinit:donk");
  });
});
