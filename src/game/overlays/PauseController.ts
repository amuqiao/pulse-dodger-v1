import Phaser from 'phaser';
import { GAME_WIDTH, u } from '../viewport';
import { THEME } from '../theme';
import { Panel, type PanelButton } from '../ui/Panel';
import { SCENES } from '../scenes/contracts';
import { fadeToScene } from '../scenes/transition';
import { platform } from '../../platform';

/**
 * PauseController 需要的外部依赖,由调用方(PlayScene)注入。
 *
 * 之所以不直接在这个文件里 import GameState 或 effects/audio,是因为
 * `overlays/` 的定位是"下一款游戏整个目录照抄":不依赖 core/、不依赖
 * effects/、不依赖具体 Scene。暂停要冻结/恢复的"玩法状态"、要读写的
 * "静音状态"都是每款游戏各自的实现细节,PauseController 只认这份契约,
 * 不认具体实现,这样才谈得上"原样搬走"。
 */
export interface PauseControllerHooks {
  /** 让 PlayScene 冻结自己的玩法状态(例如把状态机切到 'paused') */
  onPause(): void;
  /** 解冻 + 给缓冲窗(例如推迟下一波生成时间) */
  onResume(): void;
  /** PlayScene 说了算:死亡结算中不许暂停 */
  canPause(): boolean;
  /** 读当前是否用户静音。只在平台不提供静音开关时才会被调用 */
  isAudioMuted(): boolean;
  /** 切换用户静音,返回切换后的状态。只在平台不提供静音开关时才会被调用 */
  toggleAudioMuted(): boolean;
}

/**
 * 暂停系统:右上角按钮 / ESC / 窗口失焦自动暂停 / 退出到主页。
 *
 * 整段"照抄"的外壳代码 —— 见 README「参考这个模板时,哪层照抄、哪层重写」。
 * 换玩法时这个文件不需要改一行,PlayScene 只需要通过 PauseControllerHooks
 * 接好自己的状态机。
 */
export class PauseController {
  private paused = false;
  private panel: Panel | null = null;
  private pausedTweens: Phaser.Tweens.Tween[] = [];
  private readonly pauseButton: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: PauseControllerHooks,
  ) {
    this.pauseButton = this.createPauseButton();
    this.bindEsc();
    this.bindAutoPause();
  }

  /** ESC / 暂停按钮共用的切换逻辑:暂停中就恢复,没暂停就暂停(非自动触发) */
  toggle(): void {
    if (this.paused) {
      this.resume();
    } else {
      this.pause(false);
    }
  }

  private createPauseButton(): Phaser.GameObjects.Text {
    const button = this.scene.add
      .text(GAME_WIDTH - THEME.space.lg, THEME.space.md, THEME.copy.pauseGlyph, {
        fontSize: THEME.font.body,
        color: THEME.text.primary,
        backgroundColor: '#1a2440cc',
        padding: { x: u(18), y: u(12) },
      })
      .setOrigin(1, 0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });

    button.on(
      'pointerdown',
      (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        // 阻止这次点击继续冒泡去触发冲击波。`pointer.event` 是原生 DOM 事件,
        // stopPropagation 只挡 DOM 冒泡,拦不住 Phaser 自己的 input 事件链
        // (this.input.on('pointerdown', this.tryPulse, this) 走的就是这条链)。
        // Phaser 的冒泡阻断走第 4 个参数(EventData),必须调它的 stopPropagation()。
        event.stopPropagation();
        this.pause(false);
      },
    );

    return button;
  }

  private bindEsc(): void {
    this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC).on('down', () => {
      this.toggle();
    });
  }

  /**
   * 暂停有两个入口,缺一不可:
   *   主动 —— 玩家按 ESC 或点暂停按钮,他知道自己按了
   *   被动 —— 窗口失焦,玩家毫不知情。**这个比主动的更重要**
   *
   * 关于 Phaser 的默认行为(实测 node_modules/phaser/src/core/Game.js):
   *   切标签页(HIDDEN)  → Phaser 会自己 loop.pause(),游戏事实上停住了
   *   点到别的窗口(BLUR) → Phaser 只设 inFocus=false,**游戏继续跑**
   * 所以 BLUR 是真缺口。而 HIDDEN 虽然 Phaser 停了循环,但它会在回来时
   * **立刻自动恢复**,玩家还没反应过来就要操作 —— 所以这里也接管,
   * 让玩家自己点"继续"再开始。
   */
  private bindAutoPause(): void {
    const onBlur = (): void => this.pause(true);
    const onVisible = (): void => this.pause(true);
    this.scene.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.scene.game.events.on(Phaser.Core.Events.VISIBLE, onVisible);

    // **场景级清理**。Phaser 的场景切走后 game.events 上的监听不会自动移除,
    // 不解绑的话下次进 Play 会重复注册,失焦一次弹出多个面板。
    // 后端里请求结束一切自动回收,游戏里没有这个保障,必须手写。
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.game.events.off(Phaser.Core.Events.BLUR, onBlur);
      this.scene.game.events.off(Phaser.Core.Events.VISIBLE, onVisible);
      this.restorePausedTweens();
      this.panel?.destroy();
      this.panel = null;
    });
  }

  private pause(auto: boolean): void {
    // 死亡结算 / 广告流程中不允许暂停,否则会和复活询问的倒计时打架
    if (this.paused || !this.hooks.canPause()) {
      return;
    }

    this.paused = true;
    this.scene.physics.pause();
    this.pauseActiveTweens();
    this.scene.time.paused = true;
    this.pauseButton.setVisible(false);
    this.hooks.onPause();

    // 暂停期间不算"在玩",要通知平台,否则平台数据会虚高
    platform().gameplayStop();

    const buttons: PanelButton[] = [
      { label: THEME.copy.resume, style: 'primary' as const, onClick: () => this.resume() },
      { label: THEME.copy.quitToMenu, style: 'ghost' as const, onClick: () => this.quitToMenu() },
    ];

    // 平台没提供静音时,暂停面板里顺手给一个 —— 这是玩家最可能想在这里调的东西
    if (!platform().capabilities.platformProvidesAudioToggle) {
      buttons.splice(1, 0, {
        label: this.hooks.isAudioMuted() ? THEME.copy.soundOff : THEME.copy.soundOn,
        style: 'ghost' as const,
        onClick: () => {
          const muted = this.hooks.toggleAudioMuted();
          this.panel?.setButtonLabel(1, muted ? THEME.copy.soundOff : THEME.copy.soundOn);
        },
      });
    }

    this.panel = new Panel(this.scene, {
      title: THEME.copy.paused,
      subtitle: auto ? THEME.copy.autoPausedHint : undefined,
      buttons,
    });
  }

  private resume(): void {
    if (!this.paused) {
      return;
    }

    this.paused = false;
    this.panel?.destroy();
    this.panel = null;
    this.pauseButton.setVisible(true);

    this.scene.physics.resume();
    this.restorePausedTweens();
    this.scene.time.paused = false;
    this.hooks.onResume();

    platform().gameplayStart();
  }

  private quitToMenu(): void {
    this.paused = false;
    this.scene.time.paused = false;
    this.restorePausedTweens();
    fadeToScene(this.scene, SCENES.Menu);
  }

  private pauseActiveTweens(): void {
    this.pausedTweens = this.scene.tweens.getTweens().filter((tween) => !tween.paused);
    for (const tween of this.pausedTweens) {
      tween.pause();
    }
  }

  private restorePausedTweens(): void {
    for (const tween of this.pausedTweens) {
      tween.resume();
    }
    this.pausedTweens = [];
  }
}
