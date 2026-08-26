type Props = {
  min: number;
  max: number;
  value: number;
  disabled: boolean;
  onChange(value: number): void;
};

export function VerticalBetSlider({
  min,
  max,
  value,
  disabled,
  onChange,
}: Props) {
  return (
    <div className="mobile-bet-rail" data-testid="mobile-bet-rail">
      <span className="mobile-all-in-label">ALL IN</span>
      <input
        className="mobile-bet-slider"
        aria-label="本街投入到"
        aria-orientation="vertical"
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        data-all-in={value === max}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  );
}
