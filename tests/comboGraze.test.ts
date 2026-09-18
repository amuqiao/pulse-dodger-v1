import { strict as assert } from 'node:assert';
import test from 'node:test';
import { GameState } from '../src/game/core/GameState.ts';
import { COMBO, GRAZE, MOTE } from '../src/game/tuning.ts';
import { InMemoryScoreRepository } from './fakes/InMemoryScoreRepository.ts';

// 连击(combo)和擦身而过(graze)是把游戏从"离所有碎片越远越好"这个无聊
// 最优解,掰回"主动贴近走位"的核心改动。这里只测规则层(GameState),
// 不测几何检测(那部分在 systems 层,用 Phaser.Math.Distance)。

test('窗口内连续吃点,倍率逐次 +1,到 maxMultiplier 封顶', () => {
  const state = new GameState(new InMemoryScoreRepository());
  // 每次吃点之间只推进 100ms,远小于 windowMs(2600ms),连击应该一直续上。
  for (let i = 0; i < 7; i++) {
    state.collectMote();
    state.tick(100);
  }
  assert.equal(state.combo, COMBO.maxMultiplier, '倍率应该封顶在 maxMultiplier,不会继续往上涨');
});

test('超过 windowMs 没有新的吃点,倍率归 1', () => {
  const state = new GameState(new InMemoryScoreRepository());
  state.collectMote(); // multiplier: 1
  state.collectMote(); // 同一时刻(elapsedMs 未推进),在窗口内 → multiplier: 2
  assert.equal(state.combo, 2);

  state.tick(COMBO.windowMs + 1); // 推进超过一个窗口,连击应该在 tick 里就断掉,不用等下一次吃点
  assert.equal(state.combo, 1, '超时后倍率必须归 1');
  assert.equal(state.comboRemainingRatio, 0, '断连之后不应该还显示"剩余比例"');
});

test('得分随连击倍率放大,但充能不乘倍率(这条最容易写错)', () => {
  const state = new GameState(new InMemoryScoreRepository());
  // 三次都在同一时刻(不 tick),始终在窗口内:倍率依次是 1、2、3
  state.collectMote();
  state.collectMote();
  state.collectMote();

  const expectedScore = MOTE.scorePerMote * 1 + MOTE.scorePerMote * 2 + MOTE.scorePerMote * 3;
  assert.equal(state.score, expectedScore, '得分必须按每次吃点当时的倍率分别计算并累加');

  const expectedCharge = MOTE.chargePerMote * 3;
  assert.equal(
    state.charge,
    expectedCharge,
    '充能必须是"每次固定 chargePerMote"的累加,不能被倍率放大,否则冲击波会失去稀缺性',
  );
});

test('死亡/复活时 resetCombo() 把连击打断归 1,且不影响已记录的分数和充能', () => {
  const state = new GameState(new InMemoryScoreRepository());
  state.collectMote();
  state.collectMote();
  assert.equal(state.combo, 2);

  const scoreBeforeReset = state.score;
  const chargeBeforeReset = state.charge;
  state.resetCombo();

  assert.equal(state.combo, 1, '死亡/复活后倍率必须归 1');
  assert.equal(state.comboRemainingRatio, 0);
  assert.equal(state.score, scoreBeforeReset, 'resetCombo 只打断连击计时,不应该倒扣已经拿到的分数');
  assert.equal(state.charge, chargeBeforeReset, 'resetCombo 不应该影响充能');
});

test('graze 加分、加充能,并计入次数', () => {
  const state = new GameState(new InMemoryScoreRepository());
  state.grazeHazard();
  state.grazeHazard();

  assert.equal(state.score, GRAZE.scorePerGraze * 2);
  assert.equal(state.charge, GRAZE.chargePerGraze * 2);

  const result = state.finish();
  assert.equal(result.grazes, 2, 'graze 次数必须被记录并透传到 finish() 的返回值里');
});

test('maxCombo 记录的是本局峰值,不是断连后的当前值', () => {
  const state = new GameState(new InMemoryScoreRepository());
  // 连续 4 次都在窗口内(不 tick),倍率应该冲到 4
  for (let i = 0; i < 4; i++) {
    state.collectMote();
  }
  assert.equal(state.combo, 4);

  state.tick(COMBO.windowMs + 1); // 断连,当前倍率回到 1
  assert.equal(state.combo, 1);

  const result = state.finish();
  assert.equal(result.maxCombo, 4, 'maxCombo 必须是本局出现过的峰值,不能被后续的断连冲掉');
});

test('死亡后 finish() 返回值里能读到本局全部统计字段', () => {
  const state = new GameState(new InMemoryScoreRepository());
  state.collectMote();
  state.collectMote();
  state.grazeHazard();
  state.spendPulse(3);
  state.resetCombo(); // 模拟死亡打断连击

  const result = state.finish();
  assert.equal(result.motesCollected, 2);
  assert.equal(result.grazes, 1);
  assert.equal(result.pulsesFired, 1);
  assert.equal(result.hazardsCleared, 3);
  assert.equal(state.combo, 1);
});

test('pulsesFired 每次调用 spendPulse 都自增,即使一个碎片都没清到', () => {
  const state = new GameState(new InMemoryScoreRepository());
  state.spendPulse(0);
  state.spendPulse(0);
  const result = state.finish();
  assert.equal(result.pulsesFired, 2, '哪怕清场数量是 0,只要按下了冲击波就该计一次');
  assert.equal(result.hazardsCleared, 0);
});

test('hazardsCleared 跨多次 spendPulse 累加,不是只记最后一次', () => {
  const state = new GameState(new InMemoryScoreRepository());
  state.spendPulse(2);
  state.spendPulse(5);
  const result = state.finish();
  assert.equal(result.hazardsCleared, 7, '必须是历次清场数量的总和');
});
