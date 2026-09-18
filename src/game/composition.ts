import { SAVE_KEYS } from './keys';
import { platform } from '../platform';
import type { ScoreRepository } from './core/ScoreRepository';
/**
 * 唯一的组装点(composition root)。
 *
 * 整个工程只有一个需要在"生产实现"和"测试 fake"之间切换的依赖
 * (存档),所以不需要 DI 容器 / 服务定位器 / 装饰器注入那一套 —— 一个
 * 模块级常量就够了,ESM 模块本身就是天然的单例容器。
 *
 * 依赖关系类比(如果你是 FastAPI 背景):
 *   ScoreRepository 接口           ≈ 依赖的抽象签名(Depends 的类型)
 *   PlatformScoreRepository        ≈ 生产用的 Depends(get_db)
 *   InMemoryScoreRepository(测试)≈ app.dependency_overrides[get_db] = fake
 *   composition.ts                 ≈ 应用启动时的那次 wiring
 *
 * Scene 层要用存档能力时,从这里 import `scores`,不要自己 `new
 * PlatformScoreRepository()`——那样测试时就没法整体替换掉。
 */

/**
 * `ScoreRepository` 的生产实现 —— 相当于 FastAPI 里真正连数据库的
 * `get_db()`。它是唯一知道 `SAVE_KEYS` 长什么样、知道存档字符串怎么
 * 解析成整数的地方,domain 层(GameState)完全不接触这些细节。
 */
export class PlatformScoreRepository implements ScoreRepository {
  loadBestScore(): number {
    return readInt(SAVE_KEYS.bestScore, 0);
  }

  saveBestScore(value: number): void {
    platform().save(SAVE_KEYS.bestScore, String(value));
  }

  loadRunsPlayed(): number {
    return readInt(SAVE_KEYS.runsPlayed, 0);
  }

  saveRunsPlayed(value: number): void {
    platform().save(SAVE_KEYS.runsPlayed, String(value));
  }
}

/**
 * 两种"空"要分清楚,这是本文件最容易搞混的地方:
 *
 * - `platform().load(key)` 返回 `null`(key 从没存过)→ 这里返回 `fallbackValue`。
 *   这**不是兜底**,是"没玩过 = 最高分/局数 0"的正常领域语义,和"出错"无关。
 * - `platform().load(key)` 返回了值但解析不出整数(比如存档被手改坏了)
 *   → **直接抛**,不要静默当作 0 处理。这是真问题,必须让它看得见。
 */
function readInt(key: string, fallbackValue: number): number {
  const raw = platform().load(key);
  if (raw === null) {
    return fallbackValue;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`存档字段 ${key} 不是合法整数: ${raw}`);
  }
  return parsed;
}

export const scores = new PlatformScoreRepository();
