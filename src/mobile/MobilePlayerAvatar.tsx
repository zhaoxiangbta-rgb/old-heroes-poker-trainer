import { playerPortraitFor } from "../ui/pokerVisualAssets";

export function MobilePlayerAvatar({ playerId, seat, name }: { playerId: string; seat: number; name: string }) {
  return (
    <img src={playerPortraitFor(playerId, seat)} alt={`${name}的头像`} draggable={false} />
  );
}
