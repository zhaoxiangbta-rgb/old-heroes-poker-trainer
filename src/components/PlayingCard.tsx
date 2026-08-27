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
    return <span className={`card back ${className}`.trim()} data-card-kind="back" aria-label="牌背">♠</span>;
  const symbols: Record<string, string> = {
    h: "♥",
    d: "♦",
    s: "♠",
    c: "♣",
  };
  const color = suitClass(card);
  return (
    <span
      className={`card face-up card-ivory ${color} ${className}`.trim()}
      data-card-kind="face-up"
      aria-label={card}
    >
      <span className="card-corner">
        <b className="card-rank">{card[0]}</b>
        <small className={`suit-symbol ${color}`} aria-hidden="true">{symbols[card[1]]}</small>
      </span>
    </span>
  );
}
