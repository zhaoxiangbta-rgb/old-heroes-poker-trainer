import { assertUniqueCards, parseCard, type Card } from './cards';

export type HandRank = { category: number; tiebreak: number[]; name: string; cards: Card[] };
const NAMES = ['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];

function combinations<T>(items: readonly T[], choose: number): T[][] {
  if (choose === 0) return [[]];
  const out: T[][] = [];
  for (let i = 0; i <= items.length - choose; i++) {
    for (const rest of combinations(items.slice(i + 1), choose - 1)) out.push([items[i], ...rest]);
  }
  return out;
}

function straightHigh(values: number[]): number | undefined {
  const unique = [...new Set(values)].sort((a,b) => b-a);
  if (unique.includes(14)) unique.push(1);
  for (let i=0;i<=unique.length-5;i++) if (unique[i]-unique[i+4]===4) return unique[i];
}

export function rankFive(cards: Card[]): HandRank {
  if (cards.length !== 5) throw new Error('五张牌评估必须正好五张');
  assertUniqueCards(cards);
  const parsed = cards.map(parseCard);
  const values = parsed.map(c=>c.rank).sort((a,b)=>b-a);
  const groups = [...new Set(values)].map(rank => ({rank,count:values.filter(v=>v===rank).length}))
    .sort((a,b)=>b.count-a.count || b.rank-a.rank);
  const flush = new Set(parsed.map(c=>c.suit)).size === 1;
  const straight = straightHigh(values);
  let category = 0, tiebreak = values;
  if (flush && straight) { category=8; tiebreak=[straight]; }
  else if (groups[0].count===4) { category=7; tiebreak=[groups[0].rank,groups[1].rank]; }
  else if (groups[0].count===3 && groups[1].count===2) { category=6; tiebreak=[groups[0].rank,groups[1].rank]; }
  else if (flush) { category=5; }
  else if (straight) { category=4; tiebreak=[straight]; }
  else if (groups[0].count===3) { category=3; tiebreak=[groups[0].rank,...groups.slice(1).map(g=>g.rank).sort((a,b)=>b-a)]; }
  else if (groups[0].count===2 && groups[1].count===2) { category=2; const pairs=groups.slice(0,2).map(g=>g.rank).sort((a,b)=>b-a); tiebreak=[...pairs,groups[2].rank]; }
  else if (groups[0].count===2) { category=1; tiebreak=[groups[0].rank,...groups.slice(1).map(g=>g.rank).sort((a,b)=>b-a)]; }
  return {category,tiebreak,name:NAMES[category],cards};
}

export function compareHands(a: HandRank,b: HandRank): number {
  if (a.category !== b.category) return a.category-b.category;
  for (let i=0;i<Math.max(a.tiebreak.length,b.tiebreak.length);i++) {
    const delta=(a.tiebreak[i]??0)-(b.tiebreak[i]??0); if(delta) return delta;
  }
  return 0;
}

export function bestHand(cards: readonly Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7) throw new Error('最佳牌型需要五至七张牌');
  assertUniqueCards(cards);
  return combinations(cards,5).map(rankFive).reduce((best,next)=>compareHands(next,best)>0?next:best);
}
