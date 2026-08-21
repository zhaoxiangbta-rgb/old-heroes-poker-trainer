import { describe,expect,it } from 'vitest';
import { buildPots, settlePots } from './pots';

describe('pots',()=>{
  it('builds main and side pots by contribution layers',()=>{
    expect(buildPots([50,100,200],new Set())).toEqual([
      {amount:150,eligible:[0,1,2]}, {amount:100,eligible:[1,2]}, {amount:100,eligible:[2]}
    ]);
  });
  it('excludes folded players but keeps their chips',()=>{
    expect(buildPots([100,100,100],new Set([1]))[0]).toEqual({amount:300,eligible:[0,2]});
  });
  it('splits and assigns odd chip clockwise after button',()=>{
    expect(settlePots([{amount:5,eligible:[0,1]}],[[0,1]],0,3)).toEqual([2,3,0]);
  });
  it('rejects a contribution layer that has no eligible player',()=>{
    expect(()=>buildPots([200,100,100],new Set([0]))).toThrow(/无资格玩家/);
  });
});
