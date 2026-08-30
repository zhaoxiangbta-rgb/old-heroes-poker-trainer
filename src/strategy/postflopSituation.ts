import { parseCard } from "../engine/cards";
import type { Position, Street } from "../game/game";
import type { PostflopTexture } from "./postflopTexture";
import { classifyPostflopTexture } from "./postflopTexture";
import type {
  PostflopLineV2,
  PostflopSituation,
  PublicAction,
  PublicDecisionState,
} from "./types";

const POSTFLOP_ORDER: Position[] = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];

function aggressive(action: PublicAction) {
  return action.kind === "bet" || action.kind === "raise" || action.kind === "all-in";
}

function previousStreet(street: Exclude<Street, "preflop">): Street | undefined {
  if (street === "turn") return "flop";
  if (street === "river") return "turn";
  return undefined;
}

function potType(actions: PublicAction[]): PostflopSituation["potType"] {
  const raises = actions.filter((item) => item.street === "preflop" &&
    (item.kind === "raise" || item.kind === "all-in")).length;
  if (raises === 0) return "limped";
  if (raises === 1) return "srp";
  if (raises === 2) return "3bp";
  return "4bp";
}

function lineFor(
  state: PublicDecisionState,
  initiativeSeat: number | undefined,
): PostflopLineV2 {
  const streetActions = state.actions.filter((item) => item.street === state.street);
  const lastAggressive = [...streetActions].reverse().find(aggressive);
  if (lastAggressive) return lastAggressive.kind === "raise" ? "facing-raise" : "facing-bet";

  const initiative = initiativeSeat === state.actingSeat;
  if (streetActions.some((item) => item.kind === "check")) {
    return initiative ? (state.street === "flop" ? "cbet" : "delayed-cbet") : "checked-to";
  }

  if (state.street === "flop") return initiative ? "cbet" : "first-to-act";
  const prior = previousStreet(state.street as Exclude<Street, "preflop">);
  const priorActions = prior ? state.actions.filter((item) => item.street === prior) : [];
  const priorAggressive = [...priorActions].reverse().find(aggressive);
  if (!initiative && priorAggressive?.actorSeat === initiativeSeat) return "donk";
  if (!initiative && priorActions.length > 0 && priorActions.every((item) => item.kind === "check")) {
    return "probe";
  }
  return initiative ? "delayed-cbet" : "first-to-act";
}

function isRangeShiftCard(state: PublicDecisionState, texture: PostflopTexture) {
  if (state.board.length <= 3) return false;
  const previousBoard = state.board.slice(0, -1);
  const previous = classifyPostflopTexture(previousBoard);
  const latest = parseCard(state.board.at(-1)!);
  const previousCards = previousBoard.map(parseCard);
  const pairedBoard = previousCards.some((card) => card.rank === latest.rank);
  const suitCount = previousCards.filter((card) => card.suit === latest.suit).length + 1;
  const connectionGain = texture.connectedness - previous.connectedness;
  const lowConnectedShift = latest.rank <= 10 && connectionGain >= 0.2;
  return pairedBoard || suitCount >= 3 || lowConnectedShift;
}

export function classifyPostflopSituation(
  state: PublicDecisionState,
  texture: PostflopTexture,
): PostflopSituation {
  if (state.street === "preflop") throw new Error("翻后局面不能使用翻前街道");
  const live = state.players.filter((player) => !player.folded);
  const actor = live.find((player) => player.seat === state.actingSeat);
  if (!actor) throw new Error("公开状态缺少当前玩家");
  const opponents = live.filter((player) => player.seat !== state.actingSeat);
  const lastPreflopAggressor = [...state.actions].reverse().find(
    (item) => item.street === "preflop" &&
      (item.kind === "raise" || item.kind === "all-in"),
  )?.actorSeat;
  const opponent = opponents[0];
  const inPosition = opponents.length === 1 && opponent
    ? POSTFLOP_ORDER.indexOf(actor.position) > POSTFLOP_ORDER.indexOf(opponent.position)
    : state.pendingSeats.filter((seat) => seat !== state.actingSeat).length === 0;
  const effectiveStack = opponents.length
    ? Math.min(actor.stack, ...opponents.map((player) => player.stack))
    : actor.stack;
  const type = potType(state.actions);
  const line = lineFor(state, lastPreflopAggressor);
  const rangeShiftCard = isRangeShiftCard(state, texture);
  const initiative = lastPreflopAggressor === state.actingSeat;
  const nodeId = [
    "pfs2",
    state.street,
    type,
    inPosition ? "ip" : "oop",
    initiative ? "init" : "noinit",
    line,
    rangeShiftCard ? "shift" : "blank",
    texture.clusterId,
  ].join(":");
  return {
    version: 2,
    street: state.street,
    headsUp: opponents.length === 1,
    inPosition,
    initiative,
    lastToAct: inPosition,
    line,
    potType: type,
    spr: Number((effectiveStack / Math.max(1, state.pot)).toFixed(3)),
    playersBehind: state.pendingSeats.filter((seat) => seat !== state.actingSeat).length ||
      (inPosition ? 0 : opponents.length),
    textureCluster: texture.clusterId,
    rangeShiftCard,
    nodeId,
  };
}
