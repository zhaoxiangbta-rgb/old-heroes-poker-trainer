import { PlayingCard } from "../components/PlayingCard";
import type { PokerTableProps } from "../components/PokerTable";
import { positionLabel } from "../game/game";
import { isNoActionPlayback } from "../game/playback";
import { mobileVisualSeat } from "./mobileSeatLayout";

const PLAYER_EMBLEMS = ["狼", "鲤", "隼", "發", "✥", "♞"] as const;

function emblemForPlayer(playerId: string, seat: number) {
  void playerId;
  return PLAYER_EMBLEMS[seat % PLAYER_EMBLEMS.length];
}

export function MobilePokerTable({
  game,
  phase,
  frame,
  visualTokens,
  themeId,
}: PokerTableProps) {
  const visibleActor = frame?.actorSeat ?? game.toAct;
  const actor = visibleActor >= 0 ? game.players[visibleActor] : undefined;
  const noActionPlayback = isNoActionPlayback(phase);
  const holeDeal = phase === "dealing-hole" ? frame?.dealCard : undefined;
  const firstToDeal =
    game.players.length === 2
      ? game.button
      : (game.button + 1) % game.players.length;
  const dealOrder = Array.from(
    { length: game.players.length },
    (_, index) => (firstToDeal + index) % game.players.length,
  );
  const currentDealOrder = holeDeal ? dealOrder.indexOf(holeDeal.seat) : -1;
  const visibleHoleCount = (seat: number) => {
    if (phase !== "dealing-hole") return 2;
    if (!holeDeal) return 0;
    const order = dealOrder.indexOf(seat);
    return holeDeal.cardIndex === 0
      ? order <= currentDealOrder
        ? 1
        : 0
      : 1 + (order <= currentDealOrder ? 1 : 0);
  };
  const visibleBoard = game.board.slice(
    0,
    frame?.visibleBoardCount ?? game.board.length,
  );
  const status =
    phase === "hero-turn"
      ? "轮到你"
      : phase === "bot-thinking" && actor
        ? `${actor.name}思考中`
        : phase === "dealing-hole"
          ? "正在发底牌"
          : phase === "dealing"
            ? "正在发下一街"
            : phase === "showdown"
              ? "摊牌亮牌"
              : phase === "settling-pot"
                ? "筹码归入底池"
                : game.phase === "review"
                  ? "本手已结束"
                  : `${actor?.name ?? "对手"}行动`;
  const allIn = [...visualTokens]
    .reverse()
    .find((token) => token.effect === "all-in");

  return (
    <div
      className="mobile-poker-table"
      data-phase={phase}
      data-table-theme={themeId}
    >
      <div className="mobile-table-ring" aria-hidden="true" />
      <div className="mobile-table-status">{status}</div>
      <div className="mobile-pot">底池 {game.pot}</div>
      <div className="mobile-board">
        {visibleBoard.map((card) => (
          <PlayingCard card={card} key={card} />
        ))}
        {Array.from({ length: 5 - visibleBoard.length }, (_, index) => (
          <span className="empty-card" key={index} />
        ))}
      </div>

      {game.players.map((player) => {
        const visualSeat = mobileVisualSeat(
          player.seat,
          game.heroSeat,
          game.players.length,
        );
        const isHero = player.seat === game.heroSeat;
        const holeMoved = isHero && phase === "hero-turn";
        const emblem = isHero ? "你" : emblemForPlayer(player.playerId, player.seat);
        const thinking = phase === "bot-thinking" && visibleActor === player.seat;
        const chipToken = [...visualTokens]
          .reverse()
          .find((token) => token.actorSeat === player.seat && token.effect === "chips");
        const acting =
          phase !== "dealing-hole" &&
          game.phase === "playing" &&
          visibleActor === player.seat;
        const last = [...game.log]
          .reverse()
          .find(
            (entry) =>
              entry.actorSeat === player.seat &&
              (entry.street === game.street || player.folded),
          );
        const label = positionLabel(player.position);
        const visibleCards = player.hole.slice(0, visibleHoleCount(player.seat));
        return (
          <article
            className={`mobile-seat mobile-seat-${visualSeat}${isHero ? " hero" : ""}${player.folded && phase !== "dealing-hole" ? " folded" : ""}${acting ? " acting" : ""}${thinking ? " thinking" : ""}`}
            data-testid={`mobile-seat-${player.seat}`}
            data-engine-seat={player.seat}
            data-visual-seat={visualSeat}
            data-emblem={emblem}
            data-hole-moved={holeMoved}
            key={player.seat}
          >
            <div className={`mobile-player-identity emblem-${visualSeat}`} aria-hidden="true">
              {emblem}
            </div>
            <div className="mobile-player-meta">
              <b>{player.name}</b>
              <small>{label.name}</small>
              <strong>{player.allIn ? "ALL IN" : player.stack}</strong>
            </div>
            <div className={isHero ? "mobile-hole mobile-hero-hole" : "mobile-hole"}>
              {!holeMoved && visibleCards.map((card, index) => (
                <PlayingCard
                  card={isHero || player.revealed ? card : undefined}
                  back={!isHero && !player.revealed}
                  key={index}
                />
              ))}
            </div>
            {player.streetBet ? (
              <span className="mobile-wager">本街 {player.streetBet}</span>
            ) : null}
            {player.folded && phase !== "dealing-hole" ? (
              <span className="mobile-folded">已弃牌</span>
            ) : null}
            {last && phase !== "dealing-hole" ? (
              <span className={`mobile-last-action action-${last.kind}`}>
                {last.action}
                {last.toAmount ? ` ${last.toAmount}` : ""}
              </span>
            ) : null}
            {thinking ? (
              <span className="mobile-thinking" aria-label={`${player.name}正在思考`}>
                <i />
                <i />
                <i />
              </span>
            ) : null}
            {chipToken ? (
              <span
                className={`mobile-chip-flight flight-seat-${visualSeat}`}
                data-testid={`mobile-chip-flight-${player.seat}`}
                aria-hidden="true"
              >
                <i />
                <i />
                <i />
              </span>
            ) : null}
          </article>
        );
      })}
      {allIn ? (
        <div className="mobile-all-in-overlay" data-testid="all-in-overlay">
          <strong>ALL IN</strong>
          <span>{allIn.action?.toAmount}</span>
        </div>
      ) : null}
      {game.phase === "playing" && !noActionPlayback ? (
        <small className="mobile-table-prompt">
          最高下注 {game.currentBet} · 需跟注 {game.legal.callAmount}
        </small>
      ) : null}
    </div>
  );
}
