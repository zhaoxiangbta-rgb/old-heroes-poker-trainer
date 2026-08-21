// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../data/memoryRepository";
import { SettingsPage } from "./SettingsPage";
import { normalizeGameplaySettings } from "../ui/tableThemes";

describe("SettingsPage", () => {
  afterEach(cleanup);

  it("loads ordinary settings and clearly labels preview mode", async () => {
    const repository = createMemoryRepository();
    await repository.saveModelSettings({ baseUrl: "http://localhost:8317", model: "local-model" });
    render(
      <SettingsPage repository={repository} soundEnabled setSoundEnabled={vi.fn()} />,
    );
    expect(screen.getByText("开发预览不保存设置或密钥")).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText("Base URL")).toHaveValue("http://localhost:8317"));
    expect(screen.getByLabelText("模型名")).toHaveValue("local-model");
    expect(screen.getByLabelText("API Key")).toHaveValue("");
  });

  it("saves Base URL/model separately from a write-only API key", async () => {
    const repository = createMemoryRepository();
    vi.spyOn(repository, "hasApiKey").mockResolvedValue(false);
    vi.spyOn(repository, "saveApiKey").mockResolvedValue(undefined);
    const saveSettings = vi.spyOn(repository, "saveModelSettings");
    render(
      <SettingsPage repository={repository} soundEnabled setSoundEnabled={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByLabelText("模型名")).toHaveValue("gpt-local"));
    fireEvent.change(screen.getByLabelText("Base URL"), { target: { value: "http://localhost:9000" } });
    fireEvent.change(screen.getByLabelText("模型名"), { target: { value: "new-model" } });
    fireEvent.click(screen.getByRole("button", { name: "保存模型设置" }));
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ baseUrl: "http://localhost:9000", model: "new-model" }));

    fireEvent.click(screen.getByRole("button", { name: "保存 API Key" }));
    expect(screen.getByText("API Key 不能为空")).toBeVisible();
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "SENTINEL-DESKTOP-SECRET" } });
    fireEvent.click(screen.getByRole("button", { name: "保存 API Key" }));
    await waitFor(() => expect(screen.getByText("密钥状态：已保存")).toBeVisible());
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(document.body.textContent).not.toContain("SENTINEL-DESKTOP-SECRET");
  });

  it("tests connection with a busy lock and offline-safe result", async () => {
    const repository = createMemoryRepository();
    let finish!: () => void;
    vi.spyOn(repository, "testModelConnection").mockImplementation(
      () => new Promise((resolve) => { finish = () => resolve({ ok: true, message: "连接成功；模型仅用于解释，本地规则优先" }); }),
    );
    render(
      <SettingsPage repository={repository} soundEnabled setSoundEnabled={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByLabelText("模型名")).toHaveValue("gpt-local"));
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    expect(screen.getByRole("button", { name: "连接中…" })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByText("连接成功；模型仅用于解释，本地规则优先")).toBeVisible());

    vi.spyOn(repository, "testModelConnection").mockRejectedValue(new Error("secret response body"));
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await waitFor(() => expect(screen.getByText("连接失败，训练仍可完全离线")).toBeVisible());
    expect(document.body.textContent).not.toContain("secret response body");
  });

  it("keeps the local sound toggle available", async () => {
    const repository = createMemoryRepository();
    const setSound = vi.fn();
    render(
      <SettingsPage repository={repository} soundEnabled={false} setSoundEnabled={setSound} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(setSound).toHaveBeenCalledWith(true);
  });

  it("saves a table profile for the next hand without changing the current hand", async () => {
    const repository = createMemoryRepository();
    await repository.saveGameplaySettings(normalizeGameplaySettings({
      tableProfileId: "friends",
      tableThemeId: "midnight-blue",
      teachingPanelWidth: 400,
    }));
    const saved = vi.spyOn(repository, "saveGameplaySettings");
    render(
      <SettingsPage repository={repository} soundEnabled currentHandProfileId="friends" setSoundEnabled={vi.fn()} />,
    );
    await waitFor(() => expect(screen.getByRole("radio", { name: "普通朋友局" })).toBeChecked());
    fireEvent.click(screen.getByRole("radio", { name: "宽松疯狂局" }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({
      tableProfileId: "loose-wild",
      tableThemeId: "midnight-blue",
      teachingPanelWidth: 400,
    })));
    expect(screen.getByText("下一手生效；当前手仍是普通朋友局")).toBeVisible();
  });

  it("saves a table theme immediately without changing other gameplay settings", async () => {
    const repository = createMemoryRepository();
    await repository.saveGameplaySettings(normalizeGameplaySettings({
      tableProfileId: "friends",
      tableThemeId: "midnight-blue",
      teachingPanelWidth: 420,
    }));
    const saved = vi.spyOn(repository, "saveGameplaySettings");
    const onGameplaySettingsChange = vi.fn();
    render(
      <SettingsPage
        repository={repository}
        soundEnabled
        onGameplaySettingsChange={onGameplaySettingsChange}
        setSoundEnabled={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole("radio", { name: "午夜蓝" })).toBeChecked());
    fireEvent.click(screen.getByRole("radio", { name: "酒红" }));
    const expected = {
      tableProfileId: "friends" as const,
      tableThemeId: "wine-red" as const,
      teachingPanelWidth: 420,
    };
    await waitFor(() => expect(saved).toHaveBeenLastCalledWith(expect.objectContaining(expected)));
    expect(onGameplaySettingsChange).toHaveBeenCalledWith(expect.objectContaining(expected));
    expect(screen.getByText("牌桌外观已更新")).toBeVisible();
  });
});
