// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newGame, type GameState } from "../game/game";
import { MobileActionSheet } from "./MobileActionSheet";

function checkingGame() {
  const game = newGame(42);
  game.currentBet = 0;
  game.legal = {
    canFold: false,
    canCheck: true,
    canCall: false,
    canRaise: true,
    callAmount: 0,
    minRaiseTo: 2,
    maxRaiseTo: 200,
  };
  return game;
}

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

function renderSheet(game: GameState, onAction = vi.fn()) {
  return {
    onAction,
    ...render(
      <MobileActionSheet
        game={game}
        busy={false}
        receipt=""
        onAction={onAction}
      />,
    ),
  };
}

describe("MobileActionSheet", () => {
  afterEach(cleanup);

  it("shows check and bet without fold or call when checking is legal", () => {
    renderSheet(checkingGame());
    expect(screen.getByRole("button", { name: "过牌" })).toBeVisible();
    expect(screen.getByRole("button", { name: "下注" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "弃牌" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /跟注/ })).not.toBeInTheDocument();
  });

  it("shows fold, exact call, and raise when facing a bet", () => {
    const game = facingBetGame();
    renderSheet(game);
    expect(screen.getByRole("button", { name: "弃牌" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: `跟注 ${game.legal.callAmount}` }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "加注" })).toBeVisible();
  });

  it("removes the slider and raise action after a short all-in closes raising", () => {
    const game = facingBetGame();
    game.legal.canRaise = false;
    renderSheet(game);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "加注" })).not.toBeInTheDocument();
    expect(screen.getByText("短全下未重新开放加注")).toBeVisible();
  });

  it("selects presets without submitting", () => {
    const game = facingBetGame();
    const { onAction } = renderSheet(game);
    fireEvent.click(screen.getByRole("button", { name: "½池" }));
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("21");
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "最小" }));
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("14");
    expect(onAction).not.toHaveBeenCalled();
  });

  it("moves to all-in without submitting until raise is confirmed", () => {
    const game = facingBetGame();
    const { onAction } = renderSheet(game);
    fireEvent.change(screen.getByRole("slider"), {
      target: { value: String(game.legal.maxRaiseTo) },
    });
    expect(screen.getByTestId("mobile-selected-amount")).toHaveTextContent("ALL IN");
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "加注" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith({
      type: "raise",
      to: game.legal.maxRaiseTo,
    });
  });

  it("locks immediately so a double tap submits once", () => {
    const { onAction } = renderSheet(facingBetGame());
    const call = screen.getByRole("button", { name: /跟注/ });
    fireEvent.click(call);
    fireEvent.click(call);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(call).toBeDisabled();
  });

  it("recovers and shows an engine rejection", () => {
    const onAction = vi.fn(() => {
      throw new Error("合法下注范围已经变化");
    });
    renderSheet(facingBetGame(), onAction);
    fireEvent.click(screen.getByRole("button", { name: "加注" }));
    expect(screen.getByRole("alert")).toHaveTextContent("合法下注范围已经变化");
    expect(screen.getByRole("button", { name: "加注" })).toBeEnabled();
  });
});
