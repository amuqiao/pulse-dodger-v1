import Phaser from 'phaser';
import { GAME_WIDTH } from '../viewport';
import { COMBO, PULSE } from '../tuning';
import { THEME } from '../theme';
import type { GameState } from '../core/GameState';

/**
 * 游戏内 HUD:分数、连击、最高分、充能条。只读 GameState,不写。
 *
 * 充能条在这里只是"余光里的冗余指示"—— 主要显示已经搬到玩家身上的
 * PlayerRing(充能环 + 冲击波范围预览),躲避游戏玩家视线锁在自己身上,
 * 不会一直盯着屏幕角落看。原来屏幕中上的 `copy.pulseReady` 居中提示文字
 * 已删除:有了玩家身上的环 + 范围预览 + 金色目标高亮之后,那行字是纯
 * 噪音,而且正好挡在碎片从上边入场的区域,反而妨碍判读。
 */
export class Hud {
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly comboText: Phaser.GameObjects.Text;
  private readonly comboBar: Phaser.GameObjects.Graphics;
  private readonly bestText: Phaser.GameObjects.Text;
  private readonly chargeBar: Phaser.GameObjects.Graphics;

  /** 上一次画的分数,用来判定"分数变化了"从而触发 pop 动画,不是每帧都 pop。 */
  private lastScore = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const { space, font } = THEME;

    // setOrigin(0, 0):分数 pop 动画只向右下方撑开,不会因为缩放而挪位。
    this.scoreText = scene.add
      .text(space.md, space.sm, '0', {
        fontSize: font.hudScore,
        color: THEME.text.primary,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
      .setDepth(100);

    // 连击倍率,分数正下方一行。倍率为 1(没有连击)时隐藏,不占位置。
    this.comboText = scene.add
      .text(space.md, this.scoreText.y + this.scoreText.height + space.xs, '', {
        fontSize: font.button,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0)
      .setDepth(100)
      .setVisible(false);

    // 连击倒计时细线,紧贴连击文字下方,宽度 = comboRemainingRatio。
    this.comboBar = scene.add.graphics().setDepth(100);

    this.bestText = scene.add
      .text(
        space.md,
        this.comboText.y + this.comboText.height + THEME.combo.barHeight + space.sm,
        '',
        { fontSize: font.small, color: THEME.text.dim },
      )
      .setDepth(100);

    this.chargeBar = scene.add.graphics().setDepth(100);
  }

  update(state: GameState): void {
    this.updateScore(state);
    this.updateCombo(state);
    this.updateChargeBar(state);

    this.bestText.setText(`BEST  ${state.best}`);
  }

  /** 分数变化时 scale 1 → 1.18 → 1,120ms;不变时什么都不做。 */
  private updateScore(state: GameState): void {
    if (state.score === this.lastScore) {
      return;
    }
    this.lastScore = state.score;
    this.scoreText.setText(String(state.score));

    const { feedback } = THEME;
    this.scene.tweens.killTweensOf(this.scoreText);
    this.scoreText.setScale(1);
    this.scene.tweens.add({
      targets: this.scoreText,
      scale: feedback.scorePopScale,
      duration: feedback.scorePopMs / 2,
      yoyo: true,
      ease: 'Quad.Out',
    });
  }

  /**
   * 连击显示:颜色随倍率从 colorLow 线性插到 colorHigh,下面一条细线
   * 直接回答"我还有多久断连" —— 这是让玩家为了续连击去冒险的钩子。
   */
  private updateCombo(state: GameState): void {
    const { combo, space } = THEME;

    if (state.combo <= 1) {
      this.comboText.setVisible(false);
      this.comboBar.clear();
      return;
    }

    this.comboText.setVisible(true);
    this.comboText.setText(THEME.copy.comboLabel(state.combo));

    const ratio = Phaser.Math.Clamp((state.combo - 1) / (COMBO.maxMultiplier - 1), 0, 1);
    const from = Phaser.Display.Color.ValueToColor(combo.colorLow);
    const to = Phaser.Display.Color.ValueToColor(combo.colorHigh);
    const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, Math.round(ratio * 100));
    const color = Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
    this.comboText.setColor(`#${color.toString(16).padStart(6, '0')}`);

    const barY = this.comboText.y + this.comboText.height + space.xs / 2;
    this.comboBar.clear();
    this.comboBar.fillStyle(THEME.chargeBar.trackFill, 1);
    this.comboBar.fillRect(this.comboText.x, barY, combo.barWidth, combo.barHeight);
    this.comboBar.fillStyle(color, 1);
    this.comboBar.fillRect(this.comboText.x, barY, combo.barWidth * state.comboRemainingRatio, combo.barHeight);
  }

  private updateChargeBar(state: GameState): void {
    const { chargeBar: bar, space } = THEME;

    // 右上角留给暂停按钮,所以充能条下移一行
    const x = GAME_WIDTH - space.md - bar.width;
    const y = bar.top;

    this.chargeBar.clear();
    this.chargeBar.fillStyle(bar.trackFill, bar.alpha);
    this.chargeBar.fillRoundedRect(x, y, bar.width, bar.height, bar.radius);

    const ratio = Phaser.Math.Clamp(state.charge / PULSE.maxCharge, 0, 1);
    if (ratio > 0) {
      this.chargeBar.fillStyle(state.pulseReady ? THEME.entity.pulse : THEME.entity.mote, bar.alpha);
      this.chargeBar.fillRoundedRect(x, y, Math.max(bar.height, bar.width * ratio), bar.height, bar.radius);
    }

    if (state.pulseReady) {
      // 满充能时轻微呼吸,给一个"可以按了"的视觉钩子(玩家身上的 PlayerRing
      // 才是主要提示,这里只是余光里同步呼吸的冗余指示)。
      const alpha = (0.55 + Math.sin(this.scene.time.now / 140) * 0.35) * bar.alpha;
      const glow = THEME.space.xs / 2;
      this.chargeBar.fillStyle(THEME.entity.pulse, alpha * 0.4);
      this.chargeBar.fillRoundedRect(
        x - glow,
        y - glow,
        bar.width + glow * 2,
        bar.height + glow * 2,
        bar.radius + glow,
      );
    }
  }
}
