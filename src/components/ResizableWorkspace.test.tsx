// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResizableWorkspace } from "./ResizableWorkspace";

function renderWorkspace(panelWidth = 350) {
  const onPanelWidthChange = vi.fn();
  render(
    <ResizableWorkspace
      panelWidth={panelWidth}
      onPanelWidthChange={onPanelWidthChange}
    >
      <section>牌桌</section>
      <aside>教学分析</aside>
    </ResizableWorkspace>,
  );
  return {
    onPanelWidthChange,
    separator: screen.getByRole("separator", { name: "调整教学分析区宽度" }),
    workspace: screen.getByTestId("resizable-workspace"),
  };
}

describe("ResizableWorkspace", () => {
  afterEach(cleanup);

  it("exposes the current width and updates it live while dragging", () => {
    const { onPanelWidthChange, separator, workspace } = renderWorkspace();
    expect(separator).toHaveAttribute("aria-valuemin", "300");
    expect(separator).toHaveAttribute("aria-valuemax", "520");
    expect(separator).toHaveAttribute("aria-valuenow", "350");

    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({
      right: 1200,
    } as DOMRect);
    fireEvent(separator, new MouseEvent("pointerdown", { bubbles: true, clientX: 850 }));
    fireEvent(separator, new MouseEvent("pointermove", { bubbles: true, clientX: 700 }));
    expect(workspace).toHaveStyle({ gridTemplateColumns: "minmax(650px, 1fr) 500px" });
    fireEvent(separator, new MouseEvent("pointerup", { bubbles: true, clientX: 700 }));
    expect(onPanelWidthChange).toHaveBeenLastCalledWith(500);
  });

  it("supports keyboard limits and double-click reset", () => {
    const { onPanelWidthChange, separator } = renderWorkspace(400);
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(onPanelWidthChange).toHaveBeenLastCalledWith(416);
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(onPanelWidthChange).toHaveBeenLastCalledWith(384);
    fireEvent.keyDown(separator, { key: "Home" });
    expect(onPanelWidthChange).toHaveBeenLastCalledWith(300);
    fireEvent.keyDown(separator, { key: "End" });
    expect(onPanelWidthChange).toHaveBeenLastCalledWith(520);
    fireEvent.doubleClick(separator);
    expect(onPanelWidthChange).toHaveBeenLastCalledWith(350);
  });

  it("clamps pointer movement to the supported range", () => {
    const { onPanelWidthChange, separator, workspace } = renderWorkspace();
    vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({ right: 1200 } as DOMRect);
    fireEvent(separator, new MouseEvent("pointerdown", { bubbles: true, clientX: 850 }));
    fireEvent(separator, new MouseEvent("pointermove", { bubbles: true, clientX: 100 }));
    fireEvent(separator, new MouseEvent("pointerup", { bubbles: true, clientX: 100 }));
    expect(onPanelWidthChange).toHaveBeenLastCalledWith(520);
  });
});
