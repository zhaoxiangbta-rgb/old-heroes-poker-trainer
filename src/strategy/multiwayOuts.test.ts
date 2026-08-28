import { describe, expect, it } from "vitest";
import { classifyMultiwayOuts } from "./multiwayOuts";

describe("multiway clean, dirty and shared outs", () => {
  it("marks low-flush cards dirty against a higher flush range", () => {
    const facts = classifyMultiwayOuts(
      ["8h", "7h"],
      ["Ah", "2h", "Kc"],
      { 1: [{ cards: ["Qh", "Jh"], weight: 1 }] },
    );

    expect(facts.dirty).toContain("3h");
    expect(facts.clean).not.toContain("3h");
    expect(facts.reverseImpliedRisk).toBeGreaterThan(0);
  });

  it("counts a board straight as shared rather than a full clean out", () => {
    const facts = classifyMultiwayOuts(
      ["Ac", "2d"],
      ["9h", "8s", "7c", "6d"],
      { 2: [{ cards: ["Kc", "Qd"], weight: 1 }] },
    );

    expect(facts.shared).toContain("5h");
    expect(facts.clean).not.toContain("5h");
  });

  it("keeps a nut-flush card clean when it wins against every representative", () => {
    const facts = classifyMultiwayOuts(
      ["Ah", "Qh"],
      ["Jh", "7h", "2c"],
      { 3: [{ cards: ["Jc", "Jd"], weight: 1 }] },
    );

    expect(facts.clean).toContain("3h");
    expect(facts.dirty).not.toContain("3h");
  });

  it("marks a board-pair card that reverses the leader as counterfeit", () => {
    const facts = classifyMultiwayOuts(
      ["Ac", "2d"],
      ["Ah", "Kd", "2c"],
      { 4: [{ cards: ["Ad", "Qd"], weight: 1 }] },
    );

    expect(facts.counterfeit).toContain("Ks");
    expect(facts.reverseImpliedRisk).toBeGreaterThan(0);
  });

  it("never returns a known card as an out", () => {
    const known = ["8h", "7h", "Ah", "2h", "Kc"];
    const facts = classifyMultiwayOuts(
      ["8h", "7h"],
      ["Ah", "2h", "Kc"],
      { 1: [{ cards: ["Qh", "Jh"], weight: 1 }] },
    );

    for (const card of [...facts.clean, ...facts.dirty, ...facts.shared, ...facts.counterfeit]) {
      expect(known).not.toContain(card);
    }
  });
});
