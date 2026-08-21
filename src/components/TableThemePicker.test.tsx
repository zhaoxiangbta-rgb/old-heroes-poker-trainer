// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TableThemePicker } from "./TableThemePicker";

describe("TableThemePicker", () => {
  afterEach(cleanup);

  it("renders four table previews and reports the selected theme", () => {
    const onChange = vi.fn();
    render(<TableThemePicker value="classic-green" onChange={onChange} />);
    for (const name of ["经典深绿", "午夜蓝", "酒红", "石墨黑"]) {
      expect(screen.getByRole("radio", { name })).toBeVisible();
    }
    expect(screen.getByRole("radio", { name: "经典深绿" })).toBeChecked();
    expect(screen.getAllByTestId("table-theme-preview")).toHaveLength(4);
    fireEvent.click(screen.getByRole("radio", { name: "酒红" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("wine-red");
  });
});
