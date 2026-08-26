import { useEffect, useMemo, useState } from "react";
import type { DesktopRepository } from "../data/repository";
import type { GameplaySettings, ModelSettings } from "../data/types";
import { TABLE_PROFILES, type TableProfileId } from "../policy/tableProfiles";
import { normalizeGameplaySettings, type TableThemeId } from "../ui/tableThemes";
import { TableThemePicker } from "./TableThemePicker";
import { PlayerProfileSettings } from "./PlayerProfileSettings";
import { LanMobileAccess } from "./LanMobileAccess";
import { createNativeLanService } from "../lan/nativeLanService";
import { APP_VERSION_LABEL } from "../appVersion";

export function SettingsPage({
  repository,
  soundEnabled,
  currentHandProfileId = "balanced",
  onGameplaySettingsChange,
  setSoundEnabled,
  hideModel = false,
}: {
  repository: DesktopRepository;
  soundEnabled: boolean;
  currentHandProfileId?: TableProfileId;
  onGameplaySettingsChange?: (settings: GameplaySettings) => void;
  setSoundEnabled: (enabled: boolean) => void;
  hideModel?: boolean;
}) {
  const [settings, setSettings] = useState<ModelSettings>({ baseUrl: "", model: "" });
  const [gameplay, setGameplay] = useState<GameplaySettings>(() => normalizeGameplaySettings({}));
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"idle" | "settings" | "gameplay" | "key" | "connection">("idle");
  const [notice, setNotice] = useState("");
  const lanClient = useMemo(() => repository.mode === "native" ? createNativeLanService() : undefined, [repository]);

  useEffect(() => {
    let active = true;
    void Promise.all([repository.loadModelSettings(), repository.loadGameplaySettings(), repository.hasApiKey()])
      .then(([loaded, loadedGameplay, savedKey]) => {
        if (!active) return;
        setSettings(loaded);
        setGameplay(loadedGameplay);
        setHasKey(savedKey);
      })
      .catch(() => active && setNotice("读取设置失败，训练仍可完全离线"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [repository]);

  async function saveGameplayPatch(
    patch: Partial<GameplaySettings>,
    successMessage: string,
  ) {
    setBusy("gameplay");
    setNotice("");
    const next = normalizeGameplaySettings({ ...gameplay, ...patch });
    try {
      await repository.saveGameplaySettings(next);
      setGameplay(next);
      onGameplaySettingsChange?.(next);
      setNotice(successMessage);
      return true;
    } catch {
      setNotice("保存玩法设置失败");
      return false;
    } finally {
      setBusy("idle");
    }
  }

  function saveProfile(tableProfileId: TableProfileId) {
    return saveGameplayPatch(
      { tableProfileId },
      `下一手生效；当前手仍是${TABLE_PROFILES[currentHandProfileId].name}`,
    );
  }

  function saveTheme(tableThemeId: TableThemeId) {
    return saveGameplayPatch({ tableThemeId }, "牌桌外观已更新");
  }

  async function saveSettings() {
    if (!settings.baseUrl.trim() || !settings.model.trim()) {
      setNotice("Base URL 和模型名不能为空");
      return;
    }
    setBusy("settings");
    setNotice("");
    try {
      await repository.saveModelSettings({
        baseUrl: settings.baseUrl.trim(),
        model: settings.model.trim(),
      });
      setNotice("模型设置已保存");
    } catch {
      setNotice("保存模型设置失败");
    } finally {
      setBusy("idle");
    }
  }

  async function saveKey() {
    if (!apiKey.trim()) {
      setNotice("API Key 不能为空");
      return;
    }
    setBusy("key");
    setNotice("");
    try {
      await repository.saveApiKey(apiKey.trim());
      setApiKey("");
      setHasKey(true);
      setNotice("API Key 已保存到系统凭据库");
    } catch {
      setNotice("保存 API Key 失败");
    } finally {
      setBusy("idle");
    }
  }

  async function testConnection() {
    setBusy("connection");
    setNotice("");
    try {
      const result = await repository.testModelConnection(settings);
      setNotice(result.message);
    } catch {
      setNotice("连接失败，训练仍可完全离线");
    } finally {
      setBusy("idle");
    }
  }

  const disabled = loading || busy !== "idle";
  return (
    <div className="placeholder settings-page">
      <p className="eyebrow">可选解释模型 · 本地规则优先</p>
      <h1>设置</h1>
      {repository.mode === "preview" ? (
        <p className="preview-warning">开发预览不保存设置或密钥</p>
      ) : null}

      <fieldset className="profile-settings" disabled={disabled}>
        <legend>牌局风格</legend>
        <p>只调整对手范围、频率和尺寸；不改变规则与结算。</p>
        <div className="profile-options">
          {(Object.keys(TABLE_PROFILES) as TableProfileId[]).map((id) => (
            <label className={gameplay.tableProfileId === id ? "selected" : ""} key={id}>
              <input aria-label={TABLE_PROFILES[id].name} type="radio" name="table-profile" checked={gameplay.tableProfileId === id} onChange={() => void saveProfile(id)} />
              <span><b>{TABLE_PROFILES[id].name}</b><small>{TABLE_PROFILES[id].description}</small></span>
            </label>
          ))}
        </div>
      </fieldset>

      <TableThemePicker
        disabled={disabled}
        value={gameplay.tableThemeId}
        onChange={(tableThemeId) => void saveTheme(tableThemeId)}
      />

      <PlayerProfileSettings
        disabled={disabled}
        value={gameplay.playerProfiles}
        onSave={async (playerProfiles) => {
          const saved = await saveGameplayPatch(
            { playerProfiles },
            "牌友设置已保存，下一手生效",
          );
          if (!saved) throw new Error("save failed");
        }}
      />

      <LanMobileAccess client={lanClient} />

      <div className="settings-grid">
        {!hideModel ? <section className="panel settings-card">
          <div className="settings-card-head">
            <div><b>OpenAI-compatible 模型</b><small>只用于中文解释；不会改变本地规则结论。</small></div>
            <span className={hasKey ? "key-saved" : "key-missing"}>密钥状态：{hasKey ? "已保存" : "未配置"}</span>
          </div>
          <label>Base URL<input aria-label="Base URL" disabled={disabled} value={settings.baseUrl} onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })} /></label>
          <label>模型名<input aria-label="模型名" disabled={disabled} value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} /></label>
          <div className="settings-actions">
            <button disabled={disabled} onClick={() => void saveSettings()}>{busy === "settings" ? "正在保存…" : "保存模型设置"}</button>
            <button disabled={disabled} onClick={() => void testConnection()}>{busy === "connection" ? "连接中…" : "测试连接"}</button>
          </div>
          <label>API Key<input aria-label="API Key" autoComplete="new-password" disabled={disabled} type="password" value={apiKey} placeholder="保存后立即清空，不回显" onChange={(event) => setApiKey(event.target.value)} /></label>
          <button className="save-key" disabled={disabled} onClick={() => void saveKey()}>{busy === "key" ? "正在写入凭据库…" : "保存 API Key"}</button>
        </section> : null}

        <section className="panel settings-card compact">
          <div className="setting-row"><div><b>牌桌音效</b><small>下注、发牌与全下使用本机合成音。</small></div><button className={soundEnabled ? "toggle active" : "toggle"} aria-pressed={soundEnabled} onClick={() => setSoundEnabled(!soundEnabled)}>{soundEnabled ? "开启" : "关闭"}</button></div>
          <div className="offline-note"><b>完全离线可用</b><p>模型未配置、超时或连接失败时，牌局、策略、复盘和历史不受影响。</p></div>
        </section>
      </div>
      {notice ? <p className="settings-notice" role="status">{notice}</p> : null}
      <p className="build-info">老英雄牌局 {APP_VERSION_LABEL} · {hideModel ? "手机本地版" : "桌面本地版"}</p>
    </div>
  );
}
