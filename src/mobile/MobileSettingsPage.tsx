import { useEffect, useState } from "react";
import type { DesktopRepository } from "../data/repository";
import type { GameplaySettings, ModelSettings } from "../data/types";
import { TABLE_PROFILES, type TableProfileId } from "../policy/tableProfiles";
import { normalizeGameplaySettings, TABLE_THEMES, type TableThemeId } from "../ui/tableThemes";
import { APP_VERSION_LABEL } from "../appVersion";

export function SettingsPage({
  repository,
  soundEnabled,
  currentHandProfileId = "balanced",
  onGameplaySettingsChange,
  setSoundEnabled,
}: {
  repository: DesktopRepository;
  soundEnabled: boolean;
  currentHandProfileId?: TableProfileId;
  onGameplaySettingsChange?: (settings: GameplaySettings) => void;
  onModelSettingsChange?: (settings: ModelSettings) => void;
  setSoundEnabled: (enabled: boolean) => void;
  hideModel?: boolean;
}) {
  const [gameplay, setGameplay] = useState<GameplaySettings>(() => normalizeGameplaySettings({}));
  const [notice, setNotice] = useState("");
  useEffect(() => { void repository.loadGameplaySettings().then(setGameplay).catch(() => setNotice("读取设置失败")); }, [repository]);
  async function save(patch: Partial<GameplaySettings>, message: string) {
    const next = normalizeGameplaySettings({ ...gameplay, ...patch });
    try {
      await repository.saveGameplaySettings(next);
      setGameplay(next);
      onGameplaySettingsChange?.(next);
      setNotice(message);
    } catch { setNotice("保存设置失败"); }
  }
  return <div className="placeholder settings-page mobile-settings-page">
    <p className="eyebrow">手机本地设置</p><h1>设置</h1>
    <section className="panel settings-card compact"><label>牌局风格<select value={gameplay.tableProfileId} onChange={(event) => void save({ tableProfileId: event.target.value as TableProfileId }, `下一手生效；当前手仍是${TABLE_PROFILES[currentHandProfileId].name}`)}>{(Object.keys(TABLE_PROFILES) as TableProfileId[]).map((id) => <option key={id} value={id}>{TABLE_PROFILES[id].name}</option>)}</select></label><label>牌桌颜色<select value={gameplay.tableThemeId} onChange={(event) => void save({ tableThemeId: event.target.value as TableThemeId }, "牌桌外观已更新")}>{(Object.keys(TABLE_THEMES) as TableThemeId[]).map((id) => <option key={id} value={id}>{TABLE_THEMES[id].name}</option>)}</select></label></section>
    <section className="panel settings-card compact"><div className="setting-row"><div><b>牌桌音效</b><small>下注、发牌与全下使用本机合成音。</small></div><button className={soundEnabled ? "toggle active" : "toggle"} aria-pressed={soundEnabled} onClick={() => setSoundEnabled(!soundEnabled)}>{soundEnabled ? "开启" : "关闭"}</button></div><div className="offline-note"><b>完全离线可用</b><p>手机版不连接 AI，牌局与复盘均在本机运行；使用本地默认牌局配置。</p></div></section>
    {notice ? <p className="settings-notice" role="status">{notice}</p> : null}
    <p className="build-info">老英雄牌局 {APP_VERSION_LABEL} · 手机本地版</p>
  </div>;
}
