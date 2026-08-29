import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PreActionInsights } from "../components/PreActionInsights";
import type { GameState } from "../game/game";
import type { PreActionInsightState } from "../insights/types";

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function MobileInsightSummary({ state, game }: { state: PreActionInsightState; game: GameState }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef(0);
  const bestPath = state.exact?.handClasses
    .filter((item) => item.byRiver > 0)
    .sort((first, second) => second.byRiver - first.byRiver)[0];
  const summary = state.status === "calculating-exact" || state.status === "calculating-ranges"
    ? "分析中…"
    : bestPath
      ? `${bestPath.name} ${percent(bestPath.byRiver)} · 坚果 ${percent(state.exact?.absoluteNuts ?? 0)}`
      : state.ranges?.length
        ? `对手范围 ${state.ranges.length} 人`
        : "分析暂不可用";

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab") {
        const dialog = closeRef.current?.closest('[role="dialog"]');
        const focusable = dialog?.querySelectorAll<HTMLElement>('button,[href],input,[tabindex]:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        className="mobile-insight-summary"
        type="button"
        aria-label={`打开下注前分析：${summary}`}
        onClick={() => setOpen(true)}
      >
        <span>下注前</span><b>{summary}</b><i aria-hidden="true">›</i>
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          className="mobile-insight-sheet-backdrop"
          data-testid="mobile-insight-backdrop"
          onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <section
            className="mobile-insight-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="下注前分析详情"
            onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientY ?? 0; }}
            onTouchEnd={(event) => {
              const end = event.changedTouches[0]?.clientY ?? touchStart.current;
              if (end - touchStart.current > 60) setOpen(false);
            }}
          >
            <div className="mobile-insight-sheet__handle" />
            <header><b>下注前分析</b><button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="关闭下注前分析">×</button></header>
            <div className="mobile-insight-sheet__body">
              <PreActionInsights state={state} game={game} />
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
