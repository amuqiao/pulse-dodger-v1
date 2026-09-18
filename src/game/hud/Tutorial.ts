import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, u } from '../viewport';
import { THEME } from '../theme';

/**
 * Tutorial 只读 + 只渲染,不碰物理、不碰 GameState —— 调用方(PlayScene)
 * 把它需要知道的一切都算好塞进这个 DTO 里。非首局时调用方直接不 new 它,
 * 零运行时开销。
 */
export interface TutorialContext {
  now: number;
  playerX: number;
  playerY: number;
  chargeRatio: number;
  pulseReady: boolean;
  motesCollected: number;
  pulsesFired: number;
  /** 触屏时提示文案不同(拖动 vs 鼠标/键盘措辞) */
  isTouch: boolean;
  /** 玩家累计位移(设计单位),调用方算好传进来 */
  movedDistance: number;
}

type Phase = 'move' | 'collect' | 'charge' | 'pulse' | 'done';

// ── 移动阶段的虚线环 ──────────────────────────────────────────
const RING_RADIUS = u(28);
const RING_LINE_WIDTH = u(2);
const RING_DASH_COUNT = 12;
const RING_DASH_RATIO = 0.5;
/** 环转一整圈的时长(ms)。时间驱动的角度,不是每帧累加相位角 —— 高刷屏
 * 上不会转得更快(同 Button.ts 呼吸动画的写法)。 */
const RING_ROTATE_PERIOD_MS = 6000;

// ── 各阶段的推进阈值(非空间数值,纯数字) ──────────────────────
const MOVE_MOVED_THRESHOLD = u(160);
const MOVE_TIMEOUT_MS = 3000;
const CHARGE_AUTO_MS = 1600;
/** 首局宽限期:这段时间内 wantsHazardHold 为 true,调用方据此跳过危险物生成 */
const HAZARD_HOLD_MS = 1800;

// ── 提示气泡的跟随偏移与出屏翻转 ──────────────────────────────
const HORIZONTAL_HINT_OFFSET = u(90);
const CHARGE_HINT_OFFSET = u(60);
const PULSE_HINT_OFFSET_Y = u(70);
/** 判断"贴边翻到另一侧"用的安全边距,按提示气泡的大致半宽/半高估算 */
const EDGE_MARGIN_X = u(140);
const EDGE_MARGIN_Y = u(80);
const HINT_PADDING = THEME.space.xs;

/**
 * 首局内嵌引导。四段串行状态机:移动 → 收集 → 充能因果 → 释放 → 完成。
 * 三条设计约束(见各 update 方法):
 *   1. 同一时刻最多一条提示 —— 只有一个 hintText,不并列渲染多条。
 *   2. 提示永远跟着玩家球走,靠近屏幕边缘翻到另一侧,不钉在屏幕角落。
 *   3. 不暂停游戏 —— 这个类完全不碰 scene.time.paused / physics.pause。
 */
export class Tutorial {
  private readonly ringGraphics: Phaser.GameObjects.Graphics;
  private readonly bgGraphics: Phaser.GameObjects.Graphics;
  private readonly hintText: Phaser.GameObjects.Text;

  private phase: Phase = 'move';
  private phaseStartMs = 0;
  private startNow: number | null = null;
  private now = 0;

  constructor(scene: Phaser.Scene) {
    // 105/106:压在 Hud(100)之上,保证在星空背景和玩法实体前可读,
    // 但不需要盖过任何弹出面板(面板走各自场景的更高 depth)。
    this.ringGraphics = scene.add.graphics().setDepth(105);
    this.bgGraphics = scene.add.graphics().setDepth(105);
    this.hintText = scene.add
      .text(0, 0, '', { fontSize: THEME.font.body, color: THEME.text.primary, align: 'center' })
      .setOrigin(0.5)
      .setDepth(106);
  }

  /** 首局开头请求暂缓生成碎片。首次 update() 之前(还没拿到 now)也保守地返回 true。 */
  get wantsHazardHold(): boolean {
    if (this.startNow === null) {
      return true;
    }
    return this.now - this.startNow < HAZARD_HOLD_MS;
  }

  get isDone(): boolean {
    return this.phase === 'done';
  }

  update(ctx: TutorialContext): void {
    this.now = ctx.now;
    if (this.startNow === null) {
      this.startNow = ctx.now;
      this.phaseStartMs = ctx.now;
    }

    if (this.phase === 'done') {
      return;
    }

    switch (this.phase) {
      case 'move':
        this.updateMove(ctx);
        break;
      case 'collect':
        this.updateCollect(ctx);
        break;
      case 'charge':
        this.updateCharge(ctx);
        break;
      case 'pulse':
        this.updatePulse(ctx);
        break;
    }
  }

  destroy(): void {
    this.ringGraphics.destroy();
    this.bgGraphics.destroy();
    this.hintText.destroy();
  }

  private enterPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseStartMs = this.now;
    if (phase !== 'move') {
      this.ringGraphics.clear();
    }
    if (phase === 'done') {
      this.bgGraphics.clear();
      this.hintText.setVisible(false);
    }
  }

  private updateMove(ctx: TutorialContext): void {
    this.drawRing(ctx.playerX, ctx.playerY);
    const label = ctx.isTouch ? THEME.copy.tutMoveTouch : THEME.copy.tutMove;
    this.renderHint(label, ctx.playerX, ctx.playerY, HORIZONTAL_HINT_OFFSET, 0);

    const timedOut = this.now - this.phaseStartMs > MOVE_TIMEOUT_MS;
    if (ctx.movedDistance > MOVE_MOVED_THRESHOLD || timedOut) {
      this.enterPhase('collect');
    }
  }

  private updateCollect(ctx: TutorialContext): void {
    this.renderHint(THEME.copy.tutCollect, ctx.playerX, ctx.playerY, HORIZONTAL_HINT_OFFSET, 0);
    if (ctx.motesCollected >= 1) {
      this.enterPhase('charge');
    }
  }

  private updateCharge(ctx: TutorialContext): void {
    this.renderHint(THEME.copy.tutCharge, ctx.playerX, ctx.playerY, CHARGE_HINT_OFFSET, 0);
    if (this.now - this.phaseStartMs > CHARGE_AUTO_MS) {
      this.enterPhase('pulse');
    }
  }

  private updatePulse(ctx: TutorialContext): void {
    // 桌面同时支持鼠标点击和空格,两条措辞一起给,仍然只是"一条提示"
    // (同一个 hintText,多行内容,不是并列的两条独立提示)。
    const label = ctx.isTouch
      ? THEME.copy.tutPulseTouch
      : `${THEME.copy.tutPulseMouse}\n${THEME.copy.tutPulseKey}`;
    this.renderHint(label, ctx.playerX, ctx.playerY, 0, PULSE_HINT_OFFSET_Y);

    // 不设超时 —— 这一步必须学会,超时消失等于没教。
    if (ctx.pulsesFired >= 1) {
      this.enterPhase('done');
    }
  }

  /** 缓慢旋转的白色虚线环,角度由绝对时间算出,不是每帧累加。 */
  private drawRing(x: number, y: number): void {
    this.ringGraphics.clear();
    this.ringGraphics.lineStyle(RING_LINE_WIDTH, 0xffffff, 0.8);

    const rotation = ((this.now % RING_ROTATE_PERIOD_MS) / RING_ROTATE_PERIOD_MS) * Phaser.Math.PI2;
    const step = Phaser.Math.PI2 / RING_DASH_COUNT;
    const dashLength = step * RING_DASH_RATIO;

    for (let i = 0; i < RING_DASH_COUNT; i++) {
      const start = rotation + i * step;
      const end = start + dashLength;
      this.ringGraphics.beginPath();
      this.ringGraphics.arc(x, y, RING_RADIUS, start, end, false);
      this.ringGraphics.strokePath();
    }
  }

  /**
   * 提示气泡:永远贴着玩家球(跟随 px/py),靠近屏幕边缘时把偏移方向
   * 翻到另一侧 —— 玩家视线不需要离开自己去找提示。
   */
  private renderHint(label: string, px: number, py: number, offsetX: number, offsetY: number): void {
    const dx = this.resolveOffset(offsetX, px, GAME_WIDTH, EDGE_MARGIN_X);
    const dy = this.resolveOffset(offsetY, py, GAME_HEIGHT, EDGE_MARGIN_Y);
    const x = px + dx;
    const y = py + dy;

    this.hintText.setText(label).setPosition(x, y).setVisible(true);

    const w = this.hintText.width + HINT_PADDING * 2;
    const h = this.hintText.height + HINT_PADDING * 2;
    this.bgGraphics.clear();
    this.bgGraphics.fillStyle(0x000000, 0.55);
    this.bgGraphics.fillRoundedRect(x - w / 2, y - h / 2, w, h, THEME.panel.cornerRadius);
  }

  private resolveOffset(offset: number, playerPos: number, axisSize: number, margin: number): number {
    if (offset === 0) {
      return 0;
    }
    if (playerPos + offset + margin > axisSize || playerPos + offset - margin < 0) {
      return -offset;
    }
    return offset;
  }
}
