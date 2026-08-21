import { useState } from "react";
import type { DesktopRepository } from "../data/repository";
import type { GameState } from "../game/game";
import type { GameplaySettings } from "../data/types";

type Operation = "idle" | "exporting" | "importing" | "confirming-clear" | "clearing";

export function HistoryPage({
  repository,
  hands,
  loading,
  onOpen,
  onRefresh,
  onGameplaySettingsImported,
}: {
  repository: DesktopRepository;
  hands: GameState[];
  loading: boolean;
  onOpen: (hand: GameState) => void;
  onRefresh: () => Promise<void>;
  onGameplaySettingsImported?: (settings: GameplaySettings) => void;
}) {
  const [operation, setOperation] = useState<Operation>("idle");
  const [notice, setNotice] = useState("");
  const busy = operation !== "idle";

  async function exportHands() {
    setOperation("exporting");
    setNotice("");
    try {
      const result = await repository.exportHands();
      if (!result.cancelled) setNotice(`已导出 ${result.count} 手牌局`);
    } catch {
      setNotice("导出历史牌局失败");
    } finally {
      setOperation("idle");
    }
  }

  async function importHands() {
    setOperation("importing");
    setNotice("");
    try {
      const result = await repository.importHands();
      if (!result.cancelled) {
        if (result.gameplaySettings)
          onGameplaySettingsImported?.(result.gameplaySettings);
        await onRefresh();
        setNotice(`已导入 ${result.imported} 手，跳过 ${result.skipped} 手重复记录`);
      }
    } catch {
      setNotice("导入历史牌局失败");
    } finally {
      setOperation("idle");
    }
  }

  async function clearHands() {
    setOperation("clearing");
    setNotice("");
    try {
      await repository.clearHands();
      await onRefresh();
      setNotice("历史牌局已清空");
    } catch {
      setNotice("清空历史牌局失败");
    } finally {
      setOperation("idle");
    }
  }

  return (
    <div className="placeholder history-page">
      <div className="history-heading">
        <div>
          <p className="eyebrow">完整状态 · 可精确重放</p>
          <h1>历史牌局</h1>
          <p>每手保存随机种子、完整行动和结算；导出文件不包含 API Key。</p>
        </div>
        <div className="history-tools">
          <button disabled={busy} onClick={() => void exportHands()}>
            {operation === "exporting" ? "正在导出…" : "导出 JSON"}
          </button>
          <button disabled={busy} onClick={() => void importHands()}>
            {operation === "importing" ? "正在导入…" : "导入 JSON"}
          </button>
          <button className="danger" disabled={busy} onClick={() => setOperation("confirming-clear")}>
            清空历史
          </button>
        </div>
      </div>

      {operation === "confirming-clear" ? (
        <div className="clear-confirm" role="alertdialog" aria-label="确认清空历史">
          <span>清空后无法撤销，普通设置和 Keychain 密钥不会删除。</span>
          <button onClick={() => setOperation("idle")}>取消</button>
          <button className="danger" onClick={() => void clearHands()}>确认清空</button>
        </div>
      ) : null}
      {operation === "clearing" ? <button className="operation-state" disabled>正在清空…</button> : null}
      {notice ? <p className="history-notice" role="status">{notice}</p> : null}

      <div className="history">
        {loading ? (
          <div className="panel">正在读取本地历史…</div>
        ) : hands.length ? (
          hands.map((hand) => (
            <button data-testid="history-record" onClick={() => onOpen(hand)} key={`${hand.seed}:${hand.handNo}`}>
              <b>第 {hand.handNo} 手</b>
              <span>{hand.result?.summary}</span>
              <small>种子 {hand.seed} · {hand.log.length} 个动作</small>
            </button>
          ))
        ) : (
          <div className="panel">还没有完成的牌局。先打完一手。</div>
        )}
      </div>
    </div>
  );
}
