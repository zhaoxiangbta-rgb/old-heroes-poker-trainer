// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newGame, type GameState } from "../game/game";
import { createMemoryRepository } from "../data/memoryRepository";
import { HistoryPage } from "./HistoryPage";
import { normalizeGameplaySettings } from "../ui/tableThemes";

function hand(seed: number): GameState {
  const value = newGame(seed);
  value.phase = "review";
  value.result = { reason: "fold", winners: [0], summary: `玩家赢得 ${seed} 筹码` };
  return value;
}

describe("HistoryPage", () => {
  afterEach(cleanup);

  it("shows loading, empty and ordered records that can be opened", () => {
    const repository = createMemoryRepository();
    const open = vi.fn();
    const { rerender } = render(
      <HistoryPage repository={repository} hands={[]} loading onOpen={open} onRefresh={vi.fn()} />,
    );
    expect(screen.getByText("正在读取本地历史…")).toBeVisible();
    rerender(
      <HistoryPage repository={repository} hands={[]} loading={false} onOpen={open} onRefresh={vi.fn()} />,
    );
    expect(screen.getByText("还没有完成的牌局。先打完一手。")).toBeVisible();
    const hands = [hand(2), hand(1)];
    rerender(
      <HistoryPage repository={repository} hands={hands} loading={false} onOpen={open} onRefresh={vi.fn()} />,
    );
    const records = screen.getAllByTestId("history-record");
    expect(records[0]).toHaveTextContent("种子 2");
    fireEvent.click(records[0]);
    expect(open).toHaveBeenCalledWith(hands[0]);
  });

  it("reports export/import counts and refreshes after import", async () => {
    const repository = createMemoryRepository();
    vi.spyOn(repository, "exportHands").mockResolvedValue({ cancelled: false, count: 3 });
    const gameplaySettings = normalizeGameplaySettings({ tableProfileId: "friends" });
    vi.spyOn(repository, "importHands").mockResolvedValue({
      cancelled: false,
      imported: 2,
      skipped: 1,
      gameplaySettings,
    });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const importedSettings = vi.fn();
    render(
      <HistoryPage repository={repository} hands={[]} loading={false} onOpen={vi.fn()} onRefresh={refresh} onGameplaySettingsImported={importedSettings} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "导出 JSON" }));
    await waitFor(() => expect(screen.getByText("已导出 3 手牌局")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "导入 JSON" }));
    await waitFor(() => expect(screen.getByText("已导入 2 手，跳过 1 手重复记录")).toBeVisible());
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(importedSettings).toHaveBeenCalledWith(gameplaySettings);
  });

  it("keeps cancellation quiet and exposes stable import errors", async () => {
    const repository = createMemoryRepository();
    vi.spyOn(repository, "exportHands").mockResolvedValue({ cancelled: true, count: 0 });
    vi.spyOn(repository, "importHands").mockRejectedValue(new Error("secret raw details"));
    render(
      <HistoryPage repository={repository} hands={[]} loading={false} onOpen={vi.fn()} onRefresh={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "导出 JSON" }));
    await waitFor(() => expect(repository.exportHands).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "导入 JSON" }));
    await waitFor(() => expect(screen.getByText("导入历史牌局失败")).toBeVisible());
    expect(screen.queryByText(/secret raw details/)).not.toBeInTheDocument();
  });

  it("requires confirmation before clear and disables all data actions while busy", async () => {
    const repository = createMemoryRepository();
    let finishClear!: () => void;
    vi.spyOn(repository, "clearHands").mockImplementation(
      () => new Promise<void>((resolve) => { finishClear = resolve; }),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(
      <HistoryPage repository={repository} hands={[hand(1)]} loading={false} onOpen={vi.fn()} onRefresh={refresh} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "清空历史" }));
    expect(repository.clearHands).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "确认清空" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("button", { name: "确认清空" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清空历史" }));
    fireEvent.click(screen.getByRole("button", { name: "确认清空" }));
    expect(screen.getByRole("button", { name: "正在清空…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导出 JSON" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "导入 JSON" })).toBeDisabled();
    finishClear();
    await waitFor(() => expect(screen.getByText("历史牌局已清空")).toBeVisible());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
