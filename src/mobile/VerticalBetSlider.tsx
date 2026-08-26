type Props = {
  choices: number[];
  value: number;
  disabled: boolean;
  onChange(value: number): void;
};

export function VerticalBetSlider({
  choices,
  value,
  disabled,
  onChange,
}: Props) {
  const selectedIndex = Math.max(0, choices.indexOf(value));
  const maximumIndex = Math.max(0, choices.length - 1);
  const allIn = selectedIndex === maximumIndex;
  return (
    <div className="mobile-bet-rail" data-testid="mobile-bet-rail">
      <span className="mobile-all-in-label">ALL IN</span>
      <strong className={allIn ? "mobile-rail-amount all-in" : "mobile-rail-amount"} data-testid="mobile-rail-amount">
        {allIn ? "ALL IN" : value}
      </strong>
      <div className="mobile-rail-track">
        <span className="mobile-rail-ticks" data-testid="mobile-rail-ticks" aria-hidden="true" />
        <input
          className="mobile-bet-slider"
          aria-label="本街投入到"
          aria-orientation="vertical"
          aria-valuetext={String(value)}
          type="range"
          min={0}
          max={maximumIndex}
          step={1}
          value={selectedIndex}
          disabled={disabled || choices.length < 2}
          data-all-in={allIn}
          onChange={(event) =>
            onChange(choices[Number(event.currentTarget.value)] ?? choices[0])
          }
        />
      </div>
    </div>
  );
}
