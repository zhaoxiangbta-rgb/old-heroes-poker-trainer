export function mobileVisualSeat(
  engineSeat: number,
  heroSeat: number,
  playerCount: number,
) {
  return (engineSeat - heroSeat + playerCount) % playerCount;
}
