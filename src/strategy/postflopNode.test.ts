import { describe, expect, it } from "vitest";
import type { PublicAction, PublicDecisionState } from "./types";
import { classifyPostflopTexture } from "./postflopTexture";
import { classifyHeadsUpPostflopNode } from "./postflopNode";
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

function headsUpState(actions: PublicAction[]): PublicDecisionState {
  const request = replayFixture("turn-overbet-set");
  request.state.street = "flop";
  request.state.board = ["Ah", "7c", "2s"];
  request.state.actions = actions;
  request.state.actingSeat = 1;
  request.state.buttonSeat = 1;
  request.state.players[0].folded = false;
  request.state.players[1].folded = false;
  return request.state;
}

describe("heads-up postflop node classification", () => {
  it("classifies single-raised, 3-bet and 4-bet pots from public preflop raises", () => {
    const texture = classifyPostflopTexture(["Ah", "7c", "2s"]);
    const open = action("preflop", 0, "raise", 4, 4, 3);
    const threeBet = action("preflop", 1, "raise", 10, 12, 7);
    const fourBet = action("preflop", 0, "raise", 22, 26, 17);

    expect(classifyHeadsUpPostflopNode(headsUpState([open]), texture)?.potType).toBe("srp");
    expect(classifyHeadsUpPostflopNode(headsUpState([open, threeBet]), texture)?.potType).toBe("3bp");
    expect(classifyHeadsUpPostflopNode(headsUpState([open, threeBet, fourBet]), texture)?.potType).toBe("4bp");
  });

  it("recognizes c-bet, delayed c-bet and checked-to opportunities", () => {
    const texture = classifyPostflopTexture(["Ah", "7c", "2s"]);
    const open = action("preflop", 1, "raise", 4, 4, 3);
    const cbet = classifyHeadsUpPostflopNode(headsUpState([open]), texture);
    expect(cbet).toMatchObject({ line: "cbet", initiative: true, inPosition: true });

    const checkedTo = classifyHeadsUpPostflopNode(
      headsUpState([open, action("flop", 0, "check", 0, 0, 9)]),
      texture,
    );
    expect(checkedTo?.line).toBe("cbet");

    const delayedState = headsUpState([
      open,
      action("flop", 0, "check", 0, 0, 9),
      action("flop", 1, "check", 0, 0, 9),
      action("turn", 0, "check", 0, 0, 9),
    ]);
    delayedState.street = "turn";
    delayedState.board = ["Ah", "7c", "2s", "9d"];
    expect(classifyHeadsUpPostflopNode(
      delayedState,
      classifyPostflopTexture(delayedState.board),
    )?.line).toBe("delayed-cbet");
  });

  it("uses the real amount and action-time pot for overbet and raise responses", () => {
    const state = headsUpState([
      action("preflop", 1, "raise", 4, 4, 3),
      action("flop", 1, "bet", 15, 15, 10),
    ]);
    state.actingSeat = 0;
    const node = classifyHeadsUpPostflopNode(
      state,
      classifyPostflopTexture(state.board),
    );
    expect(node).toMatchObject({ line: "facing-bet", facingFraction: 1.5 });

    state.actions.push(action("flop", 0, "raise", 35, 35, 25));
    state.actingSeat = 1;
    expect(classifyHeadsUpPostflopNode(
      state,
      classifyPostflopTexture(state.board),
    )?.line).toBe("facing-raise");
  });

  it("does not label a multiway postflop decision as a heads-up blueprint node", () => {
    const state = replayFixture("four-way-three-checks-to-button").state;
    expect(classifyHeadsUpPostflopNode(
      state,
      classifyPostflopTexture(state.board),
    )).toBeUndefined();
  });
});
