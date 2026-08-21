import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DEFAULT_TEACHING_PANEL_WIDTH,
  MAX_TEACHING_PANEL_WIDTH,
  MIN_TEACHING_PANEL_WIDTH,
} from "../ui/tableThemes";

type Props = {
  panelWidth: number;
  onPanelWidthChange: (width: number) => void;
  children: ReactNode;
};

function clampWidth(width: number) {
  return Math.min(MAX_TEACHING_PANEL_WIDTH, Math.max(MIN_TEACHING_PANEL_WIDTH, Math.round(width)));
}

export function ResizableWorkspace({ panelWidth, onPanelWidthChange, children }: Props) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const liveWidthRef = useRef(clampWidth(panelWidth));
  const [liveWidth, setLiveWidth] = useState(liveWidthRef.current);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const next = clampWidth(panelWidth);
    liveWidthRef.current = next;
    setLiveWidth(next);
  }, [panelWidth]);

  function updateLiveWidth(width: number) {
    const next = clampWidth(width);
    liveWidthRef.current = next;
    setLiveWidth(next);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!dragging || !workspaceRef.current) return;
    updateLiveWidth(workspaceRef.current.getBoundingClientRect().right - event.clientX);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
    onPanelWidthChange(liveWidthRef.current);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const changes: Record<string, number> = {
      ArrowLeft: panelWidth + 16,
      ArrowRight: panelWidth - 16,
      Home: MIN_TEACHING_PANEL_WIDTH,
      End: MAX_TEACHING_PANEL_WIDTH,
    };
    if (!(event.key in changes)) return;
    event.preventDefault();
    const next = clampWidth(changes[event.key]);
    updateLiveWidth(next);
    onPanelWidthChange(next);
  }

  return (
    <div
      className={`workspace resizable-workspace${dragging ? " is-resizing" : ""}`}
      data-testid="resizable-workspace"
      ref={workspaceRef}
      style={{
        gridTemplateColumns: `minmax(650px, 1fr) ${liveWidth}px`,
        "--teaching-panel-width": `${liveWidth}px`,
      } as CSSProperties}
    >
      {children}
      <div
        aria-label="调整教学分析区宽度"
        aria-orientation="vertical"
        aria-valuemax={MAX_TEACHING_PANEL_WIDTH}
        aria-valuemin={MIN_TEACHING_PANEL_WIDTH}
        aria-valuenow={liveWidth}
        className="workspace-resizer"
        onDoubleClick={() => {
          updateLiveWidth(DEFAULT_TEACHING_PANEL_WIDTH);
          onPanelWidthChange(DEFAULT_TEACHING_PANEL_WIDTH);
        }}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        role="separator"
        tabIndex={0}
      />
    </div>
  );
}
