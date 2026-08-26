const suitClass = (card: string) =>
  "hd".includes(card[1]) ? "suit-red" : "suit-black";

export function PlayingCard({
  card,
  back = false,
  className = "",
}: {
  card?: string;
  back?: boolean;
  className?: string;
}) {
  if (back || !card)
    return <span className={`card back ${className}`.trim()}>♠</span>;
  const symbols: Record<string, string> = {
    h: "♥",
    d: "♦",
    s: "♠",
    c: "♣",
  };
  const color = suitClass(card);
  return (
    <span
      className={`card face-up ${color} ${className}`.trim()}
      data-card-kind="face-up"
    >
      {card[0]}
      <small className={`suit-symbol ${color}`}>{symbols[card[1]]}</small>
    </span>
  );
}
