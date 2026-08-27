import type { CSSProperties } from "react";
import type { PlaybackPhase } from "../game/playback";
import { wagerChipFor } from "../ui/pokerVisualAssets";
import { potChipColumns } from "./potChipColumns";

export function PotChipStack({ pot, phase, className = "" }: { pot: number; phase: PlaybackPhase; className?: string }) {
  const columns = potChipColumns(pot);
  return (
    <div className={`pot-chip-stack${phase === "settling-pot" ? " settling" : ""}${className ? ` ${className}` : ""}`} data-testid="pot-chip-stack">
      <strong className="pot-chip-label">底池 {pot}</strong>
      <div className="pot-chip-pile" aria-hidden="true">
        {columns.map((height, columnIndex) => (
          <span
            className="pot-chip-column"
            style={{ "--column-index": columnIndex } as CSSProperties}
            key={columnIndex}
          >
            {Array.from({ length: height }, (_, chipIndex) => (
              <img
                src={wagerChipFor(columnIndex + chipIndex)}
                style={{
                  "--chip-index": chipIndex,
                  "--chip-bottom": `${chipIndex * 8}px`,
                  "--chip-turn": `${(columnIndex - chipIndex) * 4}deg`,
                } as CSSProperties}
                alt=""
                key={chipIndex}
              />
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}
