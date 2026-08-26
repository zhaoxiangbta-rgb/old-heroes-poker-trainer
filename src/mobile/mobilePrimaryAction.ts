import {
  actionForTarget,
  type GameAction,
  type GameState,
} from "../game/game";

export type MobilePrimaryMode = "call" | "bet" | "raise" | "all-in";

export type MobilePrimaryAction = {
  action: GameAction;
  label: string;
  mode: MobilePrimaryMode;
};

export function mobileBetChoices(game: GameState): number[] {
  const hero = game.players[game.heroSeat];
  const callTo = hero.streetBet + game.legal.callAmount;
  const choices: number[] = [];

  if (game.legal.canCall) choices.push(callTo);
  if (!game.legal.canRaise) return choices;

  for (
    let target = game.legal.minRaiseTo;
    target <= game.legal.maxRaiseTo;
    target += 1
  ) {
    if (target !== callTo) choices.push(target);
  }
  return choices;
}

export function mobilePrimaryAction(
  game: GameState,
  amount: number,
): MobilePrimaryAction {
  const action = actionForTarget(game, amount);
  if (action.type === "call") {
    return {
      action,
      label: `跟注 ${game.legal.callAmount}`,
      mode: "call",
    };
  }
  if (action.type !== "raise") {
    throw new Error("当前金额不能作为主操作");
  }
  if (action.to === game.legal.maxRaiseTo) {
    return { action, label: "ALL IN", mode: "all-in" };
  }
  return {
    action,
    label: game.legal.canCall ? `加注到 ${action.to}` : `下注 ${action.to}`,
    mode: game.legal.canCall ? "raise" : "bet",
  };
}
