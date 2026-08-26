const palettes = [
  ["#98702d", "#22160a", "#f4d47e"],
  ["#a44735", "#24100c", "#f2a78c"],
  ["#287585", "#081b20", "#98e0e8"],
  ["#75508c", "#190d20", "#ddb8ee"],
  ["#3e8058", "#0c1d12", "#a9dfb8"],
  ["#9a6538", "#211208", "#f0bd88"],
] as const;

const art = [
  <><path d="M18 15 25 7l5 10 5-10 7 8-4 25-8 7-8-7Z"/><path d="m23 29 7 5 7-5-2 10H25Z"/></>,
  <><path d="M12 31c8-17 26-19 39-7-9 1-13 6-16 12-6 11-18 10-23-5Z"/><path d="m43 22 9-7-1 13M19 31c5 5 10 5 16 1"/></>,
  <><path d="M10 35c10-18 25-23 44-18L39 27l9 4-17 3-7 13-2-12Z"/><path d="m31 24 7-2"/></>,
  <><circle cx="32" cy="32" r="19"/><circle cx="32" cy="32" r="10"/><path d="M32 13v9m0 20v9M13 32h9m20 0h9"/></>,
  <><circle cx="32" cy="32" r="19"/><path d="m32 17 6 15-6 15-6-15Z"/><path d="M17 32h9m12 0h9"/></>,
  <><path d="M20 48c1-10 5-16 12-20l-5-7 7-8 12 8-4 9 5 18Z"/><path d="M29 20h12M20 48h29"/></>,
] as const;

export function MobilePlayerAvatar({ variant }: { variant: number }) {
  const index = ((variant % art.length) + art.length) % art.length;
  const [light, dark, ink] = palettes[index];
  return (
    <svg data-avatar-art viewBox="0 0 64 64" role="img" aria-label="玩家头像">
      <defs>
        <radialGradient id={`avatar-${index}`} cx="35%" cy="25%">
          <stop offset="0" stopColor={light} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill={`url(#avatar-${index})`} />
      <g fill="none" stroke={ink} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        {art[index]}
      </g>
    </svg>
  );
}
