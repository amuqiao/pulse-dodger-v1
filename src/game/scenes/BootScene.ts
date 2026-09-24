import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { HAZARD, MOTE, PLAYER } from '../tuning';
import { THEME } from '../theme';
import { platform } from '../../platform';
import { audio } from '../effects/audio';
import { SCENES } from './contracts';

/**
 * 启动场景:生成纹理 + 发平台 loading 信号。
 *
 * 后端类比:这里相当于应用启动时的 lifespan/startup —— 建连接、预热缓存,
 * 做完才允许接流量。游戏里"允许接流量"就是切到 MenuScene。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Boot);
  }

  preload(): void {
    // 告诉平台"我开始加载了"。真实项目里 this.load.image(...) 写在这里。
    platform().loadingStart();

    // 接线给 LoadingOverlay.setProgress()。当前零素材,进度事件不会真的
    // 触发,但这是模板 —— 下一款游戏在这里加 this.load.image(...) 时,
    // 进度条不需要额外接线就能工作。用 game.events 转发,因为
    // LoadingOverlay 实例活在 main.ts,BootScene 拿不到它的引用。
    this.load.on(Phaser.Loader.Events.PROGRESS, (ratio: number) => {
      this.game.events.emit('boot-progress', ratio);
    });
  }

  create(): void {
    this.generateTextures();
    audio.bindPlatformSettings();

    // 加载结束。漏掉 loadingStop,平台会一直以为游戏卡在加载中。
    platform().loadingStop();

    // 刻意不用 fadeToScene:启动瞬间屏幕本来就是空的,淡出只是让玩家多等 200ms
    this.scene.start(SCENES.Menu);

    // 贴图已生成、场景已切走才算真正"就绪"。main.ts 靠这个信号关闭
    // LoadingOverlay,不能用 Phaser.Core.Events.READY —— 它在任何场景的
    // preload/create 之前就已经触发。
    this.game.events.emit('boot-complete');
  }

  /**
   * 用 Graphics 画好再 generateTexture 成贴图。
   * 相比每帧用 Graphics 重绘,贴图可以走批渲染,几百个物体也不掉帧。
   */
  private generateTextures(): void {
    this.makePlayerCore('tex-player', PLAYER.radius);
    this.makeShard('tex-hazard', HAZARD.radius);
    this.makeEnergyDiamond('tex-mote', MOTE.radius);
    this.makeSoftDot('tex-spark', 6, 0xffffff);
    this.makeStarfield('tex-starfield');
  }

  private makePlayerCore(key: string, radius: number): void {
    const size = radius * 4;
    const cx = size / 2;
    const cy = size / 2;
    const g = this.add.graphics();

    g.fillStyle(THEME.entity.playerGlow, 0.16);
    g.fillCircle(cx, cy, radius * 2);
    g.lineStyle(Math.max(2, radius * 0.12), THEME.entity.playerGlow, 0.75);
    g.strokeCircle(cx, cy, radius * 1.34);
    g.fillStyle(THEME.entity.player, 1);
    g.fillCircle(cx, cy, radius);
    g.fillStyle(0xffffff, 0.84);
    g.fillCircle(cx - radius * 0.25, cy - radius * 0.3, radius * 0.32);
    g.lineStyle(Math.max(1, radius * 0.08), 0xffffff, 0.28);
    g.beginPath();
    g.arc(cx, cy, radius * 0.72, Phaser.Math.DegToRad(190), Phaser.Math.DegToRad(330));
    g.strokePath();

    g.generateTexture(key, size, size);
    g.destroy();
  }

  private makeShard(key: string, radius: number): void {
    const size = radius * 4;
    const cx = size / 2;
    const cy = size / 2;
    const g = this.add.graphics();
    const points = [
      new Phaser.Geom.Point(cx, cy - radius * 1.45),
      new Phaser.Geom.Point(cx + radius * 1.2, cy - radius * 0.18),
      new Phaser.Geom.Point(cx + radius * 0.45, cy + radius * 1.25),
      new Phaser.Geom.Point(cx - radius * 0.95, cy + radius * 0.9),
      new Phaser.Geom.Point(cx - radius * 1.25, cy - radius * 0.35),
    ];

    g.fillStyle(THEME.entity.hazardGlow, 0.2);
    g.fillCircle(cx, cy, radius * 1.9);
    g.fillStyle(THEME.entity.hazard, 1);
    g.fillPoints(points, true);
    g.lineStyle(Math.max(2, radius * 0.12), 0xffffff, 0.26);
    g.strokePoints(points, true);
    g.lineStyle(Math.max(1, radius * 0.08), 0xffffff, 0.45);
    g.lineBetween(cx - radius * 0.3, cy - radius * 0.85, cx + radius * 0.55, cy + radius * 0.35);

    g.generateTexture(key, size, size);
    g.destroy();
  }

  private makeEnergyDiamond(key: string, radius: number): void {
    const size = radius * 4;
    const cx = size / 2;
    const cy = size / 2;
    const g = this.add.graphics();
    const points = [
      new Phaser.Geom.Point(cx, cy - radius * 1.35),
      new Phaser.Geom.Point(cx + radius * 1.05, cy),
      new Phaser.Geom.Point(cx, cy + radius * 1.35),
      new Phaser.Geom.Point(cx - radius * 1.05, cy),
    ];

    g.fillStyle(THEME.entity.moteGlow, 0.22);
    g.fillCircle(cx, cy, radius * 1.85);
    g.fillStyle(THEME.entity.mote, 0.92);
    g.fillPoints(points, true);
    g.lineStyle(Math.max(2, radius * 0.1), 0xffffff, 0.44);
    g.strokePoints(points, true);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(cx - radius * 0.18, cy - radius * 0.34, radius * 0.2);

    g.generateTexture(key, size, size);
    g.destroy();
  }

  private makeSoftDot(key: string, radius: number, color: number): void {
    const size = radius * 2;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillCircle(radius, radius, radius);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  /**
   * 星空背景,烘成一整张覆盖全屏的贴图。原来 PlayScene 里的
   * `drawStarfield()` 直接用 Graphics 每帧画 60 个 `fillCircle` ——
   * Graphics 对象不缓存绘制结果,这 60 条命令每一帧都要重新提交一遍。
   * 和 `makeGlowCircle` 同一套做法:Graphics 只在这里画一次,烘成贴图后
   * 全程只是贴一张 Image,走批渲染。
   */
  private makeStarfield(key: string): void {
    const g = this.add.graphics();

    g.fillStyle(THEME.bgAccent, 0.18);
    g.fillCircle(GAME_WIDTH * 0.18, GAME_HEIGHT * 0.22, GAME_WIDTH * 0.22);
    g.fillStyle(THEME.entity.moteGlow, 0.12);
    g.fillCircle(GAME_WIDTH * 0.78, GAME_HEIGHT * 0.28, GAME_WIDTH * 0.18);
    g.fillStyle(THEME.entity.hazardGlow, 0.1);
    g.fillCircle(GAME_WIDTH * 0.64, GAME_HEIGHT * 0.82, GAME_WIDTH * 0.24);

    g.lineStyle(1, THEME.entity.playerGlow, 0.12);
    for (let i = 0; i < 9; i++) {
      const y = GAME_HEIGHT * (0.12 + i * 0.095);
      g.lineBetween(GAME_WIDTH * 0.08, y, GAME_WIDTH * 0.92, y + Math.sin(i) * GAME_HEIGHT * 0.018);
    }

    g.fillStyle(0xffffff, THEME.starfield.alpha);
    for (let i = 0; i < THEME.starfield.count; i++) {
      const r = Phaser.Math.Between(THEME.starfield.minRadius, THEME.starfield.maxRadius);
      g.fillCircle(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), r);
    }

    g.generateTexture(key, GAME_WIDTH, GAME_HEIGHT);
    g.destroy();
  }
}
