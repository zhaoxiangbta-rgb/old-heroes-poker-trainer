// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { VisualToken } from "../game/useGamePlayback";
import { TableActionEffects } from "./TableActionEffects";

function token(effect: VisualToken["effect"], actorSeat = 2): VisualToken {
  return {
    id: 9,
    effect,
    actorSeat,
    expiresAt: Date.now() + 400,
    action: {
      street: "flop",
      actorSeat,
      actor: "测试玩家",
      kind: effect === "fold" ? "fold" : "call",
      action: effect === "fold" ? "弃牌" : "跟注",
      amount: 12,
      toAmount: 18,
      potAfter: 42,
    },
  };
}

describe("TableActionEffects", () => {
  afterEach(cleanup);

  it("renders a transient chip flight from the acting seat", () => {
    render(<TableActionEffects tokens={[token("chips", 2)]} />);
    const flight = document.querySelector(".flying-wager");
    expect(flight).toHaveClass("from-seat-2");
    expect(flight).toHaveAttribute("data-action-amount", "12");
    expect(flight?.querySelectorAll("img")).toHaveLength(3);
  });

  it("renders two converging card backs for a fold", () => {
    render(<TableActionEffects tokens={[token("fold", 4)]} />);
    const flight = document.querySelector(".fold-flight");
    expect(flight).toHaveClass("from-seat-4");
    expect(flight?.querySelectorAll("img")).toHaveLength(2);
  });

  it("does not create flight objects for thinking or check labels", () => {
    render(<TableActionEffects tokens={[token("thinking"), token("action-label")] } />);
    expect(document.querySelector(".table-action-effects")?.children).toHaveLength(0);
  });
});
