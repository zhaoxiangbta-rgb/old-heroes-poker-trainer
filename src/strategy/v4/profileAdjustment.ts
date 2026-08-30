import type { HandPlayerProfile } from "../../policy/playerProfiles";
import type { TableProfileId } from "../../policy/tableProfiles";
import type { Street } from "../../game/game";
import type { StrategyAction } from "../types";

const MAX_SHIFT = 0.15;

export type ProfileAdjustmentV4 = {
  actionKey: string;
  before: number;
  after: number;
  reason: string;
};

export type AdjustProfileInputV4 = {
  actions: readonly StrategyAction[];
  tableProfileId: TableProfileId;
  playerProfile?: HandPlayerProfile;
  street: Street;
};

function key(action: StrategyAction) {
  return action.toAmount === undefined ? action.action : `${action.action}:${action.toAmount}`;
}

function multiplier(action: StrategyAction, input: AdjustProfileInputV4) {
  let value = 1;
  if (input.tableProfileId === "friends") {
    if (action.action === "fold") value *= 0.85;
    if (action.action === "call") value *= 1.2;
    if (action.action === "raise" || action.action === "all-in") value *= 0.9;
  } else if (input.tableProfileId === "loose-wild") {
    if (action.action === "fold") value *= 0.72;
    if (action.action === "call") value *= 1.08;
    if (action.action === "raise" || action.action === "all-in") value *= 1.28;
  }
  if (input.playerProfile) {
    const loose = (input.playerProfile.effective.looseness - 50) / 50;
    const aggression = (input.playerProfile.effective.aggression - 50) / 50;
    if (action.action === "fold") value *= Math.max(0.55, 1 - loose * 0.25);
    if (action.action === "call") value *= Math.max(0.55, 1 + loose * 0.2);
    if (action.action === "raise" || action.action === "all-in") value *= Math.max(0.55, 1 + aggression * 0.25);
  }
  if (input.street === "river" && action.intent === "bluff" &&
    (action.action === "raise" || action.action === "all-in") &&
    (action.potFraction ?? 0) >= 0.75) {
    value = Math.min(value, 0.92);
  }
  return value;
}

function project(base: number[], desired: number[]) {
  const low = base.map((value) => Math.max(0, value - MAX_SHIFT));
  const high = base.map((value) => Math.min(1, value + MAX_SHIFT));
  const result = desired.map((value, index) => Math.max(low[index], Math.min(high[index], value)));
  for (let pass = 0; pass < 10; pass += 1) {
    const missing = 1 - result.reduce((sum, value) => sum + value, 0);
    if (Math.abs(missing) < 1e-12) break;
    const capacity = result.map((value, index) => missing > 0 ? high[index] - value : value - low[index]);
    const total = capacity.reduce((sum, value) => sum + value, 0);
    if (total <= 1e-12) break;
    result.forEach((_, index) => { result[index] += missing * capacity[index] / total; });
  }
  return result;
}

export function adjustProfileV4(input: AdjustProfileInputV4) {
  if (!input.actions.length) throw new Error("画像调频缺少标准策略动作");
  const base = input.actions.map((action) => action.frequency);
  const raw = input.actions.map((action) => action.frequency * multiplier(action, input));
  const total = raw.reduce((sum, value) => sum + value, 0);
  const desired = total > 0 ? raw.map((value) => value / total) : base;
  const projected = project(base, desired);

  // River large bluffs are allowed to become rarer for live profiles, never
  // more frequent than the solver baseline.
  input.actions.forEach((action, index) => {
    if (input.street === "river" && action.intent === "bluff" &&
      (action.action === "raise" || action.action === "all-in") &&
      (action.potFraction ?? 0) >= 0.75 && projected[index] > base[index]) {
      const excess = projected[index] - base[index];
      projected[index] = base[index];
      const receivers = projected.map((_, receiver) => receiver !== index ? receiver : -1).filter((receiver) => receiver >= 0);
      const receiverTotal = receivers.reduce((sum, receiver) => sum + projected[receiver], 0);
      receivers.forEach((receiver) => {
        projected[receiver] += receiverTotal > 0 ? excess * projected[receiver] / receiverTotal : excess / receivers.length;
      });
    }
  });

  const actions = input.actions.map((action, index) => ({ ...action, frequency: projected[index] }));
  const adjustments: ProfileAdjustmentV4[] = actions.map((action, index) => ({
    actionKey: key(action),
    before: base[index],
    after: action.frequency,
    reason: input.playerProfile
      ? `table:${input.tableProfileId}+player:${input.playerProfile.archetype}`
      : `table:${input.tableProfileId}`,
  }));
  return { actions, adjustments };
}
