export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const DESIGN_WIDTH = 1280;
export const UNIT_SCALE = GAME_WIDTH / DESIGN_WIDTH;

export const u = (designUnits: number): number => Math.round(designUnits * UNIT_SCALE);

