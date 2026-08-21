import { useEffect, useState } from "react";
import {
  DEFAULT_PLAYER_PROFILES,
  PLAYER_ARCHETYPES,
  describePlayerProfile,
  validatePlayerProfiles,
  type PlayerArchetype,
  type PlayerProfile,
} from "../policy/playerProfiles";

type Props = {
  value: ReadonlyArray<Readonly<PlayerProfile>>;
  disabled: boolean;
  onSave: (next: PlayerProfile[]) => Promise<void>;
};

const ARCHETYPES = Object.keys(PLAYER_ARCHETYPES) as PlayerArchetype[];

function cloneProfiles(value: ReadonlyArray<Readonly<PlayerProfile>>) {
  return value.map((profile) => ({ ...profile }));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "牌友设置无效";
}

export function PlayerProfileSettings({ value, disabled, onSave }: Props) {
  const [draft, setDraft] = useState(() => cloneProfiles(value));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => setDraft(cloneProfiles(value)), [value]);

  function replace(playerId: string, patch: Partial<PlayerProfile>) {
    setDraft((current) =>
      current.map((profile) =>
        profile.playerId === playerId ? { ...profile, ...patch } : profile,
      ),
    );
  }

  async function commit(next: PlayerProfile[]) {
    let valid: PlayerProfile[];
    try {
      valid = validatePlayerProfiles(cloneProfiles(next));
    } catch (caught) {
      setError(errorMessage(caught));
      setNotice("");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("正在保存…");
    try {
      await onSave(valid);
      setDraft(cloneProfiles(valid));
      setNotice("已保存，下一手生效");
    } catch {
      setNotice("牌友设置未保存");
    } finally {
      setSaving(false);
    }
  }

  function commitDraft() {
    void commit(draft);
  }

  function applyPreset(player: PlayerProfile, archetype: PlayerArchetype) {
    const preset = PLAYER_ARCHETYPES[archetype];
    const next = draft.map((profile) =>
      profile.playerId === player.playerId
        ? {
            ...profile,
            archetype,
            looseness: preset.looseness,
            aggression: preset.aggression,
            bluff: preset.bluff,
          }
        : profile,
    );
    setDraft(next);
    void commit(next);
  }

  function resetOne(playerId: string) {
    const fallback = DEFAULT_PLAYER_PROFILES.find(
      (profile) => profile.playerId === playerId,
    )!;
    const next = draft.map((profile) =>
      profile.playerId === playerId ? { ...fallback } : profile,
    );
    setDraft(next);
    void commit(next);
  }

  function resetAll() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    const next = cloneProfiles(DEFAULT_PLAYER_PROFILES);
    setDraft(next);
    void commit(next);
  }

  const controlsDisabled = disabled || saving;
  return (
    <fieldset className="player-profile-settings" disabled={controlsDisabled}>
      <legend>牌友名称与习惯</legend>
      <div className="player-profile-heading">
        <p>六位牌友会轮流入座。改名和习惯参数从下一手生效，不改变当前牌局。</p>
        <button type="button" className={confirmReset ? "danger-confirm" : ""} onClick={resetAll}>
          {confirmReset ? "确认全部恢复默认" : "全部恢复默认"}
        </button>
      </div>
      <div className="player-profile-grid">
        {draft.map((player) => {
          const isExpanded = expanded === player.playerId;
          return (
            <article
              className={`player-profile-card${isExpanded ? " expanded" : ""}`}
              key={player.playerId}
            >
              <button
                type="button"
                className="player-profile-summary"
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? "收起" : "展开"} ${player.displayName}`}
                onClick={() => setExpanded(isExpanded ? null : player.playerId)}
              >
                <span className="profile-avatar">{Array.from(player.displayName)[0]}</span>
                <span>
                  <b>{player.displayName}</b>
                  <small>{PLAYER_ARCHETYPES[player.archetype].name}</small>
                </span>
                <em>{isExpanded ? "−" : "+"}</em>
              </button>
              <p>{describePlayerProfile(player)}</p>
              <div className="profile-mini-bars" aria-hidden="true">
                {[player.looseness, player.aggression, player.bluff].map((amount, index) => (
                  <i key={index}><span style={{ width: `${amount}%` }} /></i>
                ))}
              </div>
              {isExpanded ? (
                <div className="player-profile-editor">
                  <label>
                    名称
                    <input
                      aria-label={`${player.displayName} 名称`}
                      maxLength={24}
                      value={player.displayName}
                      onChange={(event) => replace(player.playerId, { displayName: event.target.value })}
                      onBlur={commitDraft}
                    />
                  </label>
                  <label>
                    风格预设
                    <select
                      aria-label={`${player.displayName} 风格预设`}
                      value={player.archetype}
                      onChange={(event) => applyPreset(player, event.target.value as PlayerArchetype)}
                    >
                      {ARCHETYPES.map((archetype) => (
                        <option value={archetype} key={archetype}>
                          {PLAYER_ARCHETYPES[archetype].name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {([
                    ["looseness", "入池宽度"],
                    ["aggression", "主动进攻"],
                    ["bluff", "诈唬频率"],
                  ] as const).map(([field, label]) => (
                    <label className="profile-slider" key={field}>
                      <span>{label}<output>{player[field]}</output></span>
                      <input
                        aria-label={`${player.displayName} ${label}`}
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={player[field]}
                        onChange={(event) => replace(player.playerId, { [field]: Number(event.target.value) })}
                        onBlur={commitDraft}
                      />
                    </label>
                  ))}
                  <button type="button" className="reset-one-profile" onClick={() => resetOne(player.playerId)}>
                    恢复这位牌友默认值
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {error ? <p className="profile-editor-error" role="alert">{error}</p> : null}
      {notice ? <p className="profile-editor-notice" role="status">{notice}</p> : null}
    </fieldset>
  );
}
