export type Pot={amount:number;eligible:number[]};
export function buildPots(contributions:number[],folded:Set<number>):Pot[]{
  const levels=[...new Set(contributions.filter(x=>x>0))].sort((a,b)=>a-b);let prev=0;const pots:Pot[]=[];
  for(const level of levels){const contributors=contributions.map((x,i)=>x>=level?i:-1).filter(i=>i>=0);const amount=(level-prev)*contributors.length;const eligible=contributors.filter(i=>!folded.has(i));if(amount>0&&!eligible.length)throw new Error('底池分层无资格玩家');if(amount>0)pots.push({amount,eligible});prev=level;}return pots;
}
export function settlePots(pots:Pot[],winnerGroups:number[][],button:number,seats:number):number[]{
  const won=Array(seats).fill(0);pots.forEach((pot,index)=>{const winners=winnerGroups[index];const share=Math.floor(pot.amount/winners.length);winners.forEach(w=>won[w]+=share);let odd=pot.amount-share*winners.length;for(let n=1;odd&&n<=seats;n++){const seat=(button+n)%seats;if(winners.includes(seat)){won[seat]++;odd--;}}});return won;
}
