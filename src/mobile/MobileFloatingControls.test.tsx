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

  it("shows only the requested presets and selecting one does not submit", () => {
    const { onAction } = renderControls(facingBetGame());
    expect(screen.getByRole("button", { name: "半池" })).toBeVisible();
    expect(screen.getByRole("button", { name: "2/3池" })).toBeVisible();
    expect(screen.getByRole("button", { name: "底池" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "最小" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "半池" }));
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
});
