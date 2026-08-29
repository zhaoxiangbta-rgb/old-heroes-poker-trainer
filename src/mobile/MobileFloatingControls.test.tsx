// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    fireEvent.change(slider, { target: { value: "21" } });
    expect(screen.getByRole("button", { name: "加注到 14" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "加注到 14" }));
    expect(onAction).toHaveBeenCalledWith({ type: "raise", to: 14 });
  });

  it("integrates sizing landmarks into the rail without submitting", () => {
    const { onAction } = renderControls(facingBetGame());
    const rail = screen.getByLabelText("下注吸附档位");
    expect(within(rail).getByText("最低")).toBeVisible();
    expect(within(rail).getByText("半池")).toBeVisible();
    expect(within(rail).getByText("2/3池")).toBeVisible();
    expect(within(rail).getByText("底池")).toBeVisible();
    expect(within(rail).getByText("ALL IN")).toBeVisible();
    expect(document.querySelector(".mobile-floating-presets")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider"), { target: { value: "167" } });
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "加注到 24" })).toBeVisible();
  });

  it("keeps three stable action slots and disables unavailable actions", () => {
    const { onAction } = renderControls(checkingGame());
    expect(document.querySelectorAll(".mobile-action-zone button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "过牌" })).toBeVisible();
    expect(screen.getByRole("button", { name: "弃牌" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下注 2" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "过牌" }));
    expect(onAction).toHaveBeenCalledWith({ type: "check" });
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
    expect(screen.getByRole("button", { name: "弃牌" })).toHaveStyle({
      "--control-chip-image": "url(/assets/poker-visuals/controls/fold.png)",
    });
    expect(screen.getByRole("button", { name: "跟注 6" })).toHaveStyle({
      "--control-chip-image": "url(/assets/poker-visuals/controls/primary.png)",
    });
  });

  it("uses size, cards, and fixed actions as three zones", () => {
    const { onAction } = renderControls(facingBetGame());
    const sizeZone = document.querySelector(".mobile-size-zone")!;
    expect(within(sizeZone as HTMLElement).getAllByRole("button")).toHaveLength(3);
    expect(sizeZone).toHaveTextContent("余码 200 ·");
    expect(document.querySelectorAll(".mobile-hand-zone .card")).toHaveLength(2);
    expect(document.querySelector(".mobile-hand-zone")).not.toHaveTextContent("余码");
    expect(document.querySelectorAll(".mobile-action-zone button")).toHaveLength(3);
    expect(document.querySelector(".mobile-action-zone")).toContainElement(screen.getByRole("button", { name: "弃牌" }));
    expect(screen.getByRole("button", { name: "过牌" })).toBeDisabled();
    fireEvent.click(within(sizeZone as HTMLElement).getByRole("button", { name: "半池" }));
    expect(screen.getByRole("button", { name: "加注到 24" })).toBeVisible();
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByTestId("mobile-horizontal-bet-rail")).toBeInTheDocument();
  });
});
