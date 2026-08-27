// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { newGame, type GameLog } from "../game/game";
import type { VisualToken } from "../game/useGamePlayback";
import { MobileTableEffects } from "./MobileTableEffects";

function action(actorSeat: number, kind: GameLog["kind"], amount: number): GameLog {
  return {
    street: "flop",
    actorSeat,
    actor: "测试玩家",
    kind,
    action: kind === "fold" ? "弃牌" : "跟注",
    amount,
    toAmount: amount,
    potAfter: 80,
  };
}

function token(id: number, effect: VisualToken["effect"], actorSeat: number, log: GameLog): VisualToken {
  return { id, effect, actorSeat, action: log, expiresAt: Date.now() + 400 };
}

describe("MobileTableEffects", () => {
  afterEach(cleanup);

  it("renders real chip images and two card backs from action events", () => {
    const game = newGame(42);
    const actorSeat = game.players.find((player) => player.seat !== game.heroSeat)!.seat;
    render(<MobileTableEffects
      game={game}
      phase="animating-chips"
      tokens={[
        token(1, "chips", actorSeat, action(actorSeat, "call", 8)),
        token(2, "fold", actorSeat, action(actorSeat, "fold", 0)),
      ]}
    />);

    const chipFlight = screen.getByTestId("mobile-chip-flight");
    const foldFlight = screen.getByTestId("mobile-fold-flight");
    expect(chipFlight.querySelectorAll("img")).toHaveLength(3);
    expect(foldFlight.querySelectorAll("img")).toHaveLength(2);
    expect(chipFlight.querySelector("img")).toHaveAttribute("src", expect.stringMatching(/^\/assets\/poker-visuals\/chips\/wager-/));
    expect(foldFlight.querySelector("img")).toHaveAttribute("src", "/assets/poker-visuals/cards/card-back.png");
  });

  it("renders one bounded collection bundle per settled winner allocation", () => {
    const game = newGame(42);
    game.result = {
      winners: [0, 2],
      summary: "平分",
      reason: "showdown",
      pots: [
        { label: "主池", amount: 120, eligible: [0, 1, 2], winners: [0, 2] },
        { label: "边池 1", amount: 40, eligible: [1, 2], winners: [2] },
      ],
    };
    render(<MobileTableEffects game={game} phase="settling-pot" tokens={[]} />);

    expect(screen.getAllByTestId("mobile-pot-award")).toHaveLength(3);
    expect(document.querySelectorAll(".mobile-pot-award img").length).toBeLessThanOrEqual(12);
  });

  it("does not render settled awards before the settlement phase", () => {
    const game = newGame(42);
    game.result = { winners: [0], summary: "赢得底池", reason: "showdown", pots: [{ label: "主池", amount: 20, eligible: [0, 1], winners: [0] }] };
    render(<MobileTableEffects game={game} phase="hero-turn" tokens={[]} />);
    expect(screen.queryByTestId("mobile-pot-award")).not.toBeInTheDocument();
  });
});
