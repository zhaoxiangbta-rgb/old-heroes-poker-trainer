import { mobilePortraitFor } from "./mobileCasinoAssets";

export function MobilePlayerAvatar({ playerId, seat, name }: { playerId: string; seat: number; name: string }) {
  return (
    <img src={mobilePortraitFor(playerId, seat)} alt={`${name}的头像`} draggable={false} />
  );
}
