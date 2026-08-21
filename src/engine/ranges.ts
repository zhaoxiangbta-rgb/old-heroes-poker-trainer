import {RANKS,SUITS,type Card} from './cards';

export type RangeHistory={reason:string;prior:number;likelihood:number;posterior:number};
export type WeightedCombo={cards:[Card,Card];weight:number;label:string;history:RangeHistory[]};

function rankIndex(r:string){return RANKS.indexOf(r as never)}
function normalize(items:WeightedCombo[]):WeightedCombo[]{const total=items.reduce((n,c)=>n+c.weight,0);if(!total)throw new Error('范围没有可用组合');return items.map(c=>({...c,weight:c.weight/total}));}
function exactToken(token:string):WeightedCombo[]{
  const match=token.trim().match(/^([2-9TJQKA])([2-9TJQKA])(s|o)?$/);if(!match)throw new Error(`不支持的范围记法: ${token}`);
  const [,a,b,mode]=match;if(rankIndex(a)<rankIndex(b))throw new Error(`范围点数须从高到低: ${token}`);const out:WeightedCombo[]=[];
  if(a===b){for(let i=0;i<SUITS.length;i++)for(let j=i+1;j<SUITS.length;j++)out.push({cards:[`${a}${SUITS[i]}`,`${b}${SUITS[j]}`],weight:1,label:token,history:[]});}
  else for(const sa of SUITS)for(const sb of SUITS){if(mode==='s'&&sa!==sb)continue;if(mode==='o'&&sa===sb)continue;out.push({cards:[`${a}${sa}`,`${b}${sb}`],weight:1,label:token,history:[]});}
  return out;
}
export function buildWeightedRange(notation:string):WeightedCombo[]{return notation.split(',').map(x=>x.trim()).filter(Boolean).flatMap(exactToken);}
export function removeBlocked(range:WeightedCombo[],known:readonly Card[]):WeightedCombo[]{return normalize(range.filter(c=>c.cards.every(card=>!known.includes(card))));}
export function updateRange(range:WeightedCombo[],likelihood:(combo:WeightedCombo)=>number,reason:string):WeightedCombo[]{const raw=range.map(c=>{const like=Math.max(.001,likelihood(c));return{...c,weight:c.weight*like,_prior:c.weight,_like:like}});const total=raw.reduce((n,c)=>n+c.weight,0);return raw.map(({_prior,_like,...c})=>{const posterior=c.weight/total;return{...c,weight:posterior,history:[...c.history,{reason,prior:_prior,likelihood:_like,posterior}]};});}
export function rangeSummary(range:WeightedCombo[]){const classes=new Map<string,number>();range.forEach(c=>classes.set(c.label,(classes.get(c.label)??0)+c.weight));return{combos:range.length,classes:[...classes].sort((a,b)=>b[1]-a[1]).map(([label,weight])=>({label,weight}))};}
export function friendGameLikelihood(street:'preflop'|'flop'|'turn'|'river',action:'call'|'raise',sizePot:number){return(c:WeightedCombo)=>{const pair=c.cards[0][0]===c.cards[1][0],high=Math.max(rankIndex(c.cards[0][0]),rankIndex(c.cards[1][0]));const strength=(pair?4:0)+high/4;if(action==='call')return 1.15+(street==='preflop'?.25:0)-sizePot*.12+strength*.02;if(street==='river'&&sizePot>=.75)return .12+strength*.2;return .35+strength*.1;};}
