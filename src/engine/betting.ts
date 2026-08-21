export type Action={type:'fold'}|{type:'check'}|{type:'call'}|{type:'raise';to:number};
export type PlayerBet={stack:number;committed:number;folded:boolean;allIn:boolean;acted:boolean;raiseToReopen:number};
export type BettingState={players:PlayerBet[];button:number;smallBlind:number;bigBlind:number;currentBet:number;minRaise:number;actor:number;closed:boolean};

export function newRound(stacks:number[],button:number,sb:number,bb:number):BettingState {
  if(stacks.length<2) throw new Error('至少两名玩家');
  const players=stacks.map(stack=>({stack,committed:0,folded:false,allIn:false,acted:false,raiseToReopen:0}));
  const post=(seat:number,amount:number)=>{const paid=Math.min(amount,players[seat].stack);players[seat].stack-=paid;players[seat].committed=paid;players[seat].allIn=players[seat].stack===0;};
  post(sb,1); post(bb,2);
  return {players,button,smallBlind:sb,bigBlind:bb,currentBet:Math.max(...players.map(p=>p.committed)),minRaise:2,actor:(bb+1)%stacks.length,closed:false};
}
export function nextActor(s:BettingState):number|undefined { return s.closed?undefined:s.actor; }
export function legalActions(s:BettingState,seat:number){
  if(seat!==s.actor) throw new Error('尚未轮到该玩家'); const p=s.players[seat];
  const call=Math.min(p.stack,Math.max(0,s.currentBet-p.committed));
  const maxRaiseTo=p.committed+p.stack;
  return {fold:call>0,check:call===0,call,canRaise:s.currentBet>=(p.raiseToReopen??0)&&maxRaiseTo>s.currentBet,minRaiseTo:Math.min(maxRaiseTo,s.currentBet+s.minRaise),maxRaiseTo};
}
function findNext(s:BettingState,from:number):number|undefined{
  for(let n=1;n<=s.players.length;n++){const i=(from+n)%s.players.length,p=s.players[i];if(!p.folded&&!p.allIn&&(!p.acted||p.committed<s.currentBet))return i;} return undefined;
}
export function applyAction(s:BettingState,seat:number,action:Action):BettingState{
  const l=legalActions(s,seat), n:BettingState=structuredClone(s), p=n.players[seat];
  if(action.type==='fold'){if(!l.fold)throw new Error('无注可跟时不能弃牌');p.folded=true;p.acted=true;p.raiseToReopen=Number.POSITIVE_INFINITY;}
  else if(action.type==='check'){if(!l.check)throw new Error('面对下注不能过牌');p.acted=true;p.raiseToReopen=0;}
  else if(action.type==='call'){const paid=l.call;p.stack-=paid;p.committed+=paid;p.allIn=p.stack===0;p.acted=true;p.raiseToReopen=n.currentBet+n.minRaise;}
  else {const max=l.maxRaiseTo;if(!l.canRaise)throw new Error('短全下未重新开放加注');if(action.to>max||action.to<=n.currentBet)throw new Error('非法加注金额');const full=action.to>=n.currentBet+n.minRaise;if(!full&&action.to!==max)throw new Error('低于最小加注');const paid=action.to-p.committed;p.stack-=paid;p.committed=action.to;p.allIn=p.stack===0;p.acted=true;if(full){n.minRaise=action.to-n.currentBet;n.players.forEach((x,i)=>{if(i!==seat&&!x.folded&&!x.allIn)x.acted=false;});}n.currentBet=action.to;p.raiseToReopen=n.currentBet+n.minRaise;}
  const live=n.players.filter(x=>!x.folded); if(live.length===1){n.closed=true;return n;}
  const next=findNext(n,seat);if(next===undefined)n.closed=true;else n.actor=next;return n;
}
