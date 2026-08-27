import { expect, test } from "@playwright/test";

const viewports = [
  { name: "wide", width: 1440, height: 900 },
  { name: "compact", width: 1100, height: 760 },
] as const;

for (const viewport of viewports) {
  test(`desktop action dock stays balanced at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");

    const dock = page.getByTestId("desktop-action-dock");
    await expect(dock).toBeVisible();
    await expect(page.locator(".desktop-hand-zone .card")).toHaveCount(2);
    await expect(page.getByTestId("desktop-size-zone").locator("button")).toHaveCount(3);
    await expect(page.getByTestId("desktop-action-zone").locator("button")).toHaveCount(3);

    const measurements = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const dockBox = box("[data-testid='desktop-action-dock']");
      const sizeBox = box("[data-testid='desktop-size-zone']");
      const handBox = box(".desktop-hand-zone");
      const actionBox = box("[data-testid='desktop-action-zone']");
      const asideBox = box("aside");
      const footerBox = box("footer");
      const cards = [...document.querySelectorAll(".desktop-hand-zone .card")].map((element) => element.getBoundingClientRect());
      const buttons = [...document.querySelectorAll(".desktop-size-zone button, .desktop-action-zone button")].map((element) => element.getBoundingClientRect());
      const dockStyle = getComputedStyle(document.querySelector<HTMLElement>(".desktop-action-dock")!);
      const dockStitchStyle = getComputedStyle(document.querySelector<HTMLElement>(".desktop-action-dock")!, "::before");
      const railNodes = document.querySelector<HTMLElement>(".desktop-rail-nodes")!;
      const nodeFractions = [...railNodes.querySelectorAll<HTMLElement>("span")].map((element) => element.offsetLeft / railNodes.clientWidth);
      const felt = box(".felt");
      const stage = box(".desktop-game-stage");
      const rail = box(".desktop-rail-track");
      const sizeContent = box(".desktop-size-buttons");
      const actionContent = box(".desktop-action-zone");
      const leftMeta = box("[data-testid='desktop-left-meta']");
      const potStack = box(".pot-chip-stack");
      const potPile = box(".pot-chip-pile");
      const board = box(".board");
      const seatZoneOverlaps = [...document.querySelectorAll(".seat")].flatMap((seat, seatIndex) => {
        const zones = [".player-seat-avatar", ".player-position-badge", ".player-seat-plaque", ".player-seat-hole", ".player-seat-wager"]
          .map((selector) => ({ selector, rect: seat.querySelector(selector)?.getBoundingClientRect() }))
          .filter((zone): zone is { selector: string; rect: DOMRect } => Boolean(zone.rect) && zone.rect!.width > 0 && zone.rect!.height > 0);
        return zones.flatMap((a, index) => zones.slice(index + 1).filter((b) =>
          a.rect.left < b.rect.right && a.rect.right > b.rect.left && a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top,
        ).map((b) => `${seatIndex}:${a.selector}/${b.selector}`));
      });
      const inwardWagers = [...document.querySelectorAll(".seat")].every((seat) => {
        const avatar = seat.querySelector(".player-seat-avatar")!.getBoundingClientRect();
        const wager = seat.querySelector(".player-seat-wager")!.getBoundingClientRect();
        const cx = felt.left + felt.width / 2;
        const cy = felt.top + felt.height / 2;
        const distance = (rect: DOMRect) => Math.hypot(rect.left + rect.width / 2 - cx, rect.top + rect.height / 2 - cy);
        return distance(wager) < distance(avatar);
      });
      return {
        dock: { left: dockBox.left, right: dockBox.right, height: dockBox.height },
        asideLeft: asideBox.left,
        zones: [sizeBox, handBox, actionBox].map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })),
        cardSizes: cards.map((rect) => ({ width: rect.width, height: rect.height })),
        buttonHeights: buttons.map((rect) => rect.height),
        dockBottomBreathingRoom: dockBox.bottom - Math.max(...buttons.map((rect) => rect.bottom)),
        dockBottomBorderWidth: Number.parseFloat(dockStyle.borderBottomWidth),
        dockBottomRadius: Number.parseFloat(dockStyle.borderBottomLeftRadius),
        dockStitchBottom: Number.parseFloat(dockStitchStyle.bottom),
        nodeFractions,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        seatZoneOverlaps,
        inwardWagers,
        railCenterOffset: Math.abs(rail.left + rail.width / 2 - (stage.left + stage.width / 2)),
        railWidthRatio: rail.width / stage.width,
        sideZoneWidthDelta: Math.abs(sizeBox.width - actionBox.width),
        sideCentersOffset: Math.abs((sizeBox.left + sizeBox.width / 2 + actionBox.left + actionBox.width / 2) / 2 - (stage.left + stage.width / 2)),
        sizeContentCenterOffset: Math.abs(sizeContent.left + sizeContent.width / 2 - (sizeBox.left + sizeBox.width / 2)),
        sideControlCenterDelta: Math.abs(
          sizeContent.top + sizeContent.height / 2 - (actionContent.top + actionContent.height / 2),
        ),
        leftMetaOverlapsSizing: leftMeta.left < sizeContent.right && leftMeta.right > sizeContent.left &&
          leftMeta.top < sizeContent.bottom && leftMeta.bottom > sizeContent.top,
        handCenterOffset: Math.abs((handBox.left + handBox.width / 2) - (stage.left + stage.width / 2)),
        potLabelCount: document.querySelectorAll(".felt .pot-chip-label").length,
        potPileWidth: potPile.width,
        oldPotCount: document.querySelectorAll(".felt .pot").length,
        potOverlapsBoard: potStack.left < board.right && potStack.right > board.left && potStack.top < board.bottom && potStack.bottom > board.top,
        feltAspectError: Math.abs(felt.width / felt.height - 820 / 460),
        dockBottom: dockBox.bottom,
        footerTop: footerBox.top,
        recentActionsVisible: document.querySelector(".recent-actions")!.getBoundingClientRect().width > 0,
      };
    });

    expect(measurements.dock.right).toBeLessThanOrEqual(measurements.asideLeft + 1);
    expect(measurements.dock.height).toBeLessThanOrEqual(180);
    expect(measurements.zones[0].right).toBeLessThanOrEqual(measurements.zones[1].left);
    expect(measurements.zones[1].right).toBeLessThanOrEqual(measurements.zones[2].left);
    expect(measurements.cardSizes.every((card) => card.width >= 54 && card.height >= 74)).toBe(true);
    expect(measurements.buttonHeights.every((height) => height >= 48)).toBe(true);
    expect(measurements.dockBottomBreathingRoom).toBeGreaterThanOrEqual(14);
    expect(measurements.dockBottomBorderWidth).toBeGreaterThanOrEqual(1);
    expect(measurements.dockBottomRadius).toBeGreaterThanOrEqual(12);
    expect(measurements.dockStitchBottom).toBeGreaterThanOrEqual(8);
    expect(measurements.scrollWidth).toBe(measurements.clientWidth);
    expect(measurements.seatZoneOverlaps).toEqual([]);
    expect(measurements.inwardWagers).toBe(true);
    expect(measurements.railCenterOffset).toBeLessThanOrEqual(2);
    expect(measurements.railWidthRatio).toBeGreaterThanOrEqual(.72);
    expect(measurements.sideZoneWidthDelta).toBeLessThanOrEqual(2);
    expect(measurements.sideCentersOffset).toBeLessThanOrEqual(2);
    expect(measurements.sizeContentCenterOffset).toBeLessThanOrEqual(2);
    expect(measurements.sideControlCenterDelta).toBeLessThanOrEqual(2);
    expect(measurements.leftMetaOverlapsSizing).toBe(false);
    expect(measurements.handCenterOffset).toBeLessThanOrEqual(2);
    expect(measurements.potLabelCount).toBe(1);
    expect(measurements.potPileWidth).toBeGreaterThanOrEqual(72);
    expect(measurements.oldPotCount).toBe(0);
    expect(measurements.potOverlapsBoard).toBe(false);
    expect(measurements.feltAspectError).toBeLessThanOrEqual(.02);
    expect(measurements.dockBottom).toBeLessThanOrEqual(measurements.footerTop + 1);
    expect(measurements.recentActionsVisible).toBe(viewport.name === "wide");
    [0, 1 / 6, 1 / 3, 1 / 2, 1].forEach((fraction, index) => {
      expect(measurements.nodeFractions[index]).toBeCloseTo(fraction, 2);
    });

    await page.screenshot({ path: `test-results/desktop-reference-${viewport.name}.png`, fullPage: true });
  });
}
