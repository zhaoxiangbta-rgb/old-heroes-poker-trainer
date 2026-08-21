import { assertUniqueCards, createDeck, type Card } from './cards';
import { bestHand, compareHands } from './evaluator';

function combos<T>(a:T[],k:number):T[][]{if(k===0)return[[]];const out:T[][]=[];for(let i=0;i<=a.length-k;i++)for(const r of combos(a.slice(i+1),k-1))out.push([a[i],...r]);return out;}
export function exactEquity(holes:Card[][],board:Card[]){
  const known=[...holes.flat(),...board];assertUniqueCards(known);const deck=createDeck().filter(c=>!known.includes(c));const runs=combos(deck,5-board.length);const wins=holes.map(()=>0),ties=holes.map(()=>0),shares=holes.map(()=>0);
  for(const run of runs){const ranks=holes.map(h=>bestHand([...h,...board,...run]));let best=0;for(let i=1;i<ranks.length;i++)if(compareHands(ranks[i],ranks[best])>0)best=i;const winners=ranks.map((r,i)=>compareHands(r,ranks[best])===0?i:-1).filter(i=>i>=0);winners.forEach(i=>shares[i]+=1/winners.length);if(winners.length===1)wins[winners[0]]++;else winners.forEach(i=>ties[i]++);}
  return {wins,ties,total:runs.length,equity:shares.map(x=>x/runs.length)};
}
export function potOdds(call:number,pot:number){return call/(pot+call);}
export function cleanOuts(hero:Card[],board:Card[],villains:Card[][]){
  const known=[...hero,...board,...villains.flat()];assertUniqueCards(known);const base=bestHand([...hero,...board]);const clean:Card[]=[],dirty:Card[]=[];
  for(const card of createDeck().filter(c=>!known.includes(c))){const next=bestHand([...hero,...board,card]);if(compareHands(next,base)<=0)continue;const beats=villains.every(v=>compareHands(next,bestHand([...v,...board,card]))>0);(beats?clean:dirty).push(card);}return{clean,dirty};
}
