// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newGame } from "../game/game";
import { ActionControls } from "./ActionControls";

function facingBetGame() {
  const game = newGame(42);
  game.players[game.heroSeat].streetBet = 0;
  game.currentBet = 6;
  game.pot = 30;
  game.legal = { canFold:true,canCheck:false,canCall:true,canRaise:true,callAmount:6,minRaiseTo:14,maxRaiseTo:200 };
  return game;
}

describe("ActionControls", () => {
  afterEach(cleanup);

  it("renders rail and three stable desktop zones", () => {
    render(<ActionControls game={facingBetGame()} busy={false} receipt="" onAction={vi.fn()} />);
    expect(screen.getByTestId("desktop-action-dock")).toBeInTheDocument();
    expect(document.querySelector(".desktop-action-lower")).toBeInTheDocument();
    expect(within(screen.getByTestId("desktop-size-zone")).getAllByRole("button")).toHaveLength(3);
    const leftMeta = screen.getByTestId("desktop-left-meta");
    expect(leftMeta).toHaveTextContent("余码 200 ·");
    expect(screen.getByTestId("desktop-size-zone")).toContainElement(leftMeta);
    expect(screen.queryByRole("spinbutton", { name: "本街投入到" })).not.toBeInTheDocument();
    expect(document.querySelectorAll(".desktop-hand-zone .card")).toHaveLength(2);
    expect(within(screen.getByTestId("desktop-action-zone")).getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "过牌" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "弃牌" })).toHaveStyle({
      "--control-chip-image": "url(/assets/poker-visuals/controls/fold.png)",
    });
    expect([...document.querySelectorAll<HTMLElement>(".desktop-rail-nodes span")].map((node) =>
      node.style.getPropertyValue("--node-left"),
    )).toEqual(["0%", "16.666666666666664%", "33.33333333333333%", "50%", "100%"]);
  });

  it("changes sizing without submitting and confirms the selected amount", () => {
    const onAction = vi.fn();
    render(<ActionControls game={facingBetGame()} busy={false} receipt="" onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "半池" }));
    expect(screen.getByRole("button", { name: "半池" })).toHaveClass("sizing-plaque", "selected");
    expect(screen.getByRole("button", { name: "2/3池" })).toHaveClass("sizing-plaque");
    expect(screen.getByRole("button", { name: "确认金额" })).toHaveTextContent("加注到 24");
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认金额" }));
    expect(onAction).toHaveBeenCalledWith({ type: "raise", to: 24 });
  });

  it("preserves two-step fold confirmation", () => {
    const onAction = vi.fn();
    render(<ActionControls game={facingBetGame()} busy={false} receipt="" onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "弃牌" }));
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认弃牌" }));
    expect(onAction).toHaveBeenCalledWith({ type: "fold" });
  });
});
