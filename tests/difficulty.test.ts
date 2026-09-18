import { strict as assert } from 'node:assert';
import test from 'node:test';
import { difficultyAt } from '../src/game/core/difficulty.ts';

// 难度曲线是纯函数,不依赖 Phaser 和浏览器,所以可以直接在 node 里断言。
// 这类"规则层"的测试是游戏里最值得写的:手感调坏了会立刻被抓出来。

test('开局节奏宽松,给新手喘息空间', () => {
  const d = difficultyAt(0);
  assert.equal(d.hazardIntervalMs, 900);
  assert.equal(d.hazardSpeed, 150);
  assert.equal(d.hazardBatch, 1);
});

test('90 秒后难度封顶,不会无限上涨', () => {
  const at90 = difficultyAt(90);
  const at300 = difficultyAt(300);
  assert.deepEqual(at90, at300);
  assert.equal(at90.hazardIntervalMs, 260);
  assert.equal(at90.hazardSpeed, 400);
});

test('难度单调递增:间隔越来越短,速度越来越快', () => {
  let prev = difficultyAt(0);
  for (let t = 5; t <= 90; t += 5) {
    const cur = difficultyAt(t);
    assert.ok(cur.hazardIntervalMs <= prev.hazardIntervalMs, `t=${t} 间隔反而变长了`);
    assert.ok(cur.hazardSpeed >= prev.hazardSpeed, `t=${t} 速度反而变慢了`);
    prev = cur;
  }
});

test('45 秒后开始双发', () => {
  assert.equal(difficultyAt(44).hazardBatch, 1);
  assert.equal(difficultyAt(46).hazardBatch, 2);
});

test('能量点供给全程稳定,否则后期无法充能', () => {
  // 最快和最慢的生成间隔差距必须很小,不能让后期彻底吃不到能量
  const fastest = difficultyAt(90).moteIntervalMs;
  const slowest = difficultyAt(0).moteIntervalMs;
  assert.ok(slowest - fastest <= 500, '能量点供给波动过大');
});
