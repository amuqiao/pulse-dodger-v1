// 注意这里显式带 `.ts` 扩展名,原因同 `GameState.ts` 顶部注释:这个文件既会被
// Vite 打包进浏览器 bundle,也会被 `node --test` 直接当 ESM 执行去跑
// `tests/spawnBudget.test.ts` —— 后者是标准 Node ESM 解析,不认"扩展名省略"。
import { GAME_WIDTH, u } from '../viewport.ts';
import { MOTE } from '../tuning.ts';
import { difficultyAt } from './difficulty.ts';

/**
 * 把"对象池该开多大"从拍脑袋变成可算、可测。
 *
 * 碎片(hazard)从屏幕一侧飞向另一侧,穿屏耗时 ≈ GAME_WIDTH / 实际速度;
 * 每 `hazardIntervalMs` 生成一批 `hazardBatch` 个,只要"上一批还没穿完屏就
 * 又生成了新一批",峰值并发数就是 `hazardBatch × 穿屏耗时 / 生成间隔`。
 *
 * 能量点(mote)没有"穿屏"概念,固定生成在屏幕内直到被吃掉或超时
 * (`MOTE.lifetimeMs`)自动消失,并发峰值 ≈ 存活时长 / 生成间隔。
 *
 * 这两个都是估算,不是精确物理仿真(比如忽略了斜向飞行让实际穿屏路径比
 * "严格水平穿屏"更长一点),所以调用方(`tuning.ts` 里的 `HAZARD.poolSize`
 * / `MOTE.poolSize`)要在这个估算之上再乘一层安全冗余 —— 见
 * `tests/spawnBudget.test.ts` 的断言:调难度曲线时如果把池撑爆,测试会
 * 先于玩家发现。
 */

/** 危险物一次穿屏(GAME_WIDTH)大约要多久(ms) */
function crossingMs(actualSpeedPxPerSec: number): number {
  return (GAME_WIDTH / actualSpeedPxPerSec) * 1000;
}

/**
 * 遍历整条难度曲线取历史最大并发数,向上取整。
 * 难度曲线在 90 秒后封顶(见 `difficulty.ts`),遍历到 120 秒足够覆盖峰值。
 */
export function peakHazards(): number {
  let peak = 0;
  for (let elapsedSeconds = 0; elapsedSeconds <= 120; elapsedSeconds += 0.5) {
    const d = difficultyAt(elapsedSeconds);
    // 生成时实际用的是 u(d.hazardSpeed)(换算成真实像素/秒),这里必须用
    // 同一个换算,否则算出来的池容量和真实生成速率对不上。
    const actualSpeed = u(d.hazardSpeed);
    const concurrent = (d.hazardBatch * crossingMs(actualSpeed)) / d.hazardIntervalMs;
    peak = Math.max(peak, concurrent);
  }
  return Math.ceil(peak);
}

export function peakMotes(): number {
  let peak = 0;
  for (let elapsedSeconds = 0; elapsedSeconds <= 120; elapsedSeconds += 0.5) {
    const d = difficultyAt(elapsedSeconds);
    const concurrent = MOTE.lifetimeMs / d.moteIntervalMs;
    peak = Math.max(peak, concurrent);
  }
  return Math.ceil(peak);
}
