// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PLAYER_PROFILES } from "../policy/playerProfiles";
import { PlayerProfileSettings } from "./PlayerProfileSettings";

describe("PlayerProfileSettings", () => {
  afterEach(cleanup);

  it("edits one friend and reports next-hand semantics", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <PlayerProfileSettings
        disabled={false}
        value={DEFAULT_PLAYER_PROFILES}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "展开 阿岚" }));
    const name = screen.getByLabelText("阿岚 名称");
    fireEvent.change(name, { target: { value: "贝拉" } });
    fireEvent.blur(name);
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            playerId: "friend-01",
            displayName: "贝拉",
          }),
        ]),
      ),
    );
    expect(screen.getByText("已保存，下一手生效")).toBeVisible();
  });

  it("blocks duplicate, reserved and overlong names inline", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <PlayerProfileSettings
        disabled={false}
        value={DEFAULT_PLAYER_PROFILES}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "展开 阿岚" }));
    const name = screen.getByLabelText("阿岚 名称");
    for (const invalid of ["北辰", "你", "这是一个超过十二个字符的牌友名称"] ) {
      fireEvent.change(name, { target: { value: invalid } });
      fireEvent.blur(name);
      expect(await screen.findByRole("alert")).toBeVisible();
    }
    expect(onSave).not.toHaveBeenCalled();
  });

  it("applies a preset and requires confirmation before resetting everyone", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const renamed = DEFAULT_PLAYER_PROFILES.map((profile) =>
      profile.playerId === "friend-01"
        ? { ...profile, displayName: "贝拉", looseness: 40 }
        : { ...profile },
    );
    render(
      <PlayerProfileSettings disabled={false} value={renamed} onSave={onSave} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "展开 贝拉" }));
    fireEvent.change(screen.getByLabelText("贝拉 风格预设"), {
      target: { value: "tight-aggressive" },
    });
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            playerId: "friend-01",
            archetype: "tight-aggressive",
            looseness: 32,
            aggression: 75,
            bluff: 38,
          }),
        ]),
      ),
    );
    onSave.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "全部恢复默认" }));
    expect(screen.getByRole("button", { name: "确认全部恢复默认" })).toBeVisible();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认全部恢复默认" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(DEFAULT_PLAYER_PROFILES));
  });

  it("shows a local failure without discarding the edited draft", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("database"));
    render(
      <PlayerProfileSettings
        disabled={false}
        value={DEFAULT_PLAYER_PROFILES}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "展开 小满" }));
    const slider = screen.getByLabelText("小满 入池宽度");
    fireEvent.change(slider, { target: { value: "45" } });
    fireEvent.blur(slider);
    expect(await screen.findByText("牌友设置未保存")).toBeVisible();
    expect(slider).toHaveValue("45");
  });
});
