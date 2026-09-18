import { strict as assert } from 'node:assert';
import test from 'node:test';
import { GameState } from '../src/game/core/GameState.ts';
import { COMBO } from '../src/game/tuning.ts';
import { InMemoryScoreRepository } from './fakes/InMemoryScoreRepository.ts';

// GameState 现在通过构造函数注入 ScoreRepository,不再直接碰 platform(),
// 所以可以像 difficulty.ts 一样在 node 里直接 new 出来断言,不需要起 Phaser
// 或浏览器环境。这类"规则层"测试专门盯 domain 不变量有没有被绕过。

test('充能封顶不溢出:吃再多能量点也不会超过 maxCharge', () => {
  const state = new GameState(new InMemoryScoreRepository());
  for (let i = 0; i < 20; i++) {
    state.collectMote();
  }
  assert.equal(state.charge, 100);
});

test('spendPulse 清零充能,并按清掉的数量计分', () => {
  const state = new GameState(new InMemoryScoreRepository());
  state.collectMote();
  const gained = state.spendPulse(3);
  assert.equal(gained, 75); // 3 * scorePerHazardCleared(25)
  assert.equal(state.charge, 0);
  assert.equal(state.score, 10 + 75); // 一颗能量点的 10 分 + 冲击波 75 分
});

test('破纪录时才把新分数写回存档', () => {
  const repo = new InMemoryScoreRepository();
  const state = new GameState(repo);
  for (let i = 0; i < 5; i++) {
    state.collectMote(); // score = 50
    // 这条测试要盯的是"破纪录才写存档"这条逻辑,不是连击倍率;
    // 每次都把连击窗口撑过期,让每次吃点都按 1 倍计分,不掺杂 combo 变量。
    state.tick(COMBO.windowMs + 1);
  }
  const { isNewBest } = state.finish();
  assert.equal(isNewBest, true);
  assert.equal(repo.loadBestScore(), 50);
});

test('没破纪录就不覆盖已有的最高分', () => {
  const repo = new InMemoryScoreRepository();
  repo.saveBestScore(1000);
  const state = new GameState(repo);
  state.collectMote(); // score = 10,远低于 1000
  const { isNewBest } = state.finish();
  assert.equal(isNewBest, false);
  assert.equal(repo.loadBestScore(), 1000);
});

test('每次 finish() 都让 runsPlayed 累加 1', () => {
  const repo = new InMemoryScoreRepository();
  const first = new GameState(repo).finish();
  assert.equal(first.runsPlayed, 1);

  const second = new GameState(repo).finish();
  assert.equal(second.runsPlayed, 2);

  assert.equal(repo.loadRunsPlayed(), 2);
});

test('复活机会只能用一次:consumeRevive 之后 canRevive 恒为 false', () => {
  const state = new GameState(new InMemoryScoreRepository());
  assert.equal(state.canRevive, true);
  state.consumeRevive();
  assert.equal(state.canRevive, false);
  state.consumeRevive();
  assert.equal(state.canRevive, false);
});

test('finish() 返回破纪录**之前**的旧最高分', () => {
  // 这条测试防的是一类很隐蔽的信息丢失:写回存档时把原值冲掉,
  // 结果不是崩溃,而是结算页"超出纪录 N 分"这句话永远算不出数字。
  const repo = new InMemoryScoreRepository();
  repo.saveBestScore(100);

  const state = new GameState(repo);
  for (let i = 0; i < 15; i++) {
    state.collectMote();   // 15 × 10 = 150 分,破了 100 的纪录
    // 隔开连击窗口,让这条测试只盯 previousBest 的信息保留,不掺杂 combo 倍率。
    state.tick(COMBO.windowMs + 1);
  }

  const result = state.finish();
  assert.equal(result.isNewBest, true);
  assert.equal(result.previousBest, 100, 'previousBest 必须是覆盖前的旧值');
  assert.equal(state.best, 150, 'best 已经被更新成新纪录');
  assert.notEqual(result.previousBest, state.best, '两者必须不同,否则算不出超出多少');
});

test('没破纪录时 previousBest 等于当前最高分', () => {
  const repo = new InMemoryScoreRepository();
  repo.saveBestScore(500);

  const state = new GameState(repo);
  state.collectMote();

  const result = state.finish();
  assert.equal(result.isNewBest, false);
  assert.equal(result.previousBest, 500);
});

// 下面这条防的是:combo/graze 批次给 finish() 新增了 5 个统计字段之后,
// 原有的 isNewBest/runsPlayed/previousBest 这套结算契约不能被悄悄改动语义,
// 新字段对一局"什么都没做"的空局也应该有确定的默认值(0),而不是 undefined。
test('新增的统计字段不破坏原有结算契约:空局的 combo/graze 统计默认为 0', () => {
  const state = new GameState(new InMemoryScoreRepository());
  const result = state.finish();

  assert.equal(result.isNewBest, false, '一分没得,不该破纪录');
  assert.equal(result.runsPlayed, 1);
  assert.equal(result.previousBest, 0);

  assert.equal(result.maxCombo, 1, '没吃过点时,倍率本来就是 1,不应该是 0 或 undefined');
  assert.equal(result.grazes, 0);
  assert.equal(result.motesCollected, 0);
  assert.equal(result.pulsesFired, 0);
  assert.equal(result.hazardsCleared, 0);
});
