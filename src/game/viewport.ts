/**
 * 画布尺寸与设计单位换算。
 *
 * 视觉相关的一切(颜色、字号、间距、文案)在 theme.ts,换皮时改那边。
 *
 * ── 单位体系 ──────────────────────────────────────────────
 * 整套 UI 和数值都按 **960×540 设计单位** 写,和实际渲染多少像素解耦。
 * 想换渲染分辨率,**只改 RENDER_WIDTH 一个数**,其余全部自动跟着走。
 *
 * 这套做法等价于前端的 rem:你按设计稿单位写,一个根值决定最终像素。
 */

/** 设计基准。所有布局数字都按这个宽度设计,不要改。 */
const DESIGN_WIDTH = 960;

/**
 * 实际渲染宽度 —— **改分辨率只改这一个数**。
 *
 * 选 1920 的理由:这正好是 CrazyGames 列出的最大 iframe 尺寸
 * (桌面全屏 1920×1080),意味着在平台内永远不会被放大,只会被缩小。
 * 位图放大会糊,缩小不会。
 *
 * 如果某款游戏粒子特别重、要照顾低配 Chromebook,把这里调回 960 即可,
 * 其余代码一行不用动。
 */
export const RENDER_WIDTH = 1920;

/** 设计单位 → 实际像素的换算系数 */
export const UI_SCALE = RENDER_WIDTH / DESIGN_WIDTH;

/** 把设计单位换算成实际像素。所有空间类数值都要过这个函数。 */
export const u = (designUnits: number): number => Math.round(designUnits * UI_SCALE);

// 16:9 固定。CrazyGames 列出的 8 种 iframe 尺寸全是 16:9,不需要支持别的比例。
export const GAME_WIDTH = RENDER_WIDTH;
export const GAME_HEIGHT = Math.round((RENDER_WIDTH * 9) / 16);
