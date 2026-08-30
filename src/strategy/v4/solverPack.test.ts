import { describe, expect, it } from "vitest";
import { encodeSolverPackV4, loadSolverPackV4, sha256HexV4, type SolverPackV4 } from "./solverPack";

function pack(): SolverPackV4 {
  return {
    schemaVersion: 4,
    strategyVersion: "strategy-v4.0.0",
    source: {
      project: "amaster97/poker_solver",
      version: "1.11.0",
      license: "MIT",
      algorithm: "DCFR",
      generatedAt: "2026-08-30T00:00:00.000Z",
      sourceHash: "1".repeat(64),
    },
    nodes: [{
      id: "river:test:x",
      street: "river",
      board: ["As", "7c", "2d", "Kh", "5s"],
      boardFamily: "bf3:river:ace-high:unpaired:two-tone:gutshot-rich:s3",
      hero: ["Ah", "Td"],
      opponentHandClasses: ["QQ", "AQo"],
      history: "x",
      actingPlayer: 0,
      potBb: 10,
      effectiveStackBb: 100,
      reachProbability: 0.98,
      actions: [
        { kind: "check", frequency: 0.6, evBb: 10 },
        { kind: "bet", potFraction: 0.75, frequency: 0.4, evBb: 10.1 },
      ],
    }],
  };
}

describe("SolverPackV4", () => {
  it("encodes deterministically and validates sha256", async () => {
    const bytes = encodeSolverPackV4(pack());
    expect(encodeSolverPackV4(pack())).toEqual(bytes);
    const sha256 = await sha256HexV4(bytes);
    const loaded = await loadSolverPackV4(bytes, { sha256, byteLength: bytes.byteLength });
    expect(loaded.nodes[0].actions.reduce((sum, action) => sum + action.frequency, 0)).toBeCloseTo(1, 8);
  });

  it("rejects a damaged hash", async () => {
    const bytes = encodeSolverPackV4(pack());
    await expect(loadSolverPackV4(bytes, { sha256: "0".repeat(64), byteLength: bytes.byteLength }))
      .rejects.toThrow("哈希");
  });

  it("rejects invalid frequencies and illegal actions", async () => {
    const broken = pack();
    broken.nodes[0].actions[0].frequency = 2;
    const bytes = encodeSolverPackV4(broken);
    const sha256 = await sha256HexV4(bytes);
    await expect(loadSolverPackV4(bytes, { sha256, byteLength: bytes.byteLength }))
      .rejects.toThrow("频率");
  });
});
