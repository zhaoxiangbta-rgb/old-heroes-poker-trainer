import {
  TABLE_THEMES,
  TABLE_THEME_IDS,
  type TableThemeId,
} from "../ui/tableThemes";
import type { CSSProperties } from "react";

export function TableThemePicker({
  value,
  disabled = false,
  onChange,
}: {
  value: TableThemeId;
  disabled?: boolean;
  onChange: (themeId: TableThemeId) => void;
}) {
  return (
    <fieldset className="table-theme-settings" disabled={disabled}>
      <legend>牌桌主题</legend>
      <p>只改变台呢与桌沿颜色，不改变牌面、筹码和行动提示。</p>
      <div className="table-theme-options">
        {TABLE_THEME_IDS.map((id) => {
          const theme = TABLE_THEMES[id];
          return (
            <label className={value === id ? "selected" : ""} key={id}>
              <input
                aria-label={theme.name}
                checked={value === id}
                name="table-theme"
                onChange={() => onChange(id)}
                type="radio"
              />
              <span
                className="table-theme-preview"
                data-testid="table-theme-preview"
                style={{
                  "--preview-center": theme.center,
                  "--preview-edge": theme.edge,
                  "--preview-rail": theme.rail,
                } as CSSProperties}
              >
                <i />
              </span>
              <b>{theme.name}</b>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
