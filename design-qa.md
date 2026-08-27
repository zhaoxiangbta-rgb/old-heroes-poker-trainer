**Design QA**

- source visual truth path: `/Users/zhaoxiang/.codex/generated_images/01a00324-cc74-71a2-885f-69de506caed9/exec-b0482f48-5bba-4dfa-9f6e-501a9456b0dc.png`
- implementation screenshot path: `/Users/zhaoxiang/.codex/worktrees/af84/系统工具/poker-decision-trainer/test-results/desktop-reference-wide.png`
- combined comparison evidence: `/Users/zhaoxiang/.codex/worktrees/af84/系统工具/poker-decision-trainer/test-results/design-qa-comparison.png`
- viewport: 1440 x 900 CSS px, deviceScaleFactor 1
- source pixels: 1487 x 1058; implementation pixels: 1440 x 900
- normalization: both images were proportionally fitted into equal-width, 620 px-high frames in one 1800 x 760 comparison image; browser chrome was excluded
- state: desktop cash-game hero turn, dark aged-green table, action dock visible

**Findings**

- No actionable P0/P1/P2 finding remains.
- Fonts and typography: warm ivory and antique-gold hierarchy, large Chinese action labels and enlarged card ranks/suits remain readable. The implementation deliberately keeps secondary legal-summary text smaller than the primary controls.
- Spacing and layout rhythm: the production dock preserves the reference's left sizing plaques, centered hand and right action chips. The nonlinear rail now shares the hand's exact centerline, while equal-width left and right regions center their own controls. It is intentionally shallower than the concept so the full table and decision sidebar remain visible at 900 px height. Wide and compact checks show no overlap, crop or horizontal overflow.
- Colors and visual tokens: aged black leather, tarnished brass, cream, muted red and emerald felt match the selected Image2 direction. Folded seats become desaturated without losing position and contribution context.
- Image quality and asset fidelity: the implementation uses a generated transparent brass sizing-plaque raster, real felt/leather textures, portrait, card-back and chip assets. The pot now uses 3–6 vertical columns of real chip images, with 1–6 chips per column and stable amount tiers. No placeholder imagery, emoji or inline SVG substitutes are visible.
- Copy and content: Chinese poker terminology remains intact. `ALL IN` stays the only English display treatment by prior product decision.
- Interaction and accessibility: semantic buttons and slider remain keyboard-operable; selected sizing plaques have a persistent state; reduced-motion users receive short non-spatial feedback; rules state is not mutated by presentation effects.

**Full-view comparison evidence**

The combined comparison confirms the same table-first composition, right decision sidebar, stitched black-leather console, centered hole cards, three antique-brass sizing plaques and three action chips. The implementation's central pot is no longer a flat row: even the captured pot 13 state shows multiple raised columns, while larger tiers grow to five or six columns without leaving the bounded center region.

**Focused region comparison evidence**

The full-view comparison keeps the entire action dock and pot large enough to judge plaque edge wear, text scale, alignment, leather stitching and chip height. A separate crop was unnecessary. Automated measurements verify rail/hand center error ≤2px, left/right width difference ≤2px, button height ≥56px, a bounded 220×82px pot region and zero player-zone overlaps.

**Comparison history**

1. Earlier implementation used bright circular sizing chips and a relatively clean felt surface. Fix: selected Image2 option 2, generated a dedicated black-leather/tarnished-brass plaque asset, replaced the controls and layered real worn felt texture.
2. Earlier bottom controls carried more visual weight than the table and the pot pile was undersized. Fix: reduced dock height while preserving control size, increased pot chip tiers to 3/5/7/9 and enlarged the central pile.
3. Post-fix evidence: `/Users/zhaoxiang/.codex/worktrees/af84/系统工具/poker-decision-trainer/test-results/design-qa-comparison.png`. No P0/P1/P2 difference remains; desktop wide/compact layout tests and chip/fold motion tests pass.
4. Browser annotation exposed an incomplete lower edge: the production dock used top-only corner radii and no bottom border, making the leather console look vertically cropped. Fix: restored a four-sided antique-brass border, full 18 px outer radius, full 12 px stitched inner radius and an 8 px lower inset without increasing the 174 px dock height. Post-fix evidence is the current combined comparison image; wide and compact measurements confirm at least 14 px breathing room below the controls and no footer overlap.
5. Browser annotations identified two alignment drifts and a flat-looking pot. Fix: added a symmetric balancing cell around the rail, replaced 33%/35% absolute zones with equal grid tracks, and replaced the horizontal chip row with deterministic 3–6-column vertical stacks. Post-fix wide/compact evidence confirms center and width differences ≤2px; pot tier tests cover 3, 24, 77 and 180 chips with maximum column heights of 2, 3, 5 and 6.

**Implementation Checklist**

- [x] Use selected Image2 option 2 as the current source of visual truth.
- [x] Apply aged felt, stitched leather and tarnished-brass controls.
- [x] Keep hero cards centered and table information unobstructed.
- [x] Enlarge the dynamic pot pile without overlapping the board.
- [x] Add sequential chip-flight and fold-close feedback.
- [x] Preserve reduced-motion behavior and rules-engine authority.
- [x] Verify desktop wide/compact layouts and core interaction motion.
- [x] Preserve a complete rounded lower leather edge and stitched inset without increasing viewport occupation.
- [x] Center the nonlinear rail and both side control groups on a shared geometric axis.
- [x] Render bounded multi-column vertical pot stacks from real chip imagery.

**Follow-up Polish**

- P3: physical chip sounds still depend on the existing local sound toggle and browser audio permission; the visual feedback remains complete when sound is unavailable.

final result: passed
