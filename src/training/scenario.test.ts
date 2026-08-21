import {describe,expect,it} from 'vitest';import {generateScenario,replayScenario} from './scenario';
describe('seeded training',()=>{it('replays the exact same state from a seed',()=>{const a=generateScenario(20260815);expect(replayScenario(JSON.parse(JSON.stringify(a)))).toEqual(a);expect(generateScenario(20260815)).toEqual(a);});});
