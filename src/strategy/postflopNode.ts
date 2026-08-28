import type { Position, Street } from "../game/game";
import type { PostflopTexture } from "./postflopTexture";
import type { PublicAction, PublicDecisionState } from "./types";

export type HeadsUpPotType = "limped" | "srp" | "3bp" | "4bp";
export type HeadsUpPostflopLine =
  | "first-to-act"
  | "checked-to"
  | "cbet"
  | "delayed-cbet"
  | "facing-bet"
  | "facing-raise";

export type HeadsUpPostflopNode = {
  street: Exclude<Street, "preflop">;
  potType: HeadsUpPotType;
  inPosition: boolean;
  initiative: boolean;
  line: HeadsUpPostflopLine;
  facingFraction: number;
  textureCluster: string;
  nodeId: string;
};

const POSTFLOP_ORDER: Position[] = ["SB", "BB", "UTG", "HJ", "CO", "BTN"];

function isAggressive(action: PublicAction) {
  return action.kind === "bet" || action.kind === "raise" || action.kind === "all-in";
}

function potType(actions: PublicAction[]): HeadsUpPotType {
  const raises = actions.filter(
    (action) => action.street === "preflop" &&
      (action.kind === "raise" || action.kind === "all-in"),
  ).length;
  if (raises === 0) return "limped";
  if (raises === 1) return "srp";
  if (raises === 2) return "3bp";
  return "4bp";
}

function actedOnlyPassively(actions: PublicAction[]) {
  return actions.length > 0 && actions.every(
    (action) => action.kind === "check" || action.kind === "fold",
  );
}

function previousStreet(street: Exclude<Street, "preflop">): Street | undefined {
  if (street === "turn") return "flop";
  if (street === "river") return "turn";
  return undefined;
}

function classifyLine(
  state: PublicDecisionState,
  initiativeSeat: number | undefined,
): { line: HeadsUpPostflopLine; facingFraction: number } {
  const streetActions = state.actions.filter((action) => action.street === state.street);
  const lastAggressive = [...streetActions].reverse().find(isAggressive);
  if (lastAggressive) {
    return {
      line: lastAggressive.kind === "raise" ? "facing-raise" : "facing-bet",
      facingFraction: Number(
        (lastAggressive.amount / Math.max(1, lastAggressive.potBefore)).toFixed(3),
      ),
    };
  }

  const actorHasInitiative = initiativeSeat === state.actingSeat;
  const priorStreet = previousStreet(state.street as Exclude<Street, "preflop">);
  if (actorHasInitiative && priorStreet) {
    const priorActions = state.actions.filter((action) => action.street === priorStreet);
    if (actedOnlyPassively(priorActions)) {
      return { line: "delayed-cbet", facingFraction: 0 };
    }
  }
  if (actorHasInitiative) return { line: "cbet", facingFraction: 0 };
  if (streetActions.some((action) => action.kind === "check")) {
    return { line: "checked-to", facingFraction: 0 };
  }
  return { line: "first-to-act", facingFraction: 0 };
}

export function classifyHeadsUpPostflopNode(
  state: PublicDecisionState,
  texture: PostflopTexture,
): HeadsUpPostflopNode | undefined {
  if (state.street === "preflop") return undefined;
  const live = state.players.filter((player) => !player.folded);
  if (live.length !== 2) return undefined;
  const actor = live.find((player) => player.seat === state.actingSeat);
  const opponent = live.find((player) => player.seat !== state.actingSeat);
  if (!actor || !opponent) return undefined;

  const lastPreflopAggressor = [...state.actions]
    .reverse()
    .find((action) => action.street === "preflop" &&
      (action.kind === "raise" || action.kind === "all-in"))?.actorSeat;
  const initiative = lastPreflopAggressor === state.actingSeat;
  const inPosition = POSTFLOP_ORDER.indexOf(actor.position) >
    POSTFLOP_ORDER.indexOf(opponent.position);
  const { line, facingFraction } = classifyLine(state, lastPreflopAggressor);
  const type = potType(state.actions);
  const nodeId = [
    "hupf1",
    state.street,
    type,
    inPosition ? "ip" : "oop",
    initiative ? "init" : "noinit",
    line,
    facingFraction.toFixed(3),
    texture.clusterId,
  ].join(":");

  return {
    street: state.street,
    potType: type,
    inPosition,
    initiative,
    line,
    facingFraction,
    textureCluster: texture.clusterId,
    nodeId,
  };
}
