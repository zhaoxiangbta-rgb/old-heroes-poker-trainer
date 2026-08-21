import {describe,expect,it} from 'vitest';
import {buildWeightedRange,removeBlocked,updateRange,rangeSummary} from './ranges';

describe('weighted opponent ranges',()=>{
  it('expands pairs, suited and offsuit notation into exact combos',()=>{
    const range=buildWeightedRange('AA,AKs,AKo');
    expect(range).toHaveLength(6+4+12);
    expect(range.reduce((n,c)=>n+c.weight,0)).toBe(22);
  });
  it('removes combos containing known cards and normalizes weights',()=>{
    const range=removeBlocked(buildWeightedRange('AA,AKs'),['As']);
    expect(range.every(c=>!c.cards.includes('As'))).toBe(true);
    expect(range.reduce((n,c)=>n+c.weight,0)).toBeCloseTo(1);
  });
  it('updates the range from action likelihood rather than deleting alternatives',()=>{
    const base=removeBlocked(buildWeightedRange('AA,72o'),[]);
    const next=updateRange(base,c=>c.label==='AA'?.9:.1,'河牌大加注偏强');
    expect(next.filter(c=>c.label==='AA').reduce((n,c)=>n+c.weight,0)).toBeGreaterThan(.8);
    expect(next.some(c=>c.label==='72o')).toBe(true);
    expect(next[0].history.at(-1)?.reason).toBe('河牌大加注偏强');
  });
  it('summarizes weighted classes for review',()=>{
    expect(rangeSummary(removeBlocked(buildWeightedRange('AA,AKs'),[]))).toMatchObject({combos:10});
  });
});
