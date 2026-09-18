import { strict as assert } from 'node:assert';
import test from 'node:test';
import { RUN } from '../src/game/tuning.ts';
import { RunState } from '../src/game/core/RunState.ts';
import type { ScoreProgress } from '../src/game/core/ScoreRepository.ts';
import { InMemoryScoreRepository } from './fakes/InMemoryScoreRepository.ts';

class ThrowingLoadProgressRepository extends InMemoryScoreRepository {
  override loadProgress(): ScoreProgress {
    throw new Error('progress load failed');
  }
}

class ThrowingSaveProgressRepository extends InMemoryScoreRepository {
  override saveProgress(_progress: ScoreProgress): void {
    throw new Error('storage disabled');
  }
}

test('collecting items increases score', () => {
  const state = new RunState(new InMemoryScoreRepository());
  state.collect();
  state.collect();
  assert.equal(state.score, 20);
});

test('hazard penalty never makes score negative', () => {
  const state = new RunState(new InMemoryScoreRepository());
  state.hitHazard();
  assert.equal(state.score, 0);
});

test('finish writes a new best score and preserves previous best', () => {
  const repo = new InMemoryScoreRepository();
  repo.saveProgress({ bestScore: 10, runsPlayed: 0 });
  const state = new RunState(repo);
  state.collect();
  state.collect();

  const result = state.finish();

  assert.equal(result.isNewBest, true);
  assert.equal(result.previousBest, 10);
  assert.equal(result.bestScore, 20);
  assert.equal(result.progressSaved, true);
  assert.deepEqual(repo.loadProgress(), { bestScore: 20, runsPlayed: 1 });
});

test('finish increments runs played atomically with best score', () => {
  const repo = new InMemoryScoreRepository();
  new RunState(repo).finish();
  const second = new RunState(repo).finish();
  assert.equal(second.runsPlayed, 2);
  assert.equal(second.progressSaved, true);
  assert.deepEqual(repo.loadProgress(), { bestScore: 0, runsPlayed: 2 });
});

test('finish returns a visible unsaved result when progress load fails', () => {
  const state = new RunState(new ThrowingLoadProgressRepository());
  state.collect();

  const result = state.finish();

  assert.equal(result.score, 10);
  assert.equal(result.bestScore, 10);
  assert.equal(result.runsPlayed, 1);
  assert.equal(result.progressSaved, false);
  assert.equal(result.saveErrorMessage, 'progress load failed');
});

test('finish returns a visible unsaved result when progress save fails', () => {
  const state = new RunState(new ThrowingSaveProgressRepository());
  state.collect();

  const result = state.finish();

  assert.equal(result.score, 10);
  assert.equal(result.runsPlayed, 1);
  assert.equal(result.progressSaved, false);
  assert.equal(result.saveErrorMessage, 'storage disabled');
});

test('progress is clamped to one', () => {
  const state = new RunState(new InMemoryScoreRepository());
  for (let elapsed = 0; elapsed < RUN.durationMs * 2; elapsed += RUN.maxFrameDeltaMs) {
    state.tick(RUN.maxFrameDeltaMs);
  }
  assert.equal(state.progress, 1);
  assert.equal(state.complete, true);
});

test('large frame delta is capped', () => {
  const state = new RunState(new InMemoryScoreRepository());
  state.tick(RUN.durationMs * 2);
  assert.equal(state.elapsedMs, RUN.maxFrameDeltaMs);
});
