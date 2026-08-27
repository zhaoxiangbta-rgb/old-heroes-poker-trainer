import type { GameLog, Player } from "../game/game";
import { positionLabel } from "../game/game";
import type { PlaybackPhase } from "../game/playback";
import { playerPortraitFor, wagerChipFor } from "../ui/pokerVisualAssets";
import { PlayingCard } from "./PlayingCard";

type Props = {
  player: Player;
  seat: number;
  heroSeat: number;
  visibleHoleCount: number;
  phase: PlaybackPhase;
  acting: boolean;
  thinking: boolean;
  receiving: boolean;
  last?: GameLog;
  effect?: string;
};

export function PlayerSeat({
  player,
  seat,
  heroSeat,
  visibleHoleCount,
  phase,
  acting,
  thinking,
  receiving,
  last,
  effect = "",
}: Props) {
  const hero = seat === heroSeat;
  const folded = player.folded && phase !== "dealing-hole";
  const label = positionLabel(player.position);
  return (
    <article className={`seat seat${seat}${hero ? " hero" : ""}${folded ? " folded" : ""}${effect === "fold" ? " folding" : ""}${acting ? " acting" : ""}${thinking ? " thinking" : ""}${receiving ? " receiving" : ""}${effect ? ` effect-${effect}` : ""}`}>
      {acting && <span className="turn-badge">{thinking ? <><i /><i /><i /> 正在思考</> : `▶ ${hero ? "轮到你" : "行动中"}`}</span>}
      <img className="player-seat-avatar" src={playerPortraitFor(player.playerId, seat)} alt={`${player.name}的头像`} draggable={false} />
      <span className="player-position-badge">{label.name}</span>
      <div className="player-seat-plaque">
        <b className="player-name">{player.name}</b>
        <small className="stack">{player.allIn ? "ALL IN" : `余码 ${player.stack}`}</small>
      </div>
      {folded && <span className="fold-badge">已弃牌</span>}
      <div className="hole player-seat-hole">
        {player.hole.slice(0, visibleHoleCount).map((card, index) => (
          <PlayingCard card={player.revealed ? card : undefined} back={!player.revealed} key={index} />
        ))}
      </div>
      <div className={`wager-zone player-seat-wager${player.streetBet ? " committed" : ""}`}>
        <img src={wagerChipFor(seat)} alt="" />
        <b>{player.streetBet}</b><small>下注</small>
      </div>
      {last && phase !== "dealing-hole" && <div className={`last-action action-${last.kind}`}>{last.action}{last.toAmount ? ` ${last.toAmount}` : ""}</div>}
    </article>
  );
}
