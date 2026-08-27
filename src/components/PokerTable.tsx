import { currentPrompt, type GameLog, type GameState } from "../game/game";
import {
  isNoActionPlayback,
  type PlaybackFrame,
  type PlaybackPhase,
} from "../game/playback";
import type { VisualToken } from "../game/useGamePlayback";
import type { TableThemeId } from "../ui/tableThemes";
import { PlayingCard } from "./PlayingCard";
import { PlayerSeat } from "./PlayerSeat";
import { PotChipStack } from "./PotChipStack";
import { TableActionEffects } from "./TableActionEffects";

export type PokerTableProps = {
  game: GameState;
  phase: PlaybackPhase;
  frame?: PlaybackFrame;
  visualTokens: VisualToken[];
  recentActions: GameLog[];
  themeId: TableThemeId;
};

export function PokerTable({ game, phase, frame, visualTokens, recentActions, themeId }: PokerTableProps) {
  const prompt = currentPrompt(game);
  const visibleActor = frame?.actorSeat ?? game.toAct;
  const actor = visibleActor >= 0 ? game.players[visibleActor] : undefined;
  const allIn = [...visualTokens].reverse().find((token) => token.effect === "all-in");
  const showdownPlayback = phase === "showdown";
  const noActionPlayback = isNoActionPlayback(phase);
  const holeDeal = phase === "dealing-hole" ? frame?.dealCard : undefined;
  const playerCount = game.players.length;
  const firstToDeal = playerCount === 2 ? game.button : (game.button + 1) % playerCount;
  const dealOrder = Array.from({ length: playerCount }, (_, index) => (firstToDeal + index) % playerCount);
  const currentDealOrder = holeDeal ? dealOrder.indexOf(holeDeal.seat) : -1;
  const visibleHoleCount = (seat: number) => {
    if (phase !== "dealing-hole") return 2;
    if (!holeDeal) return 0;
    const order = dealOrder.indexOf(seat);
    return holeDeal.cardIndex === 0
      ? order <= currentDealOrder ? 1 : 0
      : 1 + (order <= currentDealOrder ? 1 : 0);
  };
  const visibleBoardCount = frame?.visibleBoardCount ?? game.board.length;
  const visibleBoard = game.board.slice(0, visibleBoardCount);
  const status = phase === "submitting"
    ? "动作已接收"
    : phase === "dealing-hole"
      ? "正在发底牌"
    : phase === "bot-thinking" && actor
      ? `${actor.name}正在思考`
      : showdownPlayback
        ? "摊牌亮牌"
      : phase === "settling-pot"
        ? "筹码归入底池"
        : phase === "dealing"
          ? "正在发下一街"
          : game.phase === "playing"
            ? visibleActor === game.heroSeat ? "轮到你行动" : `${actor?.name ?? "对手"}行动`
            : "本手已结束";

  return <div className="table-shell">
    <div className="table">
      <div className="felt" data-phase={phase} data-actor-seat={visibleActor} data-table-theme={themeId}>
        <PotChipStack pot={game.pot} phase={phase} />
        <TableActionEffects tokens={visualTokens} />
        <div className="action-banner"><strong>{status}</strong>{game.phase === "playing" && !noActionPlayback && <span>最高下注 {prompt.currentBet} · 需跟注 {prompt.toCall}</span>}</div>
        <div className="deal-deck" aria-hidden="true">♠</div>
        {holeDeal ? <div className={`flying-card target-seat-${holeDeal.seat}`} key={frame?.id} aria-hidden="true">♠</div> : null}
        <div className="board">{visibleBoard.map((card) => <PlayingCard card={card} key={card} />)}{Array.from({ length: 5 - visibleBoard.length }, (_, index) => <span className="empty-card" key={index} />)}</div>
        {game.players.map((player, seat) => {
          const last = [...game.log].reverse().find((entry) => entry.actorSeat === seat && (entry.street === game.street || player.folded));
          const token = [...visualTokens].reverse().find((item) => item.actorSeat === seat);
          const thinking = phase === "bot-thinking" && visibleActor === seat;
          const receiving = phase === "dealing-hole" && holeDeal?.seat === seat;
          const acting = phase !== "dealing-hole" && game.phase === "playing" && visibleActor === seat;
          return <PlayerSeat key={seat} player={player} seat={seat} heroSeat={game.heroSeat} visibleHoleCount={visibleHoleCount(seat)} phase={phase} acting={acting} thinking={thinking} receiving={receiving} last={last} effect={token?.effect} />;
        })}
        {allIn && <div className="all-in-overlay" data-testid="all-in-overlay"><strong>ALL IN</strong><span>全下 · {allIn.action?.toAmount}</span></div>}
      </div>
    </div>
    <div className="recent-actions" data-testid="recent-actions"><b>最近行动</b>{recentActions.slice(-3).reverse().map((entry, index) => <span key={`${entry.actorSeat}-${entry.street}-${index}`}><em>{entry.actor}</em>{entry.action}{entry.toAmount ? ` ${entry.toAmount}` : ""}</span>)}</div>
  </div>;
}
