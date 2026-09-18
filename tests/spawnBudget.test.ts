import { strict as assert } from 'node:assert';
import test from 'node:test';
import { peakHazards, peakMotes } from '../src/game/core/spawnBudget.ts';
import { HAZARD, MOTE } from '../src/game/tuning.ts';

// 把"池容量够不够"从只能靠玩家反馈("玩到 90 秒后突然没碎片了")变成一条
// 编译期就能跑的断言:调难度曲线把峰值并发撑高时,这条测试会先于玩家发现。

test('hazard 对象池容量覆盖理论峰值并发,留 1.5 倍安全冗余', () => {
  const peak = peakHazards();
  assert.ok(
    peak * 1.5 <= HAZARD.poolSize,
    `峰值并发 ${peak} × 1.5 = ${peak * 1.5} 超过了 HAZARD.poolSize(${HAZARD.poolSize})`,
  );
});

test('mote 对象池容量覆盖理论峰值并发,留 1.5 倍安全冗余', () => {
  const peak = peakMotes();
  assert.ok(
    peak * 1.5 <= MOTE.poolSize,
    `峰值并发 ${peak} × 1.5 = ${peak * 1.5} 超过了 MOTE.poolSize(${MOTE.poolSize})`,
  );
});

test('峰值并发是正数,不是曲线写错导致的 0 或负数', () => {
  assert.ok(peakHazards() > 0);
  assert.ok(peakMotes() > 0);
});
