export const RANKS = '23456789TJQKA' as const;
export const SUITS = 'cdhs' as const;
export type Card = string;

export function parseCard(card: string): { rank: number; suit: string } {
  if (!/^[2-9TJQKA][cdhs]$/.test(card)) throw new Error(`无效牌: ${card}`);
  return { rank: RANKS.indexOf(card[0] as never) + 2, suit: card[1] };
}

export function createDeck(): Card[] {
  return [...SUITS].flatMap(s => [...RANKS].map(r => `${r}${s}`));
}

export function assertUniqueCards(cards: readonly Card[]): void {
  cards.forEach(parseCard);
  if (new Set(cards).size !== cards.length) throw new Error('牌面重复');
}
