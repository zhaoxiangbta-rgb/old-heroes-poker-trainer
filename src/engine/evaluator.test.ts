import { describe, expect, it } from 'vitest';
import { bestHand, compareHands } from './evaluator';

describe('bestHand', () => {
  it.each([
    ['皇家同花顺', ['As','Ks','Qs','Js','Ts','2d','3c'], 8],
    ['四条', ['Ah','Ad','Ac','As','Kd','2c','3d'], 7],
    ['葫芦', ['Kh','Kd','Kc','2s','2d','Ah','3c'], 6],
    ['同花', ['Ah','Jh','8h','4h','2h','Ks','Qd'], 5],
    ['顺子', ['9h','8d','7c','6s','5d','Ah','2c'], 4],
    ['三条', ['Qh','Qd','Qc','As','9d','3h','2c'], 3],
    ['两对', ['Jh','Jd','4c','4s','Ad','3h','2c'], 2],
    ['一对', ['Th','Td','As','8c','5d','3h','2c'], 1],
    ['高牌', ['Ah','Kd','9c','7s','4d','3h','2c'], 0],
  ] as const)('%s', (_name, cards, category) => expect(bestHand(cards).category).toBe(category));

  it('recognizes the wheel as a five-high straight', () => {
    expect(bestHand(['As','2d','3c','4h','5s','Kd','Qc']).tiebreak).toEqual([5]);
  });

  it('uses the board for an exact tie', () => {
    const a = bestHand(['As','2s','Th','Jh','Qh','Kh','Ah']);
    const b = bestHand(['9c','9d','Th','Jh','Qh','Kh','Ah']);
    expect(compareHands(a,b)).toBe(0);
  });

  it('orders full houses by trips before pair', () => {
    const kings = bestHand(['Kh','Kd','Kc','2s','2d','Ah','3c']);
    const queens = bestHand(['Qh','Qd','Qc','As','Ad','Kh','3c']);
    expect(compareHands(kings, queens)).toBeGreaterThan(0);
  });
});
