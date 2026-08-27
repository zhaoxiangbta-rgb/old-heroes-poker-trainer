// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { newGame, positionLabel } from "../game/game";
import { PlayerSeat } from "./PlayerSeat";

describe("PlayerSeat", () => {
  afterEach(cleanup);

  it("keeps portrait, plaque, cards, and wager in separate visual zones", () => {
    const game = newGame(42);
    const player = game.players[0];
    player.streetBet = 8;
    render(
      <PlayerSeat
        player={player}
        seat={0}
        heroSeat={game.heroSeat}
        visibleHoleCount={2}
        phase="hero-turn"
        acting={false}
        thinking={false}
        receiving={false}
      />,
    );
    expect(screen.getByRole("img", { name: `${player.name}的头像` })).toHaveAttribute(
      "src",
      expect.stringMatching(/^\/assets\/poker-visuals\/avatars\//),
    );
    expect(document.querySelector(".player-seat-plaque")).toHaveTextContent(player.name);
    expect(document.querySelector(".player-position-badge")).toHaveTextContent(positionLabel(player.position).name);
    expect(document.querySelector(".player-seat-plaque")).toHaveTextContent(`余码 ${player.stack}`);
    expect(document.querySelector(".player-seat-plaque")).not.toContainElement(
      document.querySelector(".player-position-badge"),
    );
    expect(document.querySelector(".player-seat-hole")).not.toContainElement(
      document.querySelector(".player-seat-wager"),
    );
    expect(document.querySelector(".player-seat-wager img")).toHaveAttribute(
      "src",
      expect.stringMatching(/^\/assets\/poker-visuals\/chips\/wager-/),
    );
  });
});
