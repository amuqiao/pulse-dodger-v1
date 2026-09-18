import type { ScoreRepository } from '../../src/game/core/ScoreRepository.ts';

/**
 * `ScoreRepository` 的内存 fake,只给测试用。
 * 相当于 FastAPI 测试里 `app.dependency_overrides[get_db] = fake` 的那个 fake。
 */
export class InMemoryScoreRepository implements ScoreRepository {
  private bestScore = 0;
  private runsPlayed = 0;

  loadBestScore(): number {
    return this.bestScore;
  }

  saveBestScore(value: number): void {
    this.bestScore = value;
  }

  loadRunsPlayed(): number {
    return this.runsPlayed;
  }

  saveRunsPlayed(value: number): void {
    this.runsPlayed = value;
  }
}
