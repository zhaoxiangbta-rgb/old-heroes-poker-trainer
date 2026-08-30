// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeepReviewProgress } from "./DeepReviewProgress";

describe("DeepReviewProgress", () => {
  it("shows only calculation progress before completion", () => {
    render(<DeepReviewProgress
      status="calculating"
      progress={{ stage: "ranges", completed: 2, total: 8 }}
      error=""
      onCancel={vi.fn()}
      onRetry={vi.fn()}
      onNextHand={vi.fn()}
    />);
    expect(screen.getByText("正在精算")).toBeTruthy();
    expect(screen.getByText("重建逐街范围")).toBeTruthy();
    expect(screen.getByRole("button", { name: "取消精算" })).toBeTruthy();
    expect(screen.queryByText("决策评分")).toBeNull();
  });

  it("offers retry and next hand after cancellation", () => {
    render(<DeepReviewProgress
      status="cancelled"
      error=""
      onCancel={vi.fn()}
      onRetry={vi.fn()}
      onNextHand={vi.fn()}
    />);
    expect(screen.getByRole("button", { name: "重新精算" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /开始下一手/ })).toBeTruthy();
  });
});
