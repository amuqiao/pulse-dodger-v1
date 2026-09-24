import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, u } from '../viewport';
import { DEATH, GRAZE, HAZARD, PLAYER, PULSE, RUN } from '../tuning';
import { THEME } from '../theme';
import { SCENES, type ResultData } from './contracts';
import { fadeInScene, fadeToScene } from './transition';
import { PauseController } from '../overlays/PauseController';
import { ReviveFlow } from '../overlays/ReviveFlow';
import { Backdrop } from '../objects/Backdrop';
import { PHASE_CROSSFIRE_SECONDS, PHASE_OVERLOAD_SECONDS, difficultyAt } from '../core/difficulty';
import { GameState } from '../core/GameState';
import { scores } from '../composition';
import { Hud } from '../hud/Hud';
import { PlayerRing } from '../hud/PlayerRing';
import { RunTimeline } from '../hud/RunTimeline';
import { Tutorial } from '../hud/Tutorial';
import { platform } from '../../platform';
import { audio } from '../effects/audio';
import { PlayerController } from '../objects/PlayerController';
import { Button } from '../ui/Button';
import { HazardSpawner } from '../objects/HazardSpawner';
import { MoteSpawner } from '../objects/MoteSpawner';
import { Fx } from '../effects/fx';
import { feel } from '../effects/feel';

/** 死亡后的定格时长。让震屏和爆炸演完,玩家才看得清自己是怎么死的。 */
const DEATH_HOLD_MS = 240;

/**
 * 玩法状态机。三种互斥态,非法组合(比如"暂停中同时又在结算")被
 * 类型直接排除,不再需要 `resolving`/`paused` 两个 boolean 手动维护
 * "这两个开关只有 3 种合法组合"这条隐性约束。
 */
type PlayPhase = 'playing' | 'paused' | 'resolving';

/**
 * 主玩法场景。
 *
 * 后端类比:这是 request handler —— 每帧收一次输入,跑一遍规则,写一次输出。
 * 平台相关的东西一律不在这里出现,只通过 platform() 接口走。
 *
 * 暂停系统 / 复活广告编排在 `overlays/`(整段照抄的外壳代码),星空背景在
 * `objects/Backdrop.ts`;玩法机件(玩家移动/输入、危险物与能量点的生成回收)
 * 在 `objects/`,特效与镜头反馈在 `effects/`(换玩法时重写,但对象池化
 * 这套结构照抄)。这个文件只剩:装配(create)、调度(update)、碰撞回调、
 * 以及死亡/结算的编排。
 *
 * 这里刻意不 import GameState 以外的玩法细节:各 system 不许 import
 * GameState(见各 system 文件头注释),"查询 → 改状态 → 表现 → 平台信号"
 * 这四段编排只在这一个文件里发生,谁改了分数永远只有一个答案。
 */
export class PlayScene extends Phaser.Scene {
  private state!: GameState;
  private hud!: Hud;
  private reviveFlow!: ReviveFlow;

  private player!: PlayerController;
  private hazards!: HazardSpawner;
  private motes!: MoteSpawner;
  private fx!: Fx;

  private playerRing!: PlayerRing;
  private runTimeline!: RunTimeline;
  private tutorial: Tutorial | null = null;
  private touchPulseButton: Button | null = null;

  private phase: PlayPhase = 'playing';
  private announcedIntensityPhase = -1;

  /** 满充能的"从未满到满"边缘检测,只在跳变那一帧触发 playReadyBurst + 音效。 */
  private wasPulseReady = false;

  /** 玩家移动累计距离,只喂给 Tutorial 判断"玩家动过了没"。 */
  private movedDistance = 0;
  private lastPlayerX = 0;
  private lastPlayerY = 0;

  /** Tutorial 专用的本局统计,独立维护而不是从 GameState 读 ——
   * GameState 目前只在 finish() 时才吐出这两个数字,不许碰 core/ 去加实时 getter。 */
  private tutorialMotesCollected = 0;
  private tutorialPulsesFired = 0;

  /** graze 连击链:1.5s 内连续 graze 计数,超过窗口就重新从 1 计,喂给 audio.graze() 做音高上行。 */
  private grazeChain = 0;
  private lastGrazeAt = -Infinity;
  private hasShownGrazeHint = false;
  private pauseStartedAt: number | null = null;

  constructor() {
    super(SCENES.Play);
  }

  create(): void {
    // GameState 现在通过构造函数注入 ScoreRepository(依赖倒置改造),
    // 用唯一的组装点 composition.ts,不在这里自己 new 具体实现。
    this.state = new GameState(scores);
    this.phase = 'playing';
    this.wasPulseReady = false;
    this.movedDistance = 0;
    this.tutorialMotesCollected = 0;
    this.tutorialPulsesFired = 0;
    this.grazeChain = 0;
    this.lastGrazeAt = -Infinity;
    this.hasShownGrazeHint = false;
    this.pauseStartedAt = null;
    this.lastPlayerX = GAME_WIDTH / 2;
    this.lastPlayerY = GAME_HEIGHT / 2;

    this.cameras.main.setBackgroundColor(THEME.bg);
    new Backdrop(this);

    this.player = new PlayerController(this, { onPulseInput: () => this.onPulse() });
    this.hazards = new HazardSpawner(this);
    this.motes = new MoteSpawner(this);
    this.fx = new Fx(this);

    this.physics.add.overlap(this.player.sprite, this.motes.group, this.onCollectMote, undefined, this);
    this.physics.add.overlap(this.player.sprite, this.hazards.group, this.onHitHazard, undefined, this);

    this.hud = new Hud(this);
    this.playerRing = new PlayerRing(this);
    this.runTimeline = new RunTimeline(this);

    // 首局(累计局数为 0)才需要教学引导;老玩家不用再看一遍。
    const runsPlayed = scores.loadRunsPlayed();
    this.tutorial = runsPlayed === 0 ? new Tutorial(this) : null;
    this.announcedIntensityPhase = -1;
    this.createTouchPulseButton();
    this.showPhaseBanner(THEME.copy.phaseCalibrate);

    // 开局宽限期:HazardSpawner 的 nextSpawnAt 初值是 0,不 holdFor 的话第一帧
    // 就会生成碎片,而玩家刚进场还没看清屏幕。首局给更长的宽限期,配合
    // Tutorial 的引导节奏;非首局给较短的固定宽限期。只推迟 hazard,不推迟
    // mote —— 能量点对玩家有利,没有理由也跟着延后。
    this.hazards.holdFor(runsPlayed === 0 ? RUN.firstRunGraceMs : RUN.introGraceMs);

    // 键盘 SPACE 触发冲击波不属于 PlayerController 的"移动输入分流",
    // 直接在这里绑定同一个 onPulse() 编排入口(见 PlayerController 文件头
    // 关于这个决定的说明)。
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE).on('down', () => this.onPulse());

    // 只在这里 new 出来即可:暂停系统的全部生命周期(按钮/ESC/失焦/退出/
    // SHUTDOWN 解绑)都在 PauseController 内部自我管理,PlayScene 不需要
    // 再持有引用去调用它的任何方法。
    new PauseController(this, {
      onPause: () => {
        this.phase = 'paused';
        this.pauseStartedAt = performance.now();
        this.updateTouchPulseButton();
      },
      onResume: () => {
        if (this.pauseStartedAt === null) {
          throw new Error('PauseController resume called without a recorded pause start');
        }
        const pausedForMs = performance.now() - this.pauseStartedAt;
        this.pauseStartedAt = null;
        this.motes.extendActiveLifetimes(pausedForMs);
        this.phase = 'playing';
        this.updateTouchPulseButton();
        // 给缓冲窗再恢复生成,避免"点继续的瞬间被一直悬在头上的碎片撞死"。
        // hazard 和 mote 必须同时推迟 —— 只推一个的话另一个的生成节奏没停。
        this.bumpSpawnBuffer(RUN.resumeBufferMs);
      },
      canPause: () => this.phase !== 'resolving',
      isAudioMuted: () => audio.isUserMuted,
      toggleAudioMuted: () => audio.toggleUserMuted(),
    });
    this.reviveFlow = new ReviveFlow(this, {
      setAdMuted: (muted) => audio.setAdMuted(muted),
    });

    fadeInScene(this);

    // 平台信号:玩家真正开始玩了
    platform().gameplayStart();
  }

  override update(_time: number, delta: number): void {
    if (this.phase !== 'playing') {
      this.updateTouchPulseButton();
      return;
    }

    const now = this.time.now;
    this.state.tick(delta);
    this.player.update(delta);

    const { x, y } = this.player.position;

    // 移动距离累计,只喂给 Tutorial,不参与任何玩法判定。
    this.movedDistance += Phaser.Math.Distance.Between(this.lastPlayerX, this.lastPlayerY, x, y);
    this.lastPlayerX = x;
    this.lastPlayerY = y;

    const d = difficultyAt(this.state.elapsedSeconds);
    this.updateIntensityPhase(this.state.elapsedSeconds);

    // Tutorial 首局期间可以要求暂缓危险物生成,跳过 hazard 的生成/回收更新。
    if (!this.tutorial?.wantsHazardHold) {
      this.hazards.update(now, d);
    }
    this.motes.update(now, d);

    this.updateGraze(x, y, now);

    const pulseRadius = this.state.pulseRadius;
    const inRangeCount = this.state.pulseReady ? this.hazards.collectWithin(x, y, pulseRadius).length : 0;
    this.playerRing.update(x, y, this.state.pulseArmRatio, this.state.pulseReady, pulseRadius, inRangeCount, delta, now);

    const pulseReady = this.state.pulseReady;
    if (pulseReady && !this.wasPulseReady) {
      this.playerRing.playReadyBurst(x, y, pulseRadius);
      audio.chargeFull();
    }
    this.wasPulseReady = pulseReady;

    this.runTimeline.update(this.state.elapsedSeconds, now);

    if (this.tutorial) {
      this.tutorial.update({
        now,
        playerX: x,
        playerY: y,
        chargeRatio: this.state.chargeRatio,
        pulseReady: this.state.pulseReady,
        motesCollected: this.tutorialMotesCollected,
        pulsesFired: this.tutorialPulsesFired,
        isTouch: this.sys.game.device.input.touch,
        movedDistance: this.movedDistance,
      });
      if (this.tutorial.isDone) {
        this.tutorial.destroy();
        this.tutorial = null;
      }
    }

    this.hud.update(this.state);
    this.updateTouchPulseButton();
  }

  private createTouchPulseButton(): void {
    if (!this.sys.game.device.input.touch) {
      return;
    }

    this.touchPulseButton = new Button(
      this,
      GAME_WIDTH - u(106),
      GAME_HEIGHT - u(74),
      THEME.copy.touchPulseButton,
      () => this.onPulse(),
      {
        variant: 'warning',
        fontSize: THEME.font.small,
        fixedWidth: u(150),
        paddingX: THEME.space.sm,
        paddingY: THEME.space.sm,
      },
    );
    this.touchPulseButton.text.setDepth(130);
    this.touchPulseButton.text.on(
      'pointerdown',
      (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
      },
    );
    this.touchPulseButton.setEnabled(false);
  }

  private updateTouchPulseButton(): void {
    if (!this.touchPulseButton) {
      return;
    }
    const active = this.phase === 'playing' && this.state.pulseReady;
    this.touchPulseButton.setEnabled(active);
    this.touchPulseButton.text.setVisible(this.phase === 'playing');
  }

  private updateIntensityPhase(elapsedSeconds: number): void {
    const nextPhase = elapsedSeconds >= PHASE_OVERLOAD_SECONDS ? 2 : elapsedSeconds >= PHASE_CROSSFIRE_SECONDS ? 1 : 0;
    if (nextPhase === this.announcedIntensityPhase) {
      return;
    }
    this.announcedIntensityPhase = nextPhase;
    if (nextPhase === 1) {
      this.showPhaseBanner(THEME.copy.phaseCrossfire);
    } else if (nextPhase === 2) {
      this.showPhaseBanner(THEME.copy.phaseOverload);
    }
  }

  private showPhaseBanner(label: string): void {
    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.18, label, {
        fontSize: THEME.font.body,
        color: THEME.text.warning,
        fontStyle: 'bold',
        backgroundColor: THEME.button.ghostBg,
        padding: { x: THEME.space.md, y: THEME.space.xs },
      })
      .setOrigin(0.5)
      .setDepth(140)
      .setAlpha(0);

    this.tweens.add({ targets: text, alpha: 1, y: text.y - u(10), duration: 260, ease: 'Cubic.Out' });
    this.tweens.add({
      targets: text,
      alpha: 0,
      delay: 1150,
      duration: 360,
      ease: 'Cubic.In',
      onComplete: () => text.destroy(),
    });
  }

  /** hazard/mote 的下一次生成时间统一推迟同一个缓冲窗,不再各写各的裸数字。 */
  private bumpSpawnBuffer(bufferMs: number): void {
    this.hazards.holdFor(bufferMs);
    this.motes.holdFor(bufferMs);
  }

  // ---------------------------------------------------------------- graze

  /**
   * graze 查询 → 改状态 → 表现/音效。几何判定(线段到玩家的最短距离,
   * 帧率一致性推理)全部在 `HazardSpawner.collectNewGrazes` 里,这里只管
   * 记账和轻量表现。不震屏、不 hitstop —— 一局会发生几百次,任何"重"的
   * 反馈都会变成噪音。
   */
  private updateGraze(x: number, y: number, now: number): void {
    const contactRadius = PLAYER.radius + HAZARD.radius;
    const newGrazes = this.hazards.collectNewGrazes(x, y, contactRadius, GRAZE.radius);
    if (newGrazes.length === 0) {
      return;
    }

    for (const h of newGrazes) {
      this.state.grazeHazard();

      this.grazeChain = now - this.lastGrazeAt <= GRAZE.chainWindowMs ? this.grazeChain + 1 : 1;
      this.lastGrazeAt = now;

      audio.graze(this.grazeChain);
      this.grazeArc(h, x, y);
      this.grazeChargeFleck(h.x, h.y, x, y);
      if (!this.hasShownGrazeHint) {
        this.hasShownGrazeHint = true;
        this.fx.floatText(x, y - u(62), THEME.copy.grazeHint, THEME.entity.player);
      }
    }
  }

  /** 碎片朝玩家那一侧的白色短弧,120ms 淡出。fx.ts 没有现成的"弧线"方法,
   * 这类一次性的自定义几何表现直接在 PlayScene 里用 Phaser 原生图形对象画。 */
  private grazeArc(h: Phaser.Physics.Arcade.Image, playerX: number, playerY: number): void {
    const angleDeg = Phaser.Math.RadToDeg(Phaser.Math.Angle.Between(h.x, h.y, playerX, playerY));
    const radius = HAZARD.radius + GRAZE.arcRadiusGap;

    const arc = this.add.arc(h.x, h.y, radius, angleDeg - GRAZE.arcHalfSpanDeg, angleDeg + GRAZE.arcHalfSpanDeg, false, 0xffffff, 0);
    arc.closePath = false; // 只要弧线本身,不要闭合成扇形
    arc.setStrokeStyle(GRAZE.arcStrokeWidth, 0xffffff, 1).setDepth(40);

    this.tweens.add({
      targets: arc,
      alpha: 0,
      duration: GRAZE.arcFadeMs,
      onComplete: () => arc.destroy(),
    });
  }

  /** 擦边补能反馈:小蓝光从碎片边缘被吸回玩家,不加文字、不占 HUD。 */
  private grazeChargeFleck(fromX: number, fromY: number, toX: number, toY: number): void {
    const fleck = this.add
      .image(fromX, fromY, 'tex-mote')
      .setScale(GRAZE.chargeFleckScale)
      .setAlpha(0.85)
      .setDepth(95);

    this.tweens.add({
      targets: fleck,
      x: toX,
      y: toY,
      scale: 0.08,
      alpha: 0,
      duration: GRAZE.chargeFleckMs,
      ease: 'Cubic.In',
      onComplete: () => fleck.destroy(),
    });
  }

  /**
   * 冲击波编排。四段各一眼:查询 → 改状态 → 表现 → 平台信号。
   * 这是这个文件里唯一还处理"玩法逻辑"的地方,其余全是装配和调度。
   */
  private onPulse(): void {
    if (this.phase !== 'playing' || !this.state.pulseReady) {
      return;
    }

    const { x, y } = this.player.position;
    const radius = this.state.pulseRadius;
    const pulsePowerRatio = this.state.pulsePowerRatio;
    const hit = this.hazards.collectWithin(x, y, radius); // 查询
    const gained = this.state.spendPulse(hit.length); // 改状态
    this.tutorialPulsesFired += 1;

    audio.pulse();
    this.fx.shockwave(x, y, radius); // 表现:主环
    this.secondaryRing(x, y, radius); // 表现:延迟的第二圈环,线宽/alpha 减半
    this.fx.burst(x, y, THEME.entity.pulse, 2 + Math.round(pulsePowerRatio * 4));

    if (gained > 0) {
      this.fx.floatText(x, y - u(48), `+${gained}`, THEME.entity.pulse);
    }

    // 命中够多才有"重量感":hitstop 只在清一大片时触发,震屏强度按命中数
    // 插值但封顶(见 tuning.ts PULSE.shakeCapIntensity,低于 FEEL 硬上限)。
    if (hit.length >= PULSE.hitstopMinCount) {
      feel.hitstop(this, PULSE.hitstopMs);
    }
    feel.shake(this, PULSE.shakeDurationMs, (Math.min(hit.length, PULSE.shakeCapCount) / PULSE.shakeCapCount) * PULSE.shakeCapIntensity);
    this.zoomPunch();

    // 错峰清场:把"数量"变成可听可见的节奏,而不是一帧闪一下没了。
    this.staggeredClear(hit, x, y);

    // 一次清掉一大片 = 玩家爽到了。平台用这个信号优化广告时机和推荐权重。
    if (hit.length >= PULSE.happyTimeThreshold) {
      platform().happyTime(); // 平台信号
    }
  }

  /** 第二圈冲击波环,延迟 ring2DelayMs 才出现,线宽/alpha 减半,叠加出"双环"的层次感。 */
  private secondaryRing(x: number, y: number, radius: number): void {
    this.time.delayedCall(PULSE.ring2DelayMs, () => {
      const ring = this.add.circle(x, y, PULSE.ring2StartRadius).setDepth(50);
      ring.setStrokeStyle(PULSE.ring2StrokeWidth, THEME.entity.pulse, PULSE.ring2StartAlpha);
      this.tweens.add({
        targets: ring,
        radius,
        alpha: 0,
        duration: 380,
        ease: 'Cubic.Out',
        onComplete: () => ring.destroy(),
      });
    });
  }

  /** 只向上不向下的 zoom punch —— FIT 缩放下 zoom < 1 会露出世界外的黑边。 */
  /**
   * 镜头轻推。只向上推(≤1.02)再弹回 1,**绝不推到小于 1** ——
   * Scale.FIT 模式下 zoom < 1 会把世界边界外的黑边露出来。
   *
   * ⚠️ **缓动名必须写 `'Sine.easeOut'` 这种全称,不能写 `'Sine.Out'`。**
   *
   * 这是一个真机才能发现的坑:Tween 和相机效果对缓动名的容错程度完全不同。
   *   - Tween 走 `GetEaseFunction`,有字符串纠错分支:
   *     `'Cubic.Out'` → 拆出 `.Out` → 转成 `easeOut` → 命中 `'Cubic.easeOut'`
   *   - 相机效果(`cameras/2d/effects/Zoom.js` 的 `start`)**直接查 EaseMap**,
   *     没有任何纠错:`EaseMap.hasOwnProperty(ease)` 不命中就什么都不做,
   *     `this.ease` 保持 undefined,**下一帧调用它直接抛
   *     `TypeError: this.ease is not a function`,整个游戏循环当场死掉**。
   *
   * 所以同一个 `'Sine.Out'` 在 tween 里完全正常,在 zoomTo 里是致命的。
   * 类型检查看不见(参数类型就是 string)、构建看不见、29 个单测也看不见 ——
   * 这个 bug 是真人按下空格才暴露出来的。
   */
  private zoomPunch(): void {
    this.cameras.main.zoomTo(PULSE.zoomPunchScale, PULSE.zoomPunchMs, 'Sine.easeOut', true, (_cam, progress) => {
      if (progress === 1) {
        this.cameras.main.zoomTo(1, PULSE.zoomPunchMs, 'Sine.easeIn');
      }
    });
  }

  /**
   * 错峰清场:按到 origin 的距离排序,第 i 个延迟 `i × PULSE.clearStaggerMs`
   * 才执行"粒子 + 缩到 0 + 回收",同一个延迟点播 `audio.pulseHit(i)`
   * (上行琶音)。命中的碎片立即 disableBody(不带 hide 参数)停止移动和碰撞
   * (否则清场这段时间里它们还能撞死玩家),但保持可见,直到各自的延迟点才
   * 真正被回收 —— 这样"波扫过去"才有先后顺序,而不是同一帧全部消失。
   *
   * onPulse(冲击波命中)和 revive(复活清场,不给分)共用这一套表现。
   */
  private staggeredClear(hazardsToClear: Phaser.Physics.Arcade.Image[], originX: number, originY: number): void {
    const sorted = [...hazardsToClear].sort(
      (a, b) =>
        Phaser.Math.Distance.Between(originX, originY, a.x, a.y) -
        Phaser.Math.Distance.Between(originX, originY, b.x, b.y),
    );

    for (const h of sorted) {
      h.disableBody(false, false);
    }

    sorted.forEach((h, i) => {
      this.time.delayedCall(i * PULSE.clearStaggerMs, () => {
        this.fx.burst(h.x, h.y, THEME.entity.hazard);
        audio.pulseHit(i);
        this.tweens.add({
          targets: h,
          scale: 0,
          duration: PULSE.clearShrinkMs,
          onComplete: () => this.hazards.despawn(h),
        });
      });
    });
  }

  // ---------------------------------------------------------------- 碰撞

  private onCollectMote: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, moteObj) => {
    const mote = moteObj as Phaser.Physics.Arcade.Image;
    if (!mote.active) return;

    const moteX = mote.x;
    const moteY = mote.y;
    const { x: playerX, y: playerY } = this.player.position;

    this.motes.despawn(mote);
    this.state.collectMote();
    this.tutorialMotesCollected += 1;
    audio.collect(this.state.combo);
    this.fx.burst(moteX, moteY, THEME.entity.mote);
    this.chargeFlightParticle(moteX, moteY, playerX, playerY);

    // 用"当前分 / 历史最高分"近似进度,给平台一个能读的完成度
    if (this.state.best > 0) {
      platform().reportProgress((this.state.score / this.state.best) * 100);
    }
  };

  /**
   * 充能飞行粒子:从 mote 位置飞一颗缩小的 mote 贴图到玩家位置,260ms
   * Cubic.In。把"蓝点 → 充能"这条因果关系变成一条肉眼可见的抛物线,
   * 比任何文字提示都直接,而且天然多语言、不用读字。
   */
  private chargeFlightParticle(fromX: number, fromY: number, toX: number, toY: number): void {
    const particle = this.add.image(fromX, fromY, 'tex-mote').setScale(0.5).setDepth(95);
    this.tweens.add({
      targets: particle,
      x: toX,
      y: toY,
      scale: 0.15,
      duration: 260,
      ease: 'Cubic.In',
      onComplete: () => particle.destroy(),
    });
  }

  private onHitHazard: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, hazardObj) => {
    if (this.phase === 'resolving') return;
    this.handleDeath(hazardObj as Phaser.Physics.Arcade.Image);
  };

  /**
   * 死亡反馈序列。全部用绝对时间戳(`this.time.now`)编排各阶段,不用
   * `delayedCall` —— 理由见 `effects/feel.ts` 文件头注释第 3 条,以及
   * `tuning.ts` 里 `DEATH` 常量块的说明。timeScale 的实际操作复用
   * `feel.slowMo`(它内部已经用同一套"未缩放绝对时间戳"机制自我恢复);
   * 这里只需要自己的 `scheduleAt` 来编排"第二阶段何时开始""整个序列何时
   * 结束"这两个 feel.ts 没有现成 API 覆盖的时间点。
   */
  private handleDeath(killer: Phaser.Physics.Arcade.Image): void {
    this.phase = 'resolving';
    this.updateTouchPulseButton();
    this.state.resetCombo();
    platform().gameplayStop();

    const t0 = this.time.now;
    const { x: px, y: py } = this.player.position;
    const cx = (px + killer.x) / 2;
    const cy = (py + killer.y) / 2;

    audio.death();

    // t=0:近似定格(feel.slowMo 把 timeScale 拉到接近冻结,而不是
    // physics.pause() 硬停 —— 这样才能在 hitstopMs 之后无缝滑进慢动作,
    // 而不是一次性硬切)。
    feel.slowMo(this, DEATH.hitstopPhysicsScale, DEATH.hitstopTweenScale, DEATH.hitstopMs);

    // t=0:碰撞点扩张白环
    const ring = this.add.circle(cx, cy, DEATH.ringStartRadius).setDepth(60);
    ring.setStrokeStyle(DEATH.ringStrokeWidth, 0xffffff, 1);
    this.tweens.add({
      targets: ring,
      radius: DEATH.ringEndRadius,
      alpha: 0,
      duration: DEATH.ringDurationMs,
      ease: 'Quad.Out',
      onComplete: () => ring.destroy(),
    });

    // t=0:全屏红色 vignette
    const vignette = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, THEME.entity.hazard, DEATH.vignetteAlpha)
      .setDepth(59);
    this.tweens.add({
      targets: vignette,
      alpha: 0,
      duration: DEATH.vignetteDurationMs,
      onComplete: () => vignette.destroy(),
    });

    this.scheduleAt(t0 + DEATH.hitstopMs, () => {
      // t=140ms:解除近似定格,进入慢动作
      feel.slowMo(this, DEATH.slowMoPhysicsScale, DEATH.slowMoTweenScale, DEATH.slowMoMs);
      feel.shake(this, DEATH.shakeMs, DEATH.shakeIntensity);
      this.dimAllExcept(killer);
      this.explodePlayer(px, py);
    });

    this.scheduleAt(t0 + DEATH.hitstopMs + DEATH.slowMoMs, () => {
      // t=560ms:整段死亡序列演完,进入复活询问或直接结算
      void this.afterDeath();
    });
  }

  /** 用未缩放的 `scene.time.now` 轮询,不受 physics/tween 的 timeScale 影响 ——
   * 和 `feel.ts` 内部 `afterUnscaledDelay` 完全同一套模式,理由见该文件头注释。 */
  private scheduleAt(atMs: number, run: () => void): void {
    const cleanup = (): void => {
      this.events.off(Phaser.Scenes.Events.UPDATE, tick);
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    };
    const tick = (): void => {
      if (this.time.now < atMs) {
        return;
      }
      cleanup();
      run();
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, tick);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  }

  /** 除 killer 外所有 hazard/mote 变暗,killer 保持全亮 + 白色 tint ——
   * 这一条就是"我为什么死"的全部答案:屏幕上只有一个东西是亮的。 */
  private dimAllExcept(killer: Phaser.Physics.Arcade.Image): void {
    // 一个 Tween 驱动一组 targets,不要每个对象各建一个。
    //
    // 这里是全局单帧分配的尖峰位置:后期同屏可到 ~27 个实体,逐个 add 就是 27 个
    // Tween 对象(每个还带自己的 TweenData 数组和 easing 引用)。而它发生的时刻
    // 正好是 hitstop 解除、玩家爆炸粒子生成、震屏同时触发的那一帧 ——
    // **玩家最想要丝滑的那一帧**,也是他决定要不要再来一局的那一帧。
    const targets = [...this.hazards.group.getChildren(), ...this.motes.group.getChildren()].filter(
      (obj) => {
        const go = obj as Phaser.Physics.Arcade.Image;
        return go.active && go !== killer;
      },
    );

    if (targets.length > 0) {
      this.tweens.add({ targets, alpha: DEATH.dimAlpha, duration: DEATH.dimDurationMs });
    }

    killer.setTint(0xffffff).setAlpha(1);
  }

  /** 玩家球不隐藏,改成炸开:球体本身 scale/alpha 归零 + 一次性粒子迸溅。 */
  private explodePlayer(x: number, y: number): void {
    this.tweens.add({
      targets: this.player.sprite,
      scale: 0,
      alpha: 0,
      duration: DEATH.explodeDurationMs,
      ease: 'Back.In',
    });

    // 走 fx 的常驻 emitter,不要现建一个临时的。
    // 现建的那个既是一次运行时分配(死亡瞬间已经够忙了),
    // 它的粒子还不计入 FX.particleCap 的全局预算 —— 如果死亡恰好和
    // 一次没跑完的错峰清场重叠,同屏粒子会超过文档宣称的硬上限。
    this.fx.explode(x, y, THEME.entity.player, DEATH.explodeParticleCount);
  }

  private async afterDeath(): Promise<void> {
    // 每局只给一次复活机会。配额判断在 GameState(reviveUsed 私有化,外部
    // 只能读 canRevive);能不能放广告的能力检测在 ReviveFlow.offer() 内部。
    if (this.state.canRevive) {
      const revived = await this.reviveFlow.offer();
      if (revived) {
        this.revive();
        return;
      }
    }

    this.finishRun();
  }

  private revive(): void {
    // reviveUsed 私有化后只能通过 consumeRevive() 消耗
    this.state.consumeRevive();

    // 清场给玩家一个喘息窗口,否则复活即死,广告等于白看。复用错峰清场
    // 同一套表现(不给分),让玩家觉得那段广告换来的是一次真实的爆炸,
    // 而不是静默 destroy。
    const activeHazards = this.hazards.group
      .getChildren()
      .filter((obj) => (obj as Phaser.Physics.Arcade.Image).active) as Phaser.Physics.Arcade.Image[];
    this.staggeredClear(activeHazards, GAME_WIDTH / 2, GAME_HEIGHT / 2);

    // 死亡序列把除凶手外的所有实体 alpha 降到 dimAlpha。碎片在上面被全清了,
    // 复用时 spawnOne 会重置 alpha;**能量点不清场,也没有任何地方复位它们** ——
    // 不补这一段的话,复活后场上已有的能量点会一直半透明,直到 8 秒生存期
    // 自然过期。表现是"看着像渲染坏了",而且没有任何报错。
    this.motes.group.getChildren().forEach((obj) => {
      const mote = obj as Phaser.Physics.Arcade.Image;
      this.tweens.killTweensOf(mote);
      mote.setAlpha(1);
    });

    // 死亡序列里把玩家球 tween 到 scale 0 / alpha 0,respawnAtCenter() 只重置
    // 位置/可见性/alpha,不重置 scale —— 这里显式补上,否则复活后球会永远
    // 保持看不见的 scale 0。
    this.player.sprite.setScale(1);
    this.player.respawnAtCenter();

    this.bumpSpawnBuffer(RUN.reviveBufferMs);
    this.phase = 'playing';
    this.updateTouchPulseButton();

    platform().gameplayStart();
  }

  private finishRun(): void {
    const { isNewBest, runsPlayed, previousBest, maxCombo, grazes, motesCollected, pulsesFired, hazardsCleared } =
      this.state.finish();
    if (isNewBest) {
      platform().happyTime();
    }

    // 240ms 定格让震屏和爆炸演完,再交给 fadeToScene 的 200ms 淡出。
    // 原来是一次性 delayedCall(420) 硬切;直接套上 fade 会变成 620ms,玩家会觉得卡。
    this.time.delayedCall(DEATH_HOLD_MS, () => {
      const data: ResultData = {
        score: this.state.score,
        best: this.state.best,
        isNewBest,
        survivedSeconds: Math.floor(this.state.elapsedSeconds),
        runsPlayed,
        previousBest,
        maxCombo,
        grazes,
        motesCollected,
        pulsesFired,
        hazardsCleared,
      };
      fadeToScene(this, SCENES.Result, data);
    });
  }
}
