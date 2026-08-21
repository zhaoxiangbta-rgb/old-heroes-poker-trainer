import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, newRound, nextActor } from './betting';

describe('betting state machine', () => {
  it('enforces minimum raise and call amount', () => {
    const s=newRound([100,100,100],0,1,2);
    expect(legalActions(s,0)).toEqual(expect.objectContaining({call:2,minRaiseTo:4,maxRaiseTo:100}));
    expect(()=>applyAction(s,0,{type:'raise',to:3})).toThrow(/最小加注/);
  });
  it('moves action clockwise among live non-all-in players', () => {
    const s=newRound([100,100,100],0,1,2);
    expect(nextActor(s)).toBe(0);
    const n=applyAction(s,0,{type:'call'});
    expect(nextActor(n)).toBe(1);
  });
  it('allows a short all-in without lowering the full raise size', () => {
    const s=newRound([3,100,100],0,1,2);
    const n=applyAction(s,0,{type:'raise',to:3});
    expect(n.minRaise).toBe(2);
    expect(n.players[0].allIn).toBe(true);
  });
  it('requires calls after a short all-in but does not reopen raising', () => {
    const s=newRound([100,100,15],2,0,1);
    s.players[0].committed=10;s.players[0].stack=90;s.players[0].acted=true;s.players[0].raiseToReopen=20;
    s.players[1].committed=10;s.players[1].stack=90;s.players[1].acted=true;s.players[1].raiseToReopen=20;
    s.players[2].committed=0;s.players[2].stack=15;s.players[2].acted=false;
    s.currentBet=10;s.minRaise=10;s.actor=2;
    const n=applyAction(s,2,{type:'raise',to:15});
    expect(nextActor(n)).toBe(0);
    expect(legalActions(n,0)).toEqual(expect.objectContaining({call:5,canRaise:false}));
    expect(()=>applyAction(n,0,{type:'raise',to:25})).toThrow(/重新开放/);
  });
  it('reopens raising when cumulative short all-ins reach a full raise', () => {
    const s=newRound([100,5,10],2,0,1);
    s.players[0].committed=10;s.players[0].stack=90;s.players[0].acted=true;s.players[0].raiseToReopen=20;
    s.players[1].committed=10;s.players[1].stack=5;s.players[1].acted=false;
    s.players[2].committed=10;s.players[2].stack=10;s.players[2].acted=false;
    s.currentBet=10;s.minRaise=10;s.actor=1;
    const first=applyAction(s,1,{type:'raise',to:15});
    const second=applyAction(first,2,{type:'raise',to:20});
    expect(nextActor(second)).toBe(0);
    expect(legalActions(second,0).canRaise).toBe(true);
  });
  it('lets an earlier checker raise over a short opening all-in', () => {
    const s=newRound([100,1],0,0,1);
    s.players[0]={stack:100,committed:0,folded:false,allIn:false,acted:true,raiseToReopen:0};
    s.players[1]={stack:1,committed:0,folded:false,allIn:false,acted:false,raiseToReopen:0};
    s.currentBet=0;s.minRaise=2;s.actor=1;
    const n=applyAction(s,1,{type:'raise',to:1});
    expect(legalActions(n,0).canRaise).toBe(true);
  });
});
