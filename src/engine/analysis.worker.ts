import {
  analyzeDecision,
  type DecisionAnalysisInput,
  type DecisionFacts,
} from "./analysis";

type WorkerScope = {
  onmessage: ((event: MessageEvent<DecisionAnalysisInput>) => void) | null;
  postMessage: (message: { facts: DecisionFacts }) => void;
};

const scope = self as unknown as WorkerScope;
scope.onmessage = ({ data }) => {
  scope.postMessage({ facts: analyzeDecision(data) });
};
