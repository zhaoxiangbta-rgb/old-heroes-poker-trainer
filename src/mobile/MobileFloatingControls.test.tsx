// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newGame, type GameState } from "../game/game";
import { MobileFloatingControls } from "./MobileFloatingControls";

function facingBetGame() {
  const game = newGame(42);
  game.players[game.heroSeat].streetBet = 0;
  game.currentBet = 6;
  game.pot = 30;
  game.legal = {
    canFold: true,
    canCheck: false,
    canCall: true,
    canRaise: true,
    callAmount: 6,
    minRaiseTo: 14,
    maxRaiseTo: 200,
  };
  return game;
}

function checkingGame() {
  const game = facingBetGame();
  game.currentBet = 0;
  game.legal = {
    canFold: true,
    canCheck: true,
    canCall: false,
    canRaise: true,
    callAmount: 0,
    minRaiseTo: 2,
    maxRaiseTo: 200,
  };
  return game;
}

function renderControls(game: GameState, onAction = vi.fn()) {
  return {
    onAction,
    ...render(
      <MobileFloatingControls
        game={game}
        busy={false}
        receipt=""
        onAction={onAction}
      />,
    ),
  };
}

describe("MobileFloatingControls", () => {
  afterEach(cleanup);

  it("keeps the rail bottom as call and changes the same button to raise", () => {
    const game = facingBetGame();
    const { onAction } = renderControls(game);
    const slider = screen.getByRole("slider");
    expect(screen.getByRole("button", { name: "跟注 6" })).toBeVisible();
    fireEvent.change(slider, { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "加注到 14" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "加注到 14" }));
    expect(onAction).toHaveBeenCalledWith({ type: "raise", to: 14 });
  });

  it("integrates sizing landmarks into the rail without submitting", () => {
    const { onAction } = renderControls(facingBetGame());
    expect(screen.getByText("最低")).toBeVisible();
    expect(screen.getByText("½")).toBeVisible();
    expect(screen.getByText("⅔")).toBeVisible();
    expect(screen.getByText("1×")).toBeVisible();
    expect(screen.getByText("ALL IN")).toBeVisible();
    expect(document.querySelector(".mobile-floating-presets")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "8" } });
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "加注到 21" })).toBeVisible();
  });

  it("keeps both fold and check visible when betting is unopened", () => {
    const { onAction } = renderControls(checkingGame());
    expect(screen.getByRole("button", { name: "过牌" })).toBeVisible();
    expect(screen.getByRole("button", { name: "弃牌" })).toBeVisible();
    expect(screen.getByRole("button", { name: "下注 2" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "弃牌" }));
    expect(onAction).toHaveBeenCalledWith({ type: "fold" });
  });

  it("locks immediately after submission", () => {
    const { onAction } = renderControls(facingBetGame());
    const call = screen.getByRole("button", { name: "跟注 6" });
    fireEvent.click(call);
    fireEvent.click(call);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(call).toBeDisabled();
  });

  it("uses the compact casino dock and tactile chip controls", () => {
    renderControls(facingBetGame());
    expect(screen.getByRole("region", { name: "行动选择" })).toHaveClass("mobile-casino-dock");
    expect(screen.getByRole("button", { name: "弃牌" })).toHaveClass("mobile-chip-control", "chip-fold");
    expect(screen.getByRole("button", { name: "跟注 6" })).toHaveClass("mobile-chip-control", "chip-primary");
  });

  it("uses bankroll, centered cards, and legal actions as three columns", () => {
    renderControls(facingBetGame());
    expect(screen.getByRole("group", { name: "你的筹码信息" })).toHaveTextContent("余码");
    expect(screen.getByRole("group", { name: "你的筹码信息" })).toHaveTextContent("你 ·");
    expect(document.querySelectorAll(".mobile-centered-hole .card")).toHaveLength(2);
    expect(document.querySelector(".mobile-right-actions")).toContainElement(screen.getByRole("button", { name: "弃牌" }));
    expect(screen.getByTestId("mobile-horizontal-bet-rail")).toBeInTheDocument();
  });
});
