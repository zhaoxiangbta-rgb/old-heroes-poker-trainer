import {describe,expect,it} from 'vitest';
import {analyzeDecision,classifyIntent,type DecisionAnalysisInput} from './analysis';
import {buildWeightedRange,removeBlocked} from './ranges';

describe('decision facts',()=>{
  it('computes fold/call/raise EVs from local equity facts',()=>{
    const range=removeBlocked(buildWeightedRange('AA,KK,QQ,AKs'),['Ah','Kh','Qh','Jh','2c']);
    const a=analyzeDecision({hero:['Ah','Kh'],board:['Qh','Jh','2c'],range,pot:30,toCall:10,stack:120,playersBehind:0,seed:7});
    expect(a.alternatives.map(x=>x.action)).toContain('弃牌');
    expect(a.alternatives.map(x=>x.action)).toContain('跟注 10');
    expect(a.requiredEquity).toBeCloseTo(.25);
    expect(a.recommended).toEqual([...a.alternatives].sort((x,y)=>y.ev-x.ev)[0]);
    expect(a.assumptions.length).toBeGreaterThan(0);
  });
  it('distinguishes value, protection, semi-bluff, bluff, pot control and induce',()=>{
    expect(['价值','保护','半诈唬','纯诈唬','控池','诱导']).toEqual(expect.arrayContaining([
      classifyIntent(.8,.8,.1),classifyIntent(.62,.4,.3),classifyIntent(.35,.45,.35),
      classifyIntent(.12,.7,.05),classifyIntent(.55,.1,.08),classifyIntent(.75,.15,.02)
    ]));
  });
  it('accounts for players behind as additional call risk',()=>{
    const r=removeBlocked(buildWeightedRange('AA,KK,QQ'),['As','Kd','2c','7d','9h']);
    const base={hero:['As','Kd'],board:['2c','7d','9h'],range:r,pot:20,toCall:5,stack:100,seed:1};
    expect(analyzeDecision({...base,playersBehind:2}).risk.playersBehind).toBe(2);
    expect(analyzeDecision({...base,playersBehind:2}).alternatives.find(x=>x.kind==='raise')!.ev)
      .toBeLessThan(analyzeDecision({...base,playersBehind:0}).alternatives.find(x=>x.kind==='raise')!.ev);
  });
  it('never proposes a raise outside the rules-engine bounds',()=>{
    const range=removeBlocked(buildWeightedRange('AA,KK,QQ,JJ,TT,AKs,AQs,AKo'),['As','Kd','2c','7d','9h']);
    const input={
      hero:['As','Kd'],board:['2c','7d','9h'],range,pot:30,toCall:10,stack:96,
      streetBet:4,canRaise:true,minRaiseTo:40,maxRaiseTo:55,playersBehind:0,seed:1,
    } as DecisionAnalysisInput & {
      streetBet:number;canRaise:boolean;minRaiseTo:number;maxRaiseTo:number;
    };
    const raises=analyzeDecision(input).alternatives.filter(x=>x.kind==='raise');
    expect(raises.length).toBeGreaterThan(0);
    expect(raises.every(x=>x.amount>=40&&x.amount<=55)).toBe(true);
  });
  it('returns a broad flop-range comparison within an interactive budget',()=>{
    const range=removeBlocked(buildWeightedRange(
      'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,33,22,AKs,AQs,AJs,ATs,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s,87s,AKo,AQo,AJo,KQo,KJo,QJo',
    ),['Ah','Kh','Qh','Jh','2c']);
    const started=performance.now();
    analyzeDecision({hero:['Ah','Kh'],board:['Qh','Jh','2c'],range,pot:30,toCall:10,stack:120,playersBehind:0,seed:7});
    expect(performance.now()-started).toBeLessThan(750);
  });
});
