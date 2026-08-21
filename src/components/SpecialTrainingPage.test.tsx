// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WEAKNESS_DEFINITIONS, type WeaknessTag } from "../training/types";
import type { WeaknessSummary } from "../training/curriculum";
import { SpecialTrainingPage } from "./SpecialTrainingPage";

function summaries(): WeaknessSummary[] {
  return (Object.keys(WEAKNESS_DEFINITIONS) as WeaknessTag[]).map((tag, index) => ({
    tag,
    name: WEAKNESS_DEFINITIONS[tag].name,
    status: index === 0 ? "weakness" : "collecting",
    samples: index === 0 ? 8 : index,
    recentAccuracy: index === 0 ? 0.38 : 0,
    recencyWeightedLoss: index === 0 ? 0.16 : 0,
    errorRate: index === 0 ? 0.62 : 0,
    confidence: index === 0 ? 0.67 : index / 12,
    priority: index === 0 ? 0.06 : 0,
    trend: "stable",
    representativeHandKeys: [],
  }));
}

describe("SpecialTrainingPage", () => {
  it("renders nine training entries and starts the selected full-hand drill", () => {
    const start = vi.fn();
    render(<SpecialTrainingPage summaries={summaries()} onStart={start} />);
    expect(screen.getAllByRole("button", { name: /开始/ })).toHaveLength(9);
    const overcallingCard = screen.getByText("平跟过多").closest("article")!;
    expect(within(overcallingCard).getByText(/8 个相关决策/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "开始平跟过多专项" }));
    expect(start).toHaveBeenCalledWith("overcalling");
  });
});
