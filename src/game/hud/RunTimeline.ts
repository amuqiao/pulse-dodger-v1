import Phaser from 'phaser';
import { GAME_WIDTH } from '../viewport';
import { THEME } from '../theme';
import { DIFFICULTY_RAMP_SECONDS, PHASE_CROSSFIRE_SECONDS, PHASE_OVERLOAD_SECONDS } from '../core/difficulty';

/**
 * 顶边难度进度条覆盖的总时长(秒)。
 *
 * 直接引用 `core/difficulty.ts` 的 `DIFFICULTY_RAMP_SECONDS`,不在这里
 * 另起一份数值——进度条画的就是难度曲线本身的进度,两边如果各写各的
 * 常量,改难度曲线时进度条会悄悄和实际难度脱节,而且不会有任何报错。
 */
const RUN_DURATION_SECONDS = DIFFICULTY_RAMP_SECONDS;

/** 刻度闪烁的时间窗(秒):阶段切换前 1.5s 到阶段切换时刻。 */
const BLINK_WINDOW_SECONDS = 1.5;

/**
 * 屏幕最顶边一条通栏难度进度条。零文字,占 `THEME.timeline.height` 那么
 * 几像素,完整回答"我撑了多久 / 还有多久到顶" —— 比在 HUD 上加秒数好,
 * 秒数要读,进度条只要扫一眼。
 *
 * 只读 elapsedSeconds/now,不碰 GameState、不碰物理。
 */
export class RunTimeline {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    // depth 和 Hud 同级:都是"顶边常驻信息层"。
    this.graphics = scene.add.graphics().setDepth(100);
  }

  update(elapsedSeconds: number, now: number): void {
    const timeline = THEME.timeline;
    const ratio = Phaser.Math.Clamp(elapsedSeconds / RUN_DURATION_SECONDS, 0, 1);
    const filled = ratio >= 1;

    this.graphics.clear();

    if (ratio > 0) {
      const color = filled ? THEME.entity.pulse : this.colorAt(ratio);
      this.graphics.fillStyle(color, timeline.alpha);
      this.graphics.fillRect(0, 0, GAME_WIDTH * ratio, timeline.height);
    }

    this.drawMark(elapsedSeconds, now, timeline, PHASE_CROSSFIRE_SECONDS, THEME.entity.hazard);
    this.drawMark(elapsedSeconds, now, timeline, PHASE_OVERLOAD_SECONDS, THEME.entity.pulse);
  }

  /** entity.mote → entity.hazard 的线性插值,ratio 0..1。 */
  private colorAt(ratio: number): number {
    const from = Phaser.Display.Color.ValueToColor(THEME.entity.mote);
    const to = Phaser.Display.Color.ValueToColor(THEME.entity.hazard);
    const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, Math.round(ratio * 100));
    return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
  }

  /** 阶段刻度;切换前 1.5s 基于绝对时间闪烁。 */
  private drawMark(
    elapsedSeconds: number,
    now: number,
    timeline: (typeof THEME)['timeline'],
    markAtSeconds: number,
    color: number,
  ): void {
    const blinkStartSeconds = markAtSeconds - BLINK_WINDOW_SECONDS;
    const inBlinkWindow = elapsedSeconds >= blinkStartSeconds && elapsedSeconds < markAtSeconds;
    // 闪烁本身用绝对时间(now)判定开关,窗口边界用 elapsedSeconds —— 前者
    // 保证闪烁节奏不受帧率/暂停影响,后者保证"在哪个时间窗闪"跟游戏进度走。
    const visible = !inBlinkWindow || Math.floor(now / timeline.markBlinkMs) % 2 === 0;

    if (!visible) {
      return;
    }

    const x = GAME_WIDTH * (markAtSeconds / RUN_DURATION_SECONDS);
    this.graphics.fillStyle(color, 1);
    this.graphics.fillRect(x - timeline.markWidth / 2, 0, timeline.markWidth, timeline.height);
  }
}
