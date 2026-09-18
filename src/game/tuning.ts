import { u } from './viewport.ts';

export const PLAYER = {
  radius: u(18),
  speed: u(560),
};

export const COLLECTIBLE = {
  radius: u(12),
  score: 10,
  spawnMs: 900,
};

export const HAZARD = {
  radius: u(16),
  scorePenalty: 15,
  spawnMs: 1100,
  speedMin: u(120),
  speedMax: u(260),
};

export const RUN = {
  durationMs: 45_000,
  startGraceMs: 1000,
  maxFrameDeltaMs: 250,
};
