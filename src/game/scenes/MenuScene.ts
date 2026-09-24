import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, u } from '../viewport';
import { BANNER_CONTAINER_ID } from '../keys';
import { THEME } from '../theme';
import { GameState } from '../core/GameState';
import { scores } from '../composition';
import { platform } from '../../platform';
import { audio } from '../effects/audio';
import { Button } from '../ui/Button';
import { settingsRows } from './SettingsScene';
import { SCENES } from './contracts';
import { fadeInScene, fadeToScene } from './transition';
import { Backdrop } from '../objects/Backdrop';

/** 一组一起摆放的 GameObject,`width` 是它们从左边缘到右边缘的总宽度。
 * 全部按"左边缘 = 局部原点 0"建好之后,一次性整体平移到最终位置 —— 这样
 * "先建、量宽度、再居中整行"不需要建两遍,也不需要反过来翻查 scene.children。 */
type Positionable = Phaser.GameObjects.Text | Phaser.GameObjects.Image | Phaser.GameObjects.Graphics;

interface Cluster {
  elements: Positionable[];
  width: number;
}

/** 一颗呼吸中的装饰性能量点(纯视觉,不参与任何判定) */
interface BreathingMote {
  image: Phaser.GameObjects.Image;
  /** 相位偏移,让多颗不会同步呼吸——这是弧度,不是空间数值,不需要 u() */
  phase: number;
}

export class MenuScene extends Phaser.Scene {
  private startButton: Button | null = null;
  private underline: Phaser.GameObjects.Graphics | null = null;
  private underlineCenterX = 0;
  private underlineY = 0;
  private breathingMotes: BreathingMote[] = [];

  constructor() {
    super(SCENES.Menu);
  }

  create(): void {
    const y = (ratio: number): number => GAME_HEIGHT * ratio;
    const cx = GAME_WIDTH / 2;
    this.startButton = null;
    this.underline = null;
    this.breathingMotes = [];

    fadeInScene(this);
    this.cameras.main.setBackgroundColor(THEME.bg);
    this.drawBackdrop();
    this.createLiveBackground();

    this.createIdentityGroup(cx, y(THEME.anchor.title), y(THEME.anchor.lead));
    this.placeRowCentered(cx, y(THEME.anchor.lead), this.buildLegendChips());
    this.createStatsCard(cx, y(THEME.anchor.stats));
    this.createActionGroup(cx, y);
    this.placeRowCentered(cx, y(THEME.anchor.footer), this.buildFooterSegments(), THEME.space.xs);

    // banner 只在菜单和结算页展示,不遮挡玩法 —— 这是 CrazyGames 审核关注的点
    if (platform().capabilities.banners) {
      void platform().showBanner(BANNER_CONTAINER_ID);
    }
  }

  override update(time: number): void {
    this.startButton?.update(time);
    this.updateUnderline(time);
    this.updateBreathingMotes(time);
  }

  /** 把一组 Cluster 横向排成一行、整体居中在 cx 上,clusters 内部元素已经按各自局部原点建好。 */
  private placeRowCentered(cx: number, rowY: number, clusters: Cluster[], gap: number = THEME.space.lg): void {
    const totalWidth = clusters.reduce((sum, c) => sum + c.width, 0) + gap * (clusters.length - 1);

    let cursorX = cx - totalWidth / 2;
    for (const cluster of clusters) {
      for (const el of cluster.elements) {
        el.x += cursorX;
        el.y += rowY;
      }
      cursorX += cluster.width + gap;
    }
  }

  /** ① 身份组:大标题 + 零成本辉光(同一份文字复制一份,半透明、略放大、放在下面) + 呼吸横线 */
  private createIdentityGroup(cx: number, titleY: number, nextRowY: number): void {
    this.add
      .text(cx, titleY, THEME.copy.gameTitle, {
        fontSize: THEME.font.title,
        color: THEME.text.accent,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScale(1.03)
      .setAlpha(0.22)
      .setDepth(-1)
      .setLetterSpacing(u(4));

    const title = this.add
      .text(cx, titleY, THEME.copy.gameTitle, {
        fontSize: THEME.font.title,
        color: THEME.text.primary,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setLetterSpacing(u(4));

    this.underline = this.add.graphics();
    this.underlineCenterX = cx;
    // 取"标题底边"和"下一行"的中点,而不是固定偏移。
    // 固定偏移在这里会翻车:title 字号 u(62) 的实际文本高度约 160px,
    // 底边距离 anchor.lead 只剩 30px 左右,再加 space.sm 就骑到图例行上,
    // 把"躲开 / 吃掉"串成一条线。自适应中点则无论字号怎么调都不会压行。
    const titleBottom = titleY + title.height / 2;
    this.underlineY = (titleBottom + nextRowY) / 2;
    this.updateUnderline(this.time.now);
  }

  /**
   * ② 教学组 —— 本次改动里价值最高的一块。
   *
   * 用三个「实际游戏贴图 + 两字标签」的图例 chip 替换掉原来那行长 tagline。
   * 玩家进游戏前就用真正的 tex-hazard / tex-mote 贴图建立"红 = 危险 /
   * 蓝 = 能量"的颜色映射,进入玩法的一瞬间直接复用这份认知,不需要先读完
   * 一整行小字才明白规则 —— 那行小字的实际阅读率历来很低。
   */
  private buildLegendChips(): Cluster[] {
    const iconSize = u(16);
    const iconGap = THEME.space.xs;
    return [
      this.buildImageChip('tex-hazard', THEME.copy.legendDodge, iconSize, iconGap),
      this.buildImageChip('tex-mote', THEME.copy.legendEat, iconSize, iconGap),
      this.buildRingChip(THEME.copy.legendClear, iconSize, iconGap),
    ];
  }

  private buildImageChip(textureKey: string, label: string, iconSize: number, iconGap: number): Cluster {
    const icon = this.add.image(iconSize / 2, 0, textureKey).setDisplaySize(iconSize, iconSize).setOrigin(0.5);
    const text = this.add
      .text(iconSize + iconGap, 0, label, { fontSize: THEME.font.body, color: THEME.text.primary })
      .setOrigin(0, 0.5);
    return { elements: [icon, text], width: iconSize + iconGap + text.width };
  }

  private buildRingChip(label: string, iconSize: number, iconGap: number): Cluster {
    const radius = iconSize / 2;
    const ring = this.add.graphics();
    ring.lineStyle(THEME.panel.strokeWidth, THEME.entity.pulse, 1);
    ring.strokeCircle(radius, 0, radius - THEME.panel.strokeWidth / 2);
    const text = this.add
      .text(iconSize + iconGap, 0, label, { fontSize: THEME.font.body, color: THEME.text.primary })
      .setOrigin(0, 0.5);
    return { elements: [ring, text], width: iconSize + iconGap + text.width };
  }

  /** ③ 状态组:只在打过至少一局(best > 0)时出现的最高分卡片 */
  private createStatsCard(cx: number, cardY: number): void {
    // GameState 现在通过构造函数注入 ScoreRepository(见 core/GameState.ts 的
    // 依赖倒置改造),不再自带默认存档实现,这里改用唯一的组装点 composition.ts。
    const best = new GameState(scores).best;
    if (best <= 0) {
      return;
    }

    const label = this.add
      .text(0, 0, THEME.copy.bestScore, { fontSize: THEME.font.small, color: THEME.text.dim })
      .setOrigin(0.5);
    const value = this.add
      .text(0, 0, String(best), {
        fontSize: THEME.font.heading,
        color: THEME.text.accent,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const cardWidth = Math.max(label.width, value.width) + THEME.space.lg * 2;
    const cardHeight = label.height + THEME.space.xs + value.height + THEME.space.sm * 2;

    // 卡片背景要先画、再叠文字,所以 depth 压低一档,不然会挡住数字
    // (这里 Graphics 是在文字量完尺寸之后才建的,建的顺序和视觉叠放顺序无关,只看 depth)。
    const card = this.add.graphics().setDepth(-1);
    card.fillStyle(THEME.overlayFill, 0.5);
    card.fillRoundedRect(cx - cardWidth / 2, cardY - cardHeight / 2, cardWidth, cardHeight, THEME.panel.cornerRadius);

    label.setPosition(cx, cardY - cardHeight / 2 + THEME.space.sm + label.height / 2);
    value.setPosition(cx, label.y + label.height / 2 + THEME.space.xs + value.height / 2);
  }

  /** ④ 操作组:开始游戏(真按钮 + 时间驱动的呼吸缩放)+ 设置(ghost 按钮) */
  private createActionGroup(cx: number, y: (ratio: number) => number): void {
    this.startButton = new Button(
      this,
      cx,
      y(THEME.anchor.action),
      THEME.copy.startGame,
      () => {
        audio.unlock();
        platform().clearBanners();
        fadeToScene(this, SCENES.Play);
      },
      { variant: 'primary', fontSize: THEME.font.button },
    );
    // alpha 闪烁在 UI 语言里表达的是"禁用/加载中",是反信号 —— 改成实心底色,
    // 呼吸只做一个几乎不影响可读性的 scale 微动,而且只在这一个按钮上开启。
    this.startButton.enableBreathing(0.02, 1400);

    this.createSettingsEntry(cx, y(THEME.anchor.subAction));
  }

  /**
   * 设置入口**按需出现**。
   *
   * 这是"平台已提供的别重做"原则的落地:settingsRows() 会根据平台能力
   * 过滤掉不该显示的行(例如 CrazyGames 上外框已有静音,就不显示音效开关)。
   * 过滤后如果一行都不剩,连入口按钮都不画 —— 而不是给玩家一个空页面。
   */
  private createSettingsEntry(cx: number, rowY: number): void {
    if (settingsRows().length === 0) {
      return;
    }

    new Button(
      this,
      cx,
      rowY,
      THEME.copy.settings,
      () => {
        audio.unlock();
        fadeToScene(this, SCENES.Settings);
      },
      {
        variant: 'ghost',
        fontSize: THEME.font.small,
        paddingX: THEME.space.md,
        paddingY: THEME.space.xs,
      },
    );
  }

  /** ⑤ 页脚:纯文本 + 两个键帽样式的小方块("空格"/"ESC"),而不是一整句纯文本 */
  private buildFooterSegments(): Cluster[] {
    const { footerHint } = THEME.copy;
    return [
      this.buildTextSegment(footerHint.before),
      this.buildKeycapSegment(footerHint.spaceKey),
      this.buildTextSegment(footerHint.middle),
      this.buildKeycapSegment(footerHint.escKey),
      this.buildTextSegment(footerHint.after),
    ];
  }

  private buildTextSegment(label: string): Cluster {
    const text = this.add
      .text(0, 0, label, { fontSize: THEME.font.small, color: THEME.text.dim })
      .setOrigin(0, 0.5);
    return { elements: [text], width: text.width };
  }

  private buildKeycapSegment(label: string): Cluster {
    const text = this.add
      .text(0, 0, label, {
        fontSize: THEME.font.small,
        color: THEME.button.ghostText,
        backgroundColor: THEME.button.ghostBg,
        padding: { x: THEME.space.xs, y: THEME.space.xs / 2 },
      })
      .setOrigin(0, 0.5);
    return { elements: [text], width: text.width };
  }

  private updateUnderline(time: number): void {
    if (!this.underline) {
      return;
    }
    // 时间驱动的呼吸(基于绝对时间,不是每帧累加相位角),144Hz/165Hz 下和 60Hz 观感一致
    const breath = 0.82 + Math.sin(time / 1100) * 0.18;
    const width = u(220) * breath;
    this.underline.clear();
    this.underline.fillStyle(THEME.entity.player, 0.6);
    this.underline.fillRoundedRect(this.underlineCenterX - width / 2, this.underlineY, width, u(3), u(2));
  }

  private updateBreathingMotes(time: number): void {
    for (const mote of this.breathingMotes) {
      const breath = Math.sin(time / 900 + mote.phase);
      mote.image.setAlpha(0.5 + breath * 0.25);
      mote.image.setScale(0.85 + breath * 0.1);
    }
  }

  /** ⑥ 活背景:装饰实体只走外围轨道,把标题—图例—START 留成高级感中心静区。 */
  private createLiveBackground(): void {
    const hazardTracks = [
      { x: GAME_WIDTH * 0.1, y: GAME_HEIGHT * 0.18, drift: u(130), duration: 9000 },
      { x: GAME_WIDTH * 0.9, y: GAME_HEIGHT * 0.2, drift: u(150), duration: 10200 },
      { x: GAME_WIDTH * 0.08, y: GAME_HEIGHT * 0.74, drift: u(170), duration: 11200 },
      { x: GAME_WIDTH * 0.92, y: GAME_HEIGHT * 0.78, drift: u(145), duration: 9800 },
    ];

    for (const [i, track] of hazardTracks.entries()) {
      const image = this.add.image(track.x, track.y, 'tex-hazard').setAlpha(0.28).setScale(0.74);
      this.tweens.add({
        targets: image,
        x: { from: track.x - track.drift, to: track.x + track.drift },
        angle: { from: -18, to: 18 },
        duration: track.duration + i * 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    const motePositions = [
      { x: GAME_WIDTH * 0.24, y: GAME_HEIGHT * 0.18 },
      { x: GAME_WIDTH * 0.76, y: GAME_HEIGHT * 0.18 },
      { x: GAME_WIDTH * 0.5, y: GAME_HEIGHT * 0.84 },
    ];
    for (let i = 0; i < motePositions.length; i++) {
      const pos = motePositions[i]!;
      const image = this.add.image(pos.x, pos.y, 'tex-mote').setAlpha(0.7);
      this.breathingMotes.push({ image, phase: i * Math.PI * 0.72 });
    }
  }

  private drawBackdrop(): void {
    // 复用 BootScene 烘好的 tex-starfield,不要用 Graphics 现画。
    //
    // Phaser 的 Graphics **不缓存几何结果**:GraphicsWebGLRenderer 每帧对每个可见
    // Graphics 整体重跑一遍命令缓冲(只判断 commandBuffer 是否为空,没有脏检查),
    // 而且每个 fillCircle 内部用固定 iterStep=0.01 拆成约 100 个点、每个点当场 new 一个 Point。
    // 46 个圆 = 每帧约 4600 次小对象分配,而主菜单恰好是玩家停留最久的画面。
    //
    // PlayScene 侧早就用 Backdrop + tex-starfield 解决过这个问题,这里当初漏了。
    new Backdrop(this);
  }
}
