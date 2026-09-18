import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';

/**
 * 星空背景。
 *
 * 贴的是 BootScene 里用 `generateTexture` 预先烘好的 `tex-starfield`
 * (和 `makeGlowCircle` 同一套"Graphics 画一次、烘成贴图、之后只贴图"的
 * 做法)。原来的 `drawStarfield()` 每帧都要重新提交 60 条 `fillCircle`
 * 绘制命令 —— Graphics 对象不缓存绘制结果,这些命令在每一帧都要重新
 * 走一遍;换成贴图后这里只是加一张 Image,和其余实体一样走批渲染。
 */
export class Backdrop {
  constructor(scene: Phaser.Scene, depth = -10) {
    scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'tex-starfield').setDepth(depth);
  }
}
