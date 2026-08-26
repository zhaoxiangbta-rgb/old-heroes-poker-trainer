// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { newGame } from "../game/game";
import { positionLabel } from "../game/game";
import { MobilePokerTable } from "./MobilePokerTable";
import { mobileVisualSeat } from "./mobileSeatLayout";

describe("MobilePokerTable", () => {
  afterEach(cleanup);

  it("rotates only the visual seat so hero is always mobile seat zero", () => {
    expect(mobileVisualSeat(4, 4, 6)).toBe(0);
    expect(mobileVisualSeat(5, 4, 6)).toBe(1);
    expect(mobileVisualSeat(0, 4, 6)).toBe(2);
    expect(mobileVisualSeat(3, 4, 6)).toBe(5);
  });

  it("renders readable table facts without changing engine seats", () => {
    const game = newGame(42);
    render(
      <MobilePokerTable
        game={game}
        phase="hero-turn"
        frame={undefined}
        visualTokens={[]}
        recentActions={[]}
        themeId="classic-green"
      />,
    );
    expect(screen.getByTestId(`mobile-seat-${game.heroSeat}`)).toHaveAttribute(
      "data-visual-seat",
      "0",
    );
    expect(screen.getByText(`底池 ${game.pot}`)).toBeVisible();
    expect(screen.getByText("轮到你")).toBeVisible();
    expect(document.querySelectorAll(".mobile-hero-hole .card")).toHaveLength(0);
    expect(screen.getByTestId(`mobile-seat-${game.heroSeat}`)).toHaveAttribute(
      "data-hole-moved",
      "true",
    );
    expect(game.players[game.heroSeat].seat).toBe(game.heroSeat);
  });

  it("gives every player a local photographic avatar", () => {
    const game = newGame(42);
    render(
      <MobilePokerTable
        game={game}
        phase="hero-turn"
        frame={undefined}
        visualTokens={[]}
        recentActions={[]}
        themeId="classic-green"
      />,
    );
    const portraits = [...document.querySelectorAll<HTMLImageElement>(".mobile-player-identity img")];
    expect(portraits).toHaveLength(game.players.length);
    expect(new Set(portraits.map((portrait) => portrait.src)).size).toBe(game.players.length);
    portraits.forEach((portrait) => {
      expect(portrait.getAttribute("src")).toMatch(/^\/assets\/mobile-casino\/avatars\//);
      expect(portrait.alt).not.toBe("");
    });
  });

  it("shows names, Chinese positions, stacks, wagers, and folded state", () => {
    const game = newGame(42);
    const opponent = game.players.find((player) => player.seat !== game.heroSeat)!;
    opponent.folded = true;
    opponent.streetBet = 6;
    render(
      <MobilePokerTable
        game={game}
        phase="hero-turn"
        frame={undefined}
        visualTokens={[]}
        recentActions={[]}
        themeId="classic-green"
      />,
    );
    const seat = screen.getByTestId(`mobile-seat-${opponent.seat}`);
    expect(seat).toHaveTextContent(opponent.name);
    expect(seat).toHaveTextContent(positionLabel(opponent.position).name);
    expect(seat).toHaveTextContent(String(opponent.stack));
    expect(seat).toHaveTextContent("本街 6");
    expect(seat).toHaveTextContent("已弃牌");
  });

  it("keeps opponent cards hidden outside a revealed showdown", () => {
    const game = newGame(42);
    game.players.forEach((player) => {
      if (player.seat !== game.heroSeat) player.revealed = false;
    });
    render(
      <MobilePokerTable
        game={game}
        phase="hero-turn"
        frame={undefined}
        visualTokens={[]}
        recentActions={[]}
        themeId="classic-green"
      />,
    );
    expect(document.querySelectorAll(".mobile-seat:not(.hero) .card.back").length)
      .toBeGreaterThan(0);
    expect(document.querySelectorAll(".mobile-seat:not(.hero) .card.face-up"))
      .toHaveLength(0);
  });

  it("throws a short staggered chip stack for a wagering token", () => {
    const game = newGame(42);
    const actorSeat = game.players.find((player) => player.seat !== game.heroSeat)!.seat;
    render(
      <MobilePokerTable
        game={game}
        phase="animating-chips"
        frame={undefined}
        visualTokens={[{
          id: 99,
          effect: "chips",
          actorSeat,
          action: game.log.at(-1),
          expiresAt: Date.now() + 300,
        }]}
        recentActions={[]}
        themeId="classic-green"
      />,
    );
    const flight = screen.getByTestId(`mobile-chip-flight-${actorSeat}`);
    expect(flight.querySelectorAll("i")).toHaveLength(3);
  });

  it("merges a wager action into the wager badge instead of covering the avatar", () => {
    const game = newGame(42);
    const opponent = game.players.find((player) => player.seat !== game.heroSeat)!;
    opponent.streetBet = 8;
    game.log.push({
      street: game.street,
      actorSeat: opponent.seat,
      actor: opponent.name,
      kind: "raise",
      action: "加注到",
      amount: 8,
      toAmount: 8,
      potAfter: game.pot,
    });
    render(
      <MobilePokerTable
        game={game}
        phase="hero-turn"
        frame={undefined}
        visualTokens={[]}
        recentActions={[]}
        themeId="classic-green"
      />,
    );
    const seat = screen.getByTestId(`mobile-seat-${opponent.seat}`);
    expect(seat.querySelector(".mobile-wager")).toHaveTextContent("加注到 8");
    expect(seat.querySelector(".mobile-last-action")).not.toBeInTheDocument();
  });
});
