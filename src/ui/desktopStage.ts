export const DESKTOP_STAGE_WIDTH = 1090;
export const DESKTOP_STAGE_HEIGHT = 800;

export function desktopStageScale(availableWidth: number, availableHeight: number) {
  return Math.min(
    1,
    Math.max(0, availableWidth) / DESKTOP_STAGE_WIDTH,
    Math.max(0, availableHeight) / DESKTOP_STAGE_HEIGHT,
  );
}
