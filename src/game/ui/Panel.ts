import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { THEME } from '../theme';
import { Button, type ButtonVariant } from './Button';

/**
 * 弹出面板的通用构造器。
 *
 * 为什么值得单独抽出来:暂停、设置、复活三处都需要
 * "半透明遮罩 + 居中卡片 + 一列按钮",而且**都要挡住底下的点击**。
 * 不抽的话这段布局代码会被抄三遍,改一次样式要改三处。
 *
 * 样式全部读 THEME,所以换皮时这个文件一行都不用动。
 *
 * ⚠️ 公开 API(constructor 的 PanelOptions、setSubtitle、setButtonLabel、destroy)
 * 是和 overlays/PauseController.ts、overlays/ReviveFlow.ts 的硬约定 ——
 * 按钮内部用 `Button` 状态机绘制、面板本身带入场/退场动画,都是这层公开
 * 形状之下的实现细节,调用方只依赖这四个成员的签名。
 */

export type ButtonStyle = ButtonVariant;

export interface PanelButton {
  label: string;
  style?: ButtonStyle;
  onClick: () => void;
}

export interface PanelOptions {
  title: string;
  /** 标题下的一行小字,可选 */
  subtitle?: string;
  buttons: PanelButton[];
  /** 面板宽度,不给就按内容估 */
  width?: number;
}

/** 入场/退场动画时长(毫秒)。退场比入场短一半,符合"关闭比打开更快"的常见交互直觉。 */
const ENTER_MS = 140;
const EXIT_MS = 100;

export class Panel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly scrim: Phaser.GameObjects.Rectangle;
  /** 卡片 + 标题 + 副标题 + 按钮,作为一个整体做 scale/alpha 入场动画 */
  private readonly content: Phaser.GameObjects.Container;
  private readonly buttons: Button[] = [];
  /** 副标题对象,用于倒计时这类需要每秒刷新的场景 */
  private subtitleText: Phaser.GameObjects.Text | null = null;
  private destroyed = false;

  constructor(scene: Phaser.Scene, options: PanelOptions) {
    const { panel, space } = THEME;
    const width = options.width ?? panel.defaultWidth;
    const buttonCount = options.buttons.length;
    // 高度按实际排版算,不要拍脑袋给个大概值 —— 否则面板底部会留一块空白
    const height =
      panel.headerHeight +
      (options.subtitle ? panel.subtitleHeight : 0) +
      buttonCount * panel.buttonRow +
      panel.bottomPadding;

    this.scene = scene;
    this.container = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(500);

    // 全屏遮罩。setInteractive 是关键:挡住底下场景的点击,
    // 否则玩家点"继续"按钮旁边的空白会穿透到游戏里放技能。
    // 遮罩单独做 alpha 淡入淡出,不跟着卡片一起缩放 —— 一块挡住全屏的
    // 矩形如果也 scale 0.94→1,边缘会露出没盖住的缝隙。
    this.scrim = scene.add
      .rectangle(0, 0, GAME_WIDTH * 2, GAME_HEIGHT * 2, THEME.scrimFill, THEME.scrimAlpha)
      .setInteractive()
      .setAlpha(0);

    this.content = scene.add.container(0, 0).setScale(0.94).setAlpha(0);

    const card = scene.add
      .rectangle(0, 0, width, height, THEME.overlayFill, THEME.overlayAlpha)
      .setStrokeStyle(THEME.panel.strokeWidth, THEME.entity.player);

    const top = -height / 2;

    const title = scene.add
      .text(0, top + space.lg, options.title, {
        fontSize: THEME.font.button,
        color: THEME.text.primary,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.content.add([card, title]);

    let cursorY = top + panel.headerHeight;

    if (options.subtitle) {
      const subtitle = scene.add
        .text(0, cursorY, options.subtitle, {
          fontSize: THEME.font.small,
          color: THEME.text.dim,
          align: 'center',
          wordWrap: { width: width - space.xl },
        })
        .setOrigin(0.5);
      this.subtitleText = subtitle;
      this.content.add(subtitle);
      cursorY += panel.subtitleHeight;
    }

    for (const spec of options.buttons) {
      const button = new Button(scene, 0, cursorY + space.md, spec.label, spec.onClick, {
        variant: spec.style ?? 'primary',
        fixedWidth: width - panel.buttonWidthInset,
        paddingY: space.xs,
      });
      this.buttons.push(button);
      this.content.add(button.text);
      cursorY += panel.buttonRow;
    }

    this.container.add([this.scrim, this.content]);

    // ------------------------------------------------------------------
    // 入场动画必须在这里(构造函数内部)同步创建,不能延迟到下一帧。
    //
    // overlays/PauseController 的调用顺序是先 `tweens.pauseAll()` 冻结场景里
    // 已存在的所有 tween,再 `new Panel(...)`。Phaser 的 `pauseAll()` 只会
    // 遍历"当时已经存在"的 tween 逐个 pause,构造函数之后才创建的新 tween
    // 不在那次遍历里,天然不受影响、正常播放。一旦把这两行 tween 挪到
    // `scene.time.delayedCall` / 下一帧再建,就会错过这个时机窗口,
    // 有几率被后续某次 pauseAll 连带冻住,面板变成"卡在半透明"。
    // ------------------------------------------------------------------
    scene.tweens.add({ targets: this.scrim, alpha: 1, duration: ENTER_MS });
    scene.tweens.add({
      targets: this.content,
      scale: 1,
      alpha: 1,
      duration: ENTER_MS,
      ease: 'Back.Out',
    });
  }

  /** 运行时改副标题,用于倒计时 */
  setSubtitle(label: string): void {
    if (!this.subtitleText) {
      throw new Error('Panel 创建时没有 subtitle,无法 setSubtitle');
    }
    this.subtitleText.setText(label);
  }

  /** 运行时改按钮文案,用于"音效:开 / 音效:关"这种就地切换 */
  setButtonLabel(index: number, label: string): void {
    const button = this.buttons[index];
    if (!button) {
      throw new Error(`Panel 没有第 ${index} 个按钮`);
    }
    button.setLabel(label);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;

    this.scene.tweens.add({ targets: this.scrim, alpha: 0, duration: EXIT_MS });
    this.scene.tweens.add({
      targets: this.content,
      scale: 0.94,
      alpha: 0,
      duration: EXIT_MS,
      ease: 'Quad.In',
      onComplete: () => {
        for (const button of this.buttons) {
          button.destroy();
        }
        this.container.destroy();
      },
    });
  }
}
