import { strict as assert } from 'node:assert';
import test from 'node:test';
import { shouldShowInterstitial } from '../src/game/core/adCadence.ts';

// 插屏广告节奏是变现策略,不是 UI 细节,单独抽成纯函数后可以像难度曲线
// 一样直接断言。这条测试专门防"改动时不小心让第一局也弹广告"这种伤留存的回归。

test('第 1、2 局结束不打插屏,保护新玩家留存', () => {
  assert.equal(shouldShowInterstitial(1), false);
  assert.equal(shouldShowInterstitial(2), false);
});

test('第 3、6、9 局结束要打插屏', () => {
  assert.equal(shouldShowInterstitial(3), true);
  assert.equal(shouldShowInterstitial(6), true);
  assert.equal(shouldShowInterstitial(9), true);
});

test('非 3 的倍数不打插屏', () => {
  assert.equal(shouldShowInterstitial(4), false);
  assert.equal(shouldShowInterstitial(5), false);
  assert.equal(shouldShowInterstitial(7), false);
});
