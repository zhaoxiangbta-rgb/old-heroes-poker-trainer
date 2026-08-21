import { describe,expect,it } from 'vitest';
import { exactEquity, potOdds, cleanOuts } from './equity';

describe('equity facts',()=>{
  it('enumerates a locked board tie exactly',()=>{
    const e=exactEquity([['2c','3d'],['4c','5d']],['Ah','Kh','Qh','Jh','Th']);
    expect(e).toEqual({wins:[0,0],ties:[1,1],total:1,equity:[.5,.5]});
  });
  it('computes call break-even pot odds',()=>expect(potOdds(20,60)).toBeCloseTo(.25));
  it('marks an apparent two-pair out dirty when villain still has a set',()=>{
    const result=cleanOuts(['Ah','Kd'],['Ac','7d','2s'],[['7c','7h']]);
    expect(result.dirty).toContain('Kc');
  });
});
