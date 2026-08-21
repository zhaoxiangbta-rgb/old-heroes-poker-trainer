import { currentPrompt, positionLabel, type GameLog, type GameState } from "../game/game";
import {
  isNoActionPlayback,
  type PlaybackFrame,
  type PlaybackPhase,
} from "../game/playback";
import type { VisualToken } from "../game/useGamePlayback";
import type { TableThemeId } from "../ui/tableThemes";

const suit = (card: string) => ("hd".includes(card[1]) ? "suit-red" : "suit-black");

function Card({ card, back = false }: { card?: string; back?: boolean }) {
  if (back || !card) return <span className="card back">♠</span>;
  const symbols: Record<string, string> = { h: "♥", d: "♦", s: "♠", c: "♣" };
  const suitClass = suit(card);
  return <span className={`card face-up ${suitClass}`} data-card-kind="face-up">{card[0]}<small className={`suit-symbol ${suitClass}`}>{symbols[card[1]]}</small></span>;
}

type Props = {
  game: GameState;
  phase: PlaybackPhase;
  frame?: PlaybackFrame;
  visualTokens: VisualToken[];
  recentActions: GameLog[];
  themeId: TableThemeId;
};

export function PokerTable({ game, phase, frame, visualTokens, recentActions, themeId }: Props) {
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
        <div className="pot">底池 <b>{game.pot}</b><small>{showdownPlayback ? "亮牌中" : game.phase === "playing" && !noActionPlayback ? `SPR ${(game.players[game.heroSeat].stack / Math.max(1, game.pot)).toFixed(1)}` : game.phase === "review" ? "本手结束" : null}</small></div>
        <div className="action-banner"><strong>{status}</strong>{game.phase === "playing" && !noActionPlayback && <span>最高下注 {prompt.currentBet} · 需跟注 {prompt.toCall}</span>}</div>
        <div className="deal-deck" aria-hidden="true">♠</div>
        {holeDeal ? <div className={`flying-card target-seat-${holeDeal.seat}`} key={frame?.id} aria-hidden="true">♠</div> : null}
        <div className="board">{visibleBoard.map((card) => <Card card={card} key={card} />)}{Array.from({ length: 5 - visibleBoard.length }, (_, index) => <span className="empty-card" key={index} />)}</div>
        {game.players.map((player, seat) => {
          const label = positionLabel(player.position);
          const last = [...game.log].reverse().find((entry) => entry.actorSeat === seat && (entry.street === game.street || player.folded));
          const token = [...visualTokens].reverse().find((item) => item.actorSeat === seat);
          const thinking = phase === "bot-thinking" && visibleActor === seat;
          const receiving = phase === "dealing-hole" && holeDeal?.seat === seat;
          const acting = phase !== "dealing-hole" && game.phase === "playing" && visibleActor === seat;
          const effectClass = token ? `effect-${token.effect}` : "";
          return <div className={`seat seat${seat}${seat === game.heroSeat ? " hero" : ""}${player.folded && phase !== "dealing-hole" ? " folded" : ""}${acting ? " acting" : ""}${thinking ? " thinking" : ""}${receiving ? " receiving" : ""} ${effectClass}`} key={seat}>
            {acting && <span className="turn-badge">{thinking ? <><i /><i /><i /> 正在思考</> : `▶ ${seat === game.heroSeat ? "轮到你" : "行动中"}`}</span>}
            <b className="player-name">{player.name}</b>
            <span className="position-name">{label.name} <small>{label.abbreviation}</small></span>
            <small className="stack">{player.allIn ? "全下" : `${player.stack} 筹码`}</small>
            {player.folded && phase !== "dealing-hole" && <span className="fold-badge">已弃牌</span>}
            <div className="hole">{player.hole.slice(0, visibleHoleCount(seat)).map((card, index) => <Card card={player.revealed ? card : undefined} back={!player.revealed} key={index} />)}</div>
            <div className={`wager-zone${player.streetBet ? " committed" : ""}`}>
              <span className="chip-stack" aria-hidden="true"><i /><i /><i /></span>
              <b>{player.streetBet}</b><small>本街</small>
            </div>
            {last && phase !== "dealing-hole" && <div className={`last-action action-${last.kind}`}>{last.action}{last.toAmount ? ` ${last.toAmount}` : ""}</div>}
          </div>;
        })}
        {allIn && <div className="all-in-overlay" data-testid="all-in-overlay"><strong>ALL IN</strong><span>全下 · {allIn.action?.toAmount}</span></div>}
      </div>
    </div>
    <div className="recent-actions" data-testid="recent-actions"><b>最近行动</b>{recentActions.slice(-3).reverse().map((entry, index) => <span key={`${entry.actorSeat}-${entry.street}-${index}`}><em>{entry.actor}</em>{entry.action}{entry.toAmount ? ` ${entry.toAmount}` : ""}</span>)}</div>
  </div>;
}
