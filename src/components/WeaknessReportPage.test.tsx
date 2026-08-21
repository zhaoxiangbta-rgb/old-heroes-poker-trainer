// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WeaknessSummary } from "../training/curriculum";
import { WeaknessReportPage } from "./WeaknessReportPage";

const summary: WeaknessSummary = {
  tag: "players-behind",
  name: "忽略身后玩家",
  status: "weakness",
  samples: 7,
  recentAccuracy: 0.4,
  recencyWeightedLoss: 0.18,
  errorRate: 0.6,
  confidence: 0.58,
  priority: 0.063,
  trend: "improving",
  representativeHandKeys: ["42:1"],
};

describe("WeaknessReportPage", () => {
  it("shows evidence and opens training or a representative hand", () => {
    const train = vi.fn();
    const open = vi.fn();
    render(
      <WeaknessReportPage
        summaries={[summary]}
        hands={[]}
        onTrain={train}
        onOpenHand={open}
      />,
    );
    expect(screen.getByText("忽略身后玩家")).toBeTruthy();
    expect(screen.getByText("正在改善")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "训练忽略身后玩家" }));
    expect(train).toHaveBeenCalledWith("players-behind");
  });

  it("distinguishes insufficient samples from no obvious weakness", () => {
    render(
      <WeaknessReportPage
        summaries={[{ ...summary, status: "collecting", samples: 3 }]}
        hands={[]}
        onTrain={vi.fn()}
        onOpenHand={vi.fn()}
      />,
    );
    expect(screen.getByText(/样本积累中/)).toBeTruthy();
  });
});
