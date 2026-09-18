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
    this.makeGlowCircle('tex-player', PLAYER.radius, THEME.entity.player, THEME.entity.playerGlow);
    this.makeGlowCircle('tex-hazard', HAZARD.radius, THEME.entity.hazard, 0x7f1d3a);
    this.makeGlowCircle('tex-mote', MOTE.radius, THEME.entity.mote, 0x0c4a6e);
    this.makeSoftDot('tex-spark', 6, 0xffffff);
    this.makeStarfield('tex-starfield');
  }

  private makeGlowCircle(key: string, radius: number, core: number, glow: number): void {
    const size = radius * 4;
    const g = this.add.graphics();

    g.fillStyle(glow, 0.22);
    g.fillCircle(size / 2, size / 2, radius * 2);
    g.fillStyle(glow, 0.45);
    g.fillCircle(size / 2, size / 2, radius * 1.4);
    g.fillStyle(core, 1);
    g.fillCircle(size / 2, size / 2, radius);
    g.fillStyle(0xffffff, 0.75);
    g.fillCircle(size / 2 - radius * 0.28, size / 2 - radius * 0.28, radius * 0.34);

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
    g.fillStyle(THEME.bgAccent, THEME.starfield.alpha);
    for (let i = 0; i < THEME.starfield.count; i++) {
      g.fillCircle(
        Phaser.Math.Between(0, GAME_WIDTH),
        Phaser.Math.Between(0, GAME_HEIGHT),
        Phaser.Math.Between(THEME.starfield.minRadius, THEME.starfield.maxRadius),
      );
    }
    g.generateTexture(key, GAME_WIDTH, GAME_HEIGHT);
    g.destroy();
  }
}
