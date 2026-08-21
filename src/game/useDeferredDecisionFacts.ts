import { useEffect, useState } from "react";
import type {
  DecisionAnalysisInput,
  DecisionFacts,
} from "../engine/analysis";
import {
  buildWeightedRange,
  friendGameLikelihood,
  removeBlocked,
  updateRange,
} from "../engine/ranges";
import { streetName, type GameState } from "./game";

export type DecisionFactsWorker = {
  onmessage: ((event: MessageEvent<{ facts: DecisionFacts }>) => void) | null;
  postMessage: (message: DecisionAnalysisInput) => void;
  terminate: () => void;
};

type WorkerFactory = () => DecisionFactsWorker;

function createWorker(): DecisionFactsWorker {
  return new Worker(new URL("../engine/analysis.worker.ts", import.meta.url), {
    type: "module",
  });
}

function decisionInput(game: GameState): DecisionAnalysisInput | undefined {
  if (game.phase !== "playing" || game.board.length < 3) return;
  const known = [...game.players[game.heroSeat].hole, ...game.board];
  let range = removeBlocked(
    buildWeightedRange("AA,KK,QQ,JJ,TT,99,AKs,AQs,AJs,KQs,AKo,AQo"),
    known,
  );
  for (const entry of game.log.filter((item) => item.actor !== "你")) {
    const size = entry.amount / Math.max(1, entry.potAfter - entry.amount);
    range = updateRange(
      range,
      friendGameLikelihood(
        entry.street,
        entry.action.includes("加注") ? "raise" : "call",
        size,
      ),
      `${streetName(entry.street)} ${entry.action}`,
    );
  }
  return {
    hero: game.players[game.heroSeat].hole,
    board: game.board,
    range,
    pot: game.pot,
    toCall: game.legal.callAmount,
    stack: game.players[game.heroSeat].stack,
    playersBehind: game.pending.filter((seat) => seat !== game.heroSeat).length,
    seed: game.seed,
  };
}

export function useDeferredDecisionFacts(
  game: GameState,
  enabled: boolean,
  workerFactory: WorkerFactory = createWorker,
) {
  const [facts, setFacts] = useState<DecisionFacts>();
  useEffect(() => {
    setFacts(undefined);
    if (!enabled) return;
    const input = decisionInput(game);
    if (!input) return;
    const worker = workerFactory();
    let active = true;
    worker.onmessage = ({ data }) => {
      if (active) setFacts(data.facts);
    };
    worker.postMessage(input);
    return () => {
      active = false;
      worker.terminate();
    };
  }, [enabled, game, workerFactory]);
  return facts;
}
