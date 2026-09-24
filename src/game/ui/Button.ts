import Phaser from 'phaser';
import { THEME } from '../theme';
import { audio } from '../effects/audio';

/**
 * 按钮状态机 —— Panel(暂停/设置/复活)、MenuScene、SettingsScene 四处共用。
 *
 * 在这个组件之前,按钮只是一段带 `backgroundColor` 的 Phaser.Text,
 * `useHandCursor: true` 顶多换个鼠标指针,点下去没有任何视觉反馈,
 * 触屏上更是连"按下"这个状态都不存在。
 *
 * 三态:idle → hover → press → release(回 hover 或 idle)。
 * 具体数值全部来自 THEME.buttonState,不在这里写死。
 *
 * ── 触屏特殊处理 ──────────────────────────────────────────────
 * 触屏没有"悬停"这个物理状态,但浏览器会在 touchstart 时补发一次
 * `pointerover`,而触屏上永远不会有对应的"手指移开但没抬起"的
 * `pointerout` —— 结果是 hover 态被点亮之后卡住,直到下一次触摸别处才复位。
 * 这里的处理是:`pointerover` 时如果 `pointer.wasTouch` 为 true 直接跳过
 * (不进入 hover 态),按下的反馈完全交给 `pointerdown` 里的 press 态;
 * `pointerup`/`pointerout` 都无条件把状态复位,双重保险不卡死。
 *
 * ── 呼吸(可选)──────────────────────────────────────────────
 * 部分按钮(主页的"开始游戏")需要一个和交互状态无关的持续呼吸动画。
 * 呼吸必须是时间驱动(`Math.sin(time / period)`),不能是每帧累加的相位角
 * (那样在 144Hz/165Hz 下会转得更快,参见 `Hud.updateChargeBar()` 里同样
 * 手法的满充能呼吸效果,以及 README"帧率一致性")。
 * 交互状态(hover/press)通过 tween 改变 `stateScale`,呼吸通过 `update(time)`
 * 计算 `breathScale`,最终显示缩放是两者相乘 —— 两套动画互不打架。
 */

export type ButtonVariant = 'primary' | 'warning' | 'ghost';

export interface ButtonOptions {
  variant?: ButtonVariant;
  fontSize?: string;
  fixedWidth?: number;
  paddingX?: number;
  paddingY?: number;
}

export class Button {
  /** 底层文本对象。公开出去是为了让调用方在必要时挂自己的额外监听
   * (例如 MenuScene 的设置入口需要在 pointerdown 里 stopPropagation,
   * 这属于"这一个按钮在这个场景里的组合行为",不属于 Button 通用状态机的职责)。 */
  readonly text: Phaser.GameObjects.Text;

  private readonly scene: Phaser.Scene;
  private readonly variant: ButtonVariant;
  private readonly baseBg: string;
  private readonly brightBg: string;

  /** 交互状态贡献的缩放(idle=1 / hover=hoverScale / press=pressScale),由 tween 驱动 */
  private stateScale = 1;
  /** 呼吸贡献的缩放倍率,默认 1(不呼吸) */
  private breathScale = 1;
  private breathAmplitude = 0;
  private breathPeriodMs = 1;
  /** tween 的目标不能直接是 GameObject 的 scale 属性(会和呼吸缩放互相覆盖),
   * 用一个中间代理对象承接 tween,onUpdate 里再和呼吸缩放相乘后写回 GameObject。 */
  private readonly scaleProxy = { value: 1 };
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    options: ButtonOptions = {},
  ) {
    this.scene = scene;
    this.variant = options.variant ?? 'primary';
    this.baseBg = bgColorFor(this.variant);
    this.brightBg = brightenCss(this.baseBg, THEME.buttonState.hoverBrighten);

    /**
     * ⚠️ Phaser 陷阱:**不要写 `fixedWidth: options.fixedWidth`**。
     *
     * 不传 fixedWidth 时那样写会在 style 对象上留下一个**值为 undefined 的自有属性**。
     * Phaser 的 `GetValue(style, 'fixedWidth', 0)` 用的是 `hasOwnProperty` 判断,
     * 显式 undefined 能通过,于是返回 undefined 而不是默认值 0
     * (node_modules/phaser/src/utils/object/GetValue.js)。
     *
     * 而 `Text.updateText()` 只在 `style.fixedWidth === 0` 时才给 `this.width` 赋值
     * (Text.js:1271)。于是 width 永远是 undefined,`setOrigin(0.5)` 算出 NaN,
     * **整个按钮被画在 NaN 坐标上,完全不可见**。
     *
     * 这个 bug 类型检查和构建都发现不了(`fixedWidth?: number` 完全合法),
     * 只有实际截图才能抓到。所以这里按需拼装 style,不传就不放这个键。
     */
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: options.fontSize ?? THEME.font.body,
      color: textColorFor(this.variant),
      backgroundColor: this.baseBg,
      padding: { x: options.paddingX ?? THEME.button.paddingX, y: options.paddingY ?? THEME.button.paddingY },
      align: 'center',
    };
    if (options.fixedWidth !== undefined) {
      style.fixedWidth = options.fixedWidth;
    }

    this.text = scene.add.text(x, y, label, style).setOrigin(0.5);

    this.wireInteractions(onClick);
  }

  /** 打开时间驱动的呼吸缩放。amplitude 是相对 1 的偏移量(例如 0.02 表示 1.0↔1.02)。 */
  enableBreathing(amplitude: number, periodMs: number): void {
    this.breathAmplitude = amplitude;
    this.breathPeriodMs = periodMs;
  }

  /** 每帧调用一次(只有开了呼吸的按钮需要);没开呼吸时是空操作,不需要调用。 */
  update(time: number): void {
    if (this.breathAmplitude === 0) {
      return;
    }
    this.breathScale = 1 + Math.sin(time / this.breathPeriodMs) * this.breathAmplitude;
    this.applyScale();
  }

  setLabel(label: string): void {
    this.text.setText(label);
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) {
      return;
    }
    this.enabled = enabled;
    if (!enabled) {
      this.scene.tweens.killTweensOf(this.scaleProxy);
      this.stateScale = 1;
      this.scaleProxy.value = 1;
      this.text.setStyle({ backgroundColor: this.baseBg });
      this.text.setAlpha(THEME.buttonState.disabledAlpha);
      this.applyScale();
      return;
    }
    this.text.setAlpha(1);
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.scaleProxy);
    this.text.destroy();
  }

  private wireInteractions(onClick: () => void): void {
    this.text.setInteractive({ useHandCursor: true });

    this.text.on('pointerover', (pointer: Phaser.Input.Pointer) => {
      if (!this.enabled || pointer.wasTouch) {
        return;
      }
      this.setHover(true);
      audio.uiHover();
    });

    this.text.on('pointerout', () => {
      if (!this.enabled) {
        return;
      }
      this.setHover(false);
    });

    this.text.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.enabled) {
        return;
      }
      this.tweenScaleTo(THEME.buttonState.pressScale, THEME.buttonState.pressMs);
      // 触屏没有 hover 态,按下这一下就是它唯一的"被摸到了"反馈
      if (pointer.wasTouch) {
        this.text.setStyle({ backgroundColor: this.brightBg });
      }
    });

    this.text.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.enabled) {
        return;
      }
      // 鼠标松开时通常还悬停在按钮上,回 hover 态;触屏松开等于手指离开,直接回 idle
      const backToHover = !pointer.wasTouch;
      this.tweenScaleTo(backToHover ? THEME.buttonState.hoverScale : 1, THEME.buttonState.hoverMs);
      this.text.setStyle({ backgroundColor: backToHover ? this.brightBg : this.baseBg });
      audio.uiClick();
      onClick();
    });
  }

  private setHover(active: boolean): void {
    this.tweenScaleTo(active ? THEME.buttonState.hoverScale : 1, THEME.buttonState.hoverMs);
    this.text.setStyle({ backgroundColor: active ? this.brightBg : this.baseBg });
  }

  private tweenScaleTo(target: number, duration: number): void {
    this.scene.tweens.killTweensOf(this.scaleProxy);
    this.scaleProxy.value = this.stateScale;
    this.scene.tweens.add({
      targets: this.scaleProxy,
      value: target,
      duration,
      ease: 'Quad.Out',
      onUpdate: () => {
        this.stateScale = this.scaleProxy.value;
        this.applyScale();
      },
    });
  }

  private applyScale(): void {
    this.text.setScale(this.stateScale * this.breathScale);
  }
}

function bgColorFor(variant: ButtonVariant): string {
  if (variant === 'primary') return THEME.button.primaryBg;
  if (variant === 'warning') return THEME.button.warningBg;
  return THEME.button.ghostBg;
}

function textColorFor(variant: ButtonVariant): string {
  if (variant === 'primary') return THEME.button.primaryText;
  if (variant === 'warning') return THEME.button.warningText;
  return THEME.button.ghostText;
}

/** 把 CSS 十六进制颜色提亮 `amount`(0-1 比例),返回同样格式的 CSS 十六进制字符串。 */
function brightenCss(hex: string, amount: number): string {
  const color = Phaser.Display.Color.HexStringToColor(hex).brighten(amount * 100);
  return Phaser.Display.Color.RGBToString(color.red, color.green, color.blue, 255, '#');
}
