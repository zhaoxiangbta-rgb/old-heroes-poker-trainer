import type { CSSProperties } from "react";
import {
  betRailNodeFraction,
  choiceIndexAtRailFraction,
  railFractionForChoiceIndex,
  snapBetRailIndex,
  type BetRailNode,
} from "./mobileBetRail";

type Props = {
  choices: number[];
  value: number;
  nodes: BetRailNode[];
  disabled: boolean;
  onChange(value: number): void;
};

export function HorizontalBetSlider({ choices, value, nodes, disabled, onChange }: Props) {
  const selectedIndex = Math.max(0, choices.indexOf(value));
  const maximumIndex = Math.max(0, choices.length - 1);
  const railResolution = Math.max(1000, maximumIndex * 4);
  const sliderPosition = Math.round(railFractionForChoiceIndex(selectedIndex, nodes) * railResolution);
  const selectedNode = nodes.find((node) => node.index === selectedIndex);
  const choiceIndexForPosition = (position: number) =>
    choiceIndexAtRailFraction(position / railResolution, nodes);
  const commitSnap = (position: number) => {
    const snapped = snapBetRailIndex(choiceIndexForPosition(position), nodes);
    onChange(choices[snapped] ?? choices[0]);
  };
  return (
    <div className="mobile-horizontal-bet-rail" data-testid="mobile-horizontal-bet-rail">
      <strong data-testid="mobile-rail-amount" className={selectedIndex === maximumIndex ? "mobile-rail-amount all-in" : "mobile-rail-amount"}>{selectedIndex === maximumIndex ? "ALL IN" : value}</strong>
      <div className="mobile-horizontal-track">
        <input
          className="mobile-bet-slider"
          aria-label="本街投入到"
          aria-orientation="horizontal"
          aria-valuetext={String(value)}
          type="range"
          min={0}
          max={railResolution}
          step={1}
          value={sliderPosition}
          disabled={disabled || choices.length < 2}
          data-all-in={selectedIndex === maximumIndex}
          data-snapped-node={selectedNode?.id ?? ""}
          onChange={(event) => onChange(choices[choiceIndexForPosition(Number(event.currentTarget.value))] ?? choices[0])}
          onPointerUp={(event) => commitSnap(Number(event.currentTarget.value))}
          onKeyUp={(event) => commitSnap(Number(event.currentTarget.value))}
        />
        <div className="mobile-rail-nodes" aria-label="下注吸附档位">
          {nodes.map((node, nodeIndex) => (
            <span
              className={node.index === selectedIndex ? "active" : ""}
              data-testid="bet-rail-node"
              data-node={node.id}
              style={{ "--node-left": `${betRailNodeFraction(nodeIndex) * 100}%` } as CSSProperties}
              key={node.id}
            >
              {node.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
