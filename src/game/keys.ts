export const SCENES = {
  Boot: 'Boot',
  Menu: 'Menu',
  Play: 'Play',
  Result: 'Result',
} as const;

export const TEXTURES = {
  player: 'player',
  collectible: 'collectible',
  hazard: 'hazard',
  sparkle: 'sparkle',
} as const;

export const STORAGE_KEYS = {
  progress: 'phaser-cg-template.progress.v1',
  storageCheck: 'phaser-cg-template.storageCheck',
} as const;
