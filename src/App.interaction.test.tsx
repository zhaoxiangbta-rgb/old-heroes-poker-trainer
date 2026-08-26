// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { SessionLedger } from "./App";
import { ActionControls } from "./components/ActionControls";
import { PokerTable } from "./components/PokerTable";
import { bestHand, compareHands } from "./engine/evaluator";
import {
  advanceIfRoundComplete,
  newGame,
  normalizeGameState,
  type GameState,
  type Street,
} from "./game/game";
import { planAfterHero, planInitialDeal, type PlaybackFrame } from "./game/playback";
import { useGamePlayback } from "./game/useGamePlayback";
import { createMemoryRepository } from "./data/memoryRepository";
import type { DecisionAssessment } from "./training/types";
import { isActionCandidate } from "./game/actionDealing";
import { normalizeGameplaySettings } from "./ui/tableThemes";
import { DEFAULT_PLAYER_PROFILES } from "./policy/playerProfiles";
import { APP_VERSION_LABEL } from "./appVersion";

const playbackHooks = vi.hoisted(() => ({
  actualUseGamePlayback: undefined as typeof useGamePlayback | undefined,
}));
const soundHarness = vi.hoisted(() => ({
  play: vi.fn(),
  setEnabled: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock("./game/sound", async () => {
  const actual = await vi.importActual<typeof import("./game/sound")>("./game/sound");
  return { ...actual, createSoundPlayer: () => soundHarness };
});

describe("desktop history repository integration", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Date, "now").mockReturnValue(42);
    vi.mocked(useGamePlayback).mockImplementation((initial) =>
      playbackHooks.actualUseGamePlayback!(initial),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("loads stored history while starting a fresh 200-chip session", async () => {
    const repository = createMemoryRepository();
    const stored = settledShowdownState();
    stored.players[stored.heroSeat].stack = 999;
    await repository.saveHand(stored);

    render(<App repository={repository} />);
    expect(screen.getByText("开发预览 · 数据不持久")).toBeVisible();
    expect(screen.getByText(APP_VERSION_LABEL)).toBeVisible();
    expect(screen.getByText("本街投入到")).toBeVisible();
    expect(screen.getAllByText("200 筹码").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "历史牌局" }));
    await waitFor(() => expect(screen.getByText(stored.result!.summary)).toBeVisible());
  });

  it("restores and persists the teaching panel width", async () => {
    const repository = createMemoryRepository();
    await repository.saveGameplaySettings(normalizeGameplaySettings({
      tableProfileId: "balanced",
      tableThemeId: "classic-green",
      teachingPanelWidth: 400,
    }));
    const saveGameplaySettings = vi.spyOn(repository, "saveGameplaySettings");

    render(<App repository={repository} />);
    const separator = await screen.findByRole("separator", {
      name: "调整教学分析区宽度",
    });
    await waitFor(() => expect(separator).toHaveAttribute("aria-valuenow", "400"));
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    await waitFor(() => expect(saveGameplaySettings).toHaveBeenLastCalledWith(expect.objectContaining({
      tableProfileId: "balanced",
      tableThemeId: "classic-green",
      teachingPanelWidth: 416,
    })));
  });

  it("saves a completed hand once and reports a persistent save failure", async () => {
    const repository = createMemoryRepository();
    vi.spyOn(repository, "saveHand").mockRejectedValue(new Error("private database detail"));
    stubPlayback(settledShowdownState(), "hand-complete");

    render(<App repository={repository} />);
    await waitFor(() => expect(screen.getByText("本手未保存")).toBeVisible());
    expect(repository.saveHand).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/private database detail/)).not.toBeInTheDocument();
  });

  it("keeps Start next hand in normal training even when history contains a formal weakness", async () => {
    const repository = createMemoryRepository();
    const loadHands = vi.spyOn(repository, "loadHands");
    for (let index = 0; index < 5; index += 1) {
      const historical = settledShowdownState();
      historical.seed = 500 + index;
      historical.handNo = index + 1;
      historical.assessments = [weakAssessment(index)];
      await repository.saveHand(historical);
    }
    const replaceGame = stubPlayback(settledShowdownState(), "hand-complete");

    render(<App repository={repository} />);
    await waitFor(() => expect(loadHands).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: /开始下一手/ }));

    expect(replaceGame).toHaveBeenCalledTimes(1);
    const next = replaceGame.mock.calls[0][0];
    expect(next.trainingTarget).toEqual({ mode: "none" });
    expect(next.seed).toBeGreaterThanOrEqual(43);
    expect(next.seed).toBeLessThanOrEqual(54);
    expect(isActionCandidate(next)).toBe(true);
  });

  it("keeps the current snapshot and applies renamed habits to the next hand", async () => {
    const repository = createMemoryRepository();
    const renamed = DEFAULT_PLAYER_PROFILES.map((profile) => ({
      ...profile,
      displayName: `新${profile.displayName}`,
    }));
    await repository.saveGameplaySettings(
      normalizeGameplaySettings({ playerProfiles: renamed }),
    );
    const current = settledShowdownState();
    const visibleOldName = current.players.find(
      (player) => player.playerId !== "hero",
    )!.name;
    const replaceGame = stubPlayback(current, "hand-complete");

    render(<App repository={repository} />);
    await waitFor(() => expect(replaceGame).toHaveBeenCalled());
    expect(screen.getAllByText(visibleOldName).length).toBeGreaterThan(0);
    replaceGame.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /开始下一手/ }));

    expect(replaceGame).toHaveBeenCalledTimes(1);
    const next = replaceGame.mock.calls[0][0] as GameState;
    expect(next.playerProfiles.map((profile) => profile.displayName)).toEqual(
      renamed.map((profile) => profile.displayName),
    );
    expect(
      next.players
        .filter((player) => player.playerId !== "hero")
        .every((player) => player.name.startsWith("新")),
    ).toBe(true);
  });

  it("keeps historical names and pinned profiles isolated from later settings", async () => {
    const repository = createMemoryRepository();
    const stored = settledShowdownState();
    await repository.saveHand(stored);
    await repository.saveGameplaySettings(
      normalizeGameplaySettings({
        playerProfiles: DEFAULT_PLAYER_PROFILES.map((profile) => ({
          ...profile,
          displayName: `改${profile.displayName}`,
        })),
      }),
    );
    const loaded = await repository.loadHands();
    expect(loaded[0].players.map((player) => player.name)).toEqual(
      stored.players.map((player) => player.name),
    );
    expect(loaded[0].policyDecisions).toEqual(stored.policyDecisions);
  });
});

vi.mock("./game/useGamePlayback", async () => {
  const actual = await vi.importActual<typeof import("./game/useGamePlayback")>(
    "./game/useGamePlayback",
  );
  playbackHooks.actualUseGamePlayback = actual.useGamePlayback;
  return {
    ...actual,
    useGamePlayback: vi.fn(actual.useGamePlayback),
  };
});

function showdownRevealState() {
  const state = newGame(42, 1, undefined, [
    { name: "你", stack: 200, buyIn: 200, rebuys: 0 },
    { name: "青禾", stack: 200, buyIn: 200, rebuys: 0 },
  ]);
  const villain = state.players.find((player) => player.seat !== state.heroSeat)!;
  state.street = "river";
  state.board = ["Ts", "Qs", "Th", "Qh", "Td"];
  state.pot = 100;
  state.pending = [];
  state.toAct = -1;
  state.phase = "playing";
  state.result = undefined;
  state.players.forEach((player) => {
    player.folded = false;
    player.allIn = true;
    player.revealed = true;
    player.stack = 0;
    player.streetBet = 0;
  });
  villain.hole = ["Kd", "Ac"];
  return normalizeGameState(state);
}

function allInRunoutState(street: Street) {
  const state = newGame(42, 1, undefined, [
    { name: "你", stack: 200, buyIn: 200, rebuys: 0 },
    { name: "青禾", stack: 200, buyIn: 200, rebuys: 0 },
  ]);
  const hero = state.players[state.heroSeat];
  const villain = state.players.find((player) => player.seat !== state.heroSeat)!;
  while (state.street !== street) {
    if (state.street === "preflop") {
      state.street = "flop";
      state.burn.push(state.deck.shift()!);
      state.board.push(...state.deck.splice(0, 3));
    } else {
      state.street = state.street === "flop" ? "turn" : "river";
      state.burn.push(state.deck.shift()!);
      state.board.push(state.deck.shift()!);
    }
  }
  hero.stack = 40;
  hero.streetBet = 10;
  hero.totalBet = 10;
  hero.allIn = false;
  villain.stack = 0;
  villain.streetBet = 50;
  villain.totalBet = 50;
  villain.allIn = true;
  state.pot = 60;
  state.currentBet = 50;
  state.pending = [hero.seat];
  state.toAct = hero.seat;
  state.result = undefined;
  state.raiseToReopen = state.players.map(() => 0);
  return normalizeGameState(state);
}

function settledShowdownState() {
  const state = showdownRevealState();
  state.phase = "review";
  state.pot = 0;
  state.result = {
    reason: "showdown",
    winners: [state.players.find((player) => player.seat !== state.heroSeat)!.seat],
    summary: "青禾赢得 100 筹码",
  };
  return normalizeGameState(state);
}

function weakAssessment(index: number): DecisionAssessment {
  return {
    id: `weak-${index}`,
    handNo: index + 1,
    logIndex: 0,
    street: "flop",
    actual: { type: "call" },
    recommended: { type: "fold" },
    candidates: [],
    normalizedEvLoss: 0.2,
    severity: "major",
    intent: "pot-control",
    tags: ["multiway-top-pair"],
    coreRules: [],
    facts: { relevantTags: ["multiway-top-pair"] },
  };
}

function reviewDetailState() {
  const state = newGame(99, 1, undefined, [
    { name: "你", stack: 200, buyIn: 200, rebuys: 0 },
    { name: "青禾", stack: 200, buyIn: 200, rebuys: 0 },
    { name: "阿岚", stack: 200, buyIn: 200, rebuys: 0 },
    { name: "北辰", stack: 200, buyIn: 200, rebuys: 0 },
  ]);
  state.street = "river";
  state.board = ["Ah", "Kd", "Qc", "2s", "3c"];
  state.pot = 135;
  state.pending = [];
  state.phase = "playing";
  state.result = undefined;
  const fixtures = [
    { hole: ["As", "Ac"] as const, stack: 140, totalBet: 60, folded: false },
    { hole: ["Jh", "Th"] as const, stack: 155, totalBet: 45, folded: false },
    { hole: ["Js", "Td"] as const, stack: 170, totalBet: 30, folded: false },
    { hole: ["4d", "4s"] as const, stack: 200, totalBet: 0, folded: true },
  ];
  state.players.forEach((player, seat) => {
    const fixture = fixtures[seat];
    player.hole = [...fixture.hole];
    player.stack = fixture.stack;
    player.totalBet = fixture.totalBet;
    player.streetBet = 0;
    player.folded = fixture.folded;
    player.allIn = false;
    player.revealed = false;
  });
  return advanceIfRoundComplete(state);
}

function stubPlayback(
  game: GameState,
  phase: Parameters<typeof PokerTable>[0]["phase"],
  frame?: PlaybackFrame,
) {
  const replaceGame = vi.fn();
  vi.mocked(useGamePlayback).mockReturnValue({
    game,
    phase,
    frame,
    receipt: "",
    busy: phase !== "hero-turn",
    visualTokens: [],
    recentActions: game.log.slice(-3),
    submit: vi.fn(),
    replaceGame,
  });
  return replaceGame;
}

describe("table action feedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockReturnValue(42);
    localStorage.clear();
    soundHarness.play.mockClear();
    vi.mocked(useGamePlayback).mockImplementation((initial) =>
      playbackHooks.actualUseGamePlayback!(initial),
    );
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows the Old Heroes table brand and groups the emphasized all-in size", () => {
    render(<App />);
    expect(screen.getByText("老英雄牌局")).toBeVisible();
    const presets = screen.getByTestId("size-presets");
    expect(presets.querySelectorAll("button")).toHaveLength(4);
    expect(
      screen.getByRole("button", { name: "ALL IN" }),
    ).toHaveClass("all-in-action");
  });

  it("uses the same face-up card contract for hole cards and the board", () => {
    const game = newGame(42);
    game.players[game.heroSeat].hole = ["Ah", "Ks"];
    game.board = ["Qd", "Jc", "Ts"];
    render(<PokerTable game={game} phase="hero-turn" frame={undefined} visualTokens={[]} recentActions={[]} themeId="classic-green" />);
    const heroCards = document.querySelectorAll(".seat.hero [data-card-kind='face-up']");
    const boardCards = document.querySelectorAll(".board [data-card-kind='face-up']");
    expect(heroCards).toHaveLength(2);
    expect(boardCards).toHaveLength(3);
    expect(document.querySelectorAll(".card.suit-red")).toHaveLength(2);
    expect(document.querySelectorAll(".card.suit-black")).toHaveLength(3);
    expect(document.querySelectorAll(".card.suit-red > .suit-symbol.suit-red")).toHaveLength(2);
    expect(document.querySelectorAll(".card.suit-black > .suit-symbol.suit-black")).toHaveLength(3);
  });

  it("splits amount controls and equal basic actions without changing fold text", () => {
    render(<App />);
    expect(screen.getByTestId("amount-actions")).toBeVisible();
    const basics = screen.getByTestId("basic-actions");
    expect(basics.querySelectorAll("button")).toHaveLength(2);
    const fold = screen.getByRole("button", { name: "弃牌" });
    fireEvent.click(fold);
    expect(fold).toHaveTextContent("弃牌");
  });

  it("acknowledges the first click immediately and locks every action control", () => {
    render(<App />);
    const confirm = screen.getByRole("button", { name: "确认金额" });
    const submittedAmount = screen.getByRole("spinbutton").getAttribute("value");
    fireEvent.click(confirm);
    expect(screen.getByTestId("submit-receipt")).toHaveTextContent(
      `✓ 跟注 ${submittedAmount}`,
    );
    expect(confirm).toHaveTextContent("确认金额");
    expect(screen.queryByText(/已提交/)).not.toBeInTheDocument();
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("button", { name: "过牌" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "弃牌" })).toBeDisabled();
    expect(screen.getByRole("spinbutton")).toBeDisabled();
  });

  it("shows seeded friend names with Chinese-first position labels", () => {
    render(<App />);
    expect(screen.getAllByText(/庄位/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/枪口位/).length).toBeGreaterThan(0);
    const visibleFriends = ["阿岚", "北辰", "墨川", "青禾", "老周", "小满"].filter(
      (name) => screen.queryAllByText(new RegExp(name)).length > 0,
    );
    expect(visibleFriends).toHaveLength(5);
  });

  it("shows current chips, buy-ins, rebuys and signed session profit", () => {
    const game = newGame(42);
    const hero = game.players.find((player) => player.name === "你")!;
    const winner = game.players.find((player) => player.name !== "你")!;
    hero.stack = 260;
    hero.buyIn = 400;
    hero.rebuys = 1;
    winner.stack = 260;
    winner.buyIn = 200;

    render(<SessionLedger players={game.players} />);

    const row = screen.getByTestId(`ledger-player-${hero.seat}`);
    expect(row).toHaveTextContent("你");
    expect(row).toHaveTextContent("当前 260");
    expect(row).toHaveTextContent("买入 400");
    expect(row).toHaveTextContent("补码 1");
    expect(row).toHaveTextContent("盈亏 -140");
    expect(row.querySelector("strong")).toHaveClass("profit-loss");
    expect(
      screen.getByTestId(`ledger-player-${winner.seat}`).querySelector("strong"),
    ).toHaveClass("profit-win");
  });

  it("fills a recommended size without submitting it", () => {
    render(<App />);
    const input = screen.getByRole("spinbutton");
    const presets = screen.getByTestId("size-presets");
    expect(presets.querySelectorAll("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "½池" }));
    expect(Number(input.getAttribute("value"))).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "确认金额" })).toBeEnabled();
    expect(screen.getByTestId("submit-receipt")).toHaveTextContent("等待操作");
  });

  it("submits a maximum legal all-in immediately and locks the controls", () => {
    render(<App />);
    const allIn = screen.getByRole("button", { name: "ALL IN" });
    fireEvent.click(allIn);
    expect(screen.getByTestId("submit-receipt")).toHaveTextContent("✓ 全下 200");
    expect(allIn).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认金额" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "过牌" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "弃牌" })).toBeDisabled();
  });

  it("uses the all-in control for a stack-exhausting call", () => {
    const game = newGame(42);
    const hero = game.players[game.heroSeat];
    hero.stack = 3;
    game.legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: false,
      callAmount: 3,
      minRaiseTo: 0,
      maxRaiseTo: hero.streetBet + 3,
    };
    const onAction = vi.fn();
    render(
      <ActionControls
        game={game}
        busy={false}
        receipt=""
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ALL IN" }));
    expect(onAction).toHaveBeenCalledWith({ type: "call" });
  });

  it("keeps all-in visible but disabled when raising is closed and a call leaves chips", () => {
    const game = newGame(42);
    const hero = game.players[game.heroSeat];
    hero.stack = 20;
    game.legal = {
      canFold: true,
      canCheck: false,
      canCall: true,
      canRaise: false,
      callAmount: 3,
      minRaiseTo: 0,
      maxRaiseTo: hero.streetBet + 20,
    };
    render(
      <ActionControls game={game} busy={false} receipt="" onAction={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "ALL IN" })).toBeDisabled();
  });

  it("renders gold all-in treatment only after a real all-in action", () => {
    render(<App />);
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "确认金额" }));
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(80));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId("all-in-overlay")).toHaveTextContent("ALL IN");
    expect(screen.getByTestId("all-in-overlay")).toHaveTextContent("全下 · 200");
  });

  it("shows exactly one thinking opponent before revealing the action", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "确认金额" }));
    act(() => vi.advanceTimersByTime(0));
    act(() => vi.advanceTimersByTime(80));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText(/正在思考/, { selector: ".action-banner strong" })).toBeVisible();
    expect(document.querySelectorAll(".seat.thinking")).toHaveLength(1);
  });

  it("shows an explicit showdown state without live controls or decision sidebar", () => {
    stubPlayback(showdownRevealState(), "showdown");

    render(<App />);

    expect(screen.getByText("摊牌亮牌", { selector: ".action-banner strong" })).toBeVisible();
    expect(screen.getByText("摊牌中")).toBeVisible();
    expect(screen.getByText("摊牌亮牌中…")).toBeVisible();
    expect(screen.queryByTestId("amount-actions")).not.toBeInTheDocument();
    expect(screen.queryByText("当前决策")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /开始下一手/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/需跟注/)).not.toBeInTheDocument();
  });

  it("reveals hole cards one at a time while keeping every decision surface locked", () => {
    const game = newGame(42);
    const firstDeal = planInitialDeal(game, 1, false)[0];
    stubPlayback(game, "dealing-hole", firstDeal);

    render(<App />);

    expect(screen.getByText("正在发底牌", { selector: ".action-banner strong" })).toBeVisible();
    expect(document.querySelectorAll(".hole .card")).toHaveLength(1);
    expect(document.querySelector(`.seat${firstDeal.dealCard!.seat}`)).toHaveClass("receiving");
    expect(screen.queryByTestId("amount-actions")).not.toBeInTheDocument();
    expect(screen.queryByText("当前决策")).not.toBeInTheDocument();
  });

  it("reveals flop cards progressively without exposing partial engine state", () => {
    const game = newGame(1);
    const flop = planAfterHero(game, { type: "call" }, 10, false).find(
      (candidate) => candidate.phase === "dealing" && candidate.visibleBoardCount === 1,
    )!;
    expect(flop.state.board).toHaveLength(3);
    stubPlayback(flop.state, "dealing", flop);

    render(<App />);

    expect(document.querySelectorAll(".board .card")).toHaveLength(1);
    expect(document.querySelectorAll(".board .empty-card")).toHaveLength(4);
    expect(screen.queryByTestId("amount-actions")).not.toBeInTheDocument();
  });

  it("uses the deal cue for a reveal frame instead of a chip cue", () => {
    const game = showdownRevealState();
    stubPlayback(game, "showdown", {
      id: 9001,
      phase: "showdown",
      state: game,
      effect: "reveal",
      overlapMs: 0,
      durationMs: 220,
    });

    render(<App />);

    expect(soundHarness.play).toHaveBeenCalledWith("deal");
    expect(soundHarness.play).not.toHaveBeenCalledWith("chip-medium");
  });

  it.each(["preflop", "flop", "turn"] as const)(
    "hides every decision surface throughout an automatic %s all-in runout",
    (street) => {
      const frames = planAfterHero(
        allInRunoutState(street),
        { type: "call" },
        77,
        false,
      ).filter(
        (frame) => frame.phase === "settling-pot" || frame.phase === "dealing",
      );
      expect(frames.some((frame) => frame.phase === "settling-pot")).toBe(true);
      expect(frames.some((frame) => frame.phase === "dealing")).toBe(true);

      for (const frame of frames) {
        cleanup();
        stubPlayback(frame.state, frame.phase);
        render(<App />);
        expect(screen.queryByTestId("amount-actions")).not.toBeInTheDocument();
        expect(screen.queryByText("当前决策")).not.toBeInTheDocument();
        expect(screen.queryByText(/SPR/)).not.toBeInTheDocument();
        expect(screen.queryByText(/最高下注/)).not.toBeInTheDocument();
        expect(screen.queryByText(/需跟注/)).not.toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: /开始下一手/ }),
        ).not.toBeInTheDocument();
        if (frame.phase === "dealing") {
          expect(screen.getByText("正在发下一街…")).toBeVisible();
          expect(screen.queryByText("正在结算筹码…")).not.toBeInTheDocument();
        } else {
          expect(screen.getByText("正在结算筹码…")).toBeVisible();
          expect(screen.queryByText("正在发下一街…")).not.toBeInTheDocument();
        }
      }
    },
  );

  it("does not expose next hand early while showdown chips are still settling", () => {
    stubPlayback(settledShowdownState(), "settling-pot");

    render(<App />);

    expect(screen.queryByRole("button", { name: /开始下一手/ })).not.toBeInTheDocument();
    expect(screen.getByText("正在结算筹码…")).toBeVisible();
  });

  it("keeps the review fixture consistent with evaluator and pot rules", () => {
    const game = reviewDetailState();
    const allCards = [...game.board, ...game.players.flatMap((player) => player.hole)];
    expect(new Set(allCards)).toHaveLength(allCards.length);

    const ranks = new Map(
      game.players
        .filter((player) => !player.folded)
        .map((player) => [player.seat, bestHand([...player.hole, ...game.board])]),
    );
    for (const entry of game.result?.showdown ?? []) {
      const rank = ranks.get(entry.seat)!;
      expect(entry).toEqual({
        seat: entry.seat,
        handName: rank.name,
        bestCards: rank.cards,
        tiebreak: rank.tiebreak,
      });
    }
    for (const pot of game.result?.pots ?? []) {
      const best = pot.eligible.reduce((winner, seat) =>
        compareHands(ranks.get(seat)!, ranks.get(winner)!) > 0 ? seat : winner,
      );
      expect(pot.winners).toEqual(
        pot.eligible.filter((seat) => compareHands(ranks.get(seat)!, ranks.get(best)!) === 0),
      );
    }
  });

  it("renders review showdown details with hole cards, Chinese hand names and best-five cards", () => {
    stubPlayback(reviewDetailState(), "hand-complete");

    render(<App />);

    expect(screen.getByText("摊牌明细")).toBeVisible();
    expect(screen.getAllByText("青禾").length).toBeGreaterThan(1);
    expect(screen.getAllByText("顺子")).toHaveLength(2);
    expect(screen.getAllByText("最佳五张")).toHaveLength(3);
    expect(screen.getByText("Jh Th Ah Kd Qc")).toBeVisible();
    expect(screen.getByText("Js Td Ah Kd Qc")).toBeVisible();
    expect(screen.getAllByText("阿岚").length).toBeGreaterThan(1);
    expect(screen.getByText("三条")).toBeVisible();
    expect(screen.getByText("北辰：弃牌，只保留范围")).toBeVisible();
  });

  it("lists pot outcomes in order and marks split winners and refunds", () => {
    stubPlayback(reviewDetailState(), "hand-complete");

    render(<App />);

    const items = screen.getAllByTestId("pot-result");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("主池");
    expect(items[0]).toHaveTextContent("90");
    expect(items[0]).toHaveTextContent("青禾、阿岚 平分");
    expect(items[1]).toHaveTextContent("边池 1");
    expect(items[1]).toHaveTextContent("30");
    expect(items[1]).toHaveTextContent("青禾");
    expect(items[2]).toHaveTextContent("未被跟注筹码");
    expect(items[2]).toHaveTextContent("15");
    expect(items[2]).toHaveTextContent("你");
  });
});
