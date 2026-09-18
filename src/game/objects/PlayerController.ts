import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../viewport';
import { PLAYER, RUN, TOUCH_OFFSET_Y } from '../tuning';

/** 60Hz 下一帧的毫秒数,用作帧率补偿的基准 */
const FRAME_MS_60 = 1000 / 60;

/**
 * PlayerController 需要的外部依赖,由 PlayScene 注入(风格照抄
 * `overlays/PauseController.ts` 的 hooks 写法)。
 */
export interface PlayerControllerHooks {
  /** 玩家表达了"我要放冲击波"的意图(鼠标点击 / 触屏第二根手指)。
   * 键盘 SPACE 不走这个 hook —— 见下方类注释。 */
  onPulseInput(): void;
}

/**
 * system 不许 import GameState —— system 只接受入参、返回结果,把结果写回
 * GameState 是 PlayScene 的事。这条规则买到三样:system 可以脱离 GameState
 * 单独推演;"谁改了分数"永远只有一个答案;不需要事件总线。
 *
 * **刻意不把"读输入"和"移动角色"拆成 InputSystem + PlayerSystem 两层。**
 * 躲避类游戏里输入就是位移 —— 鼠标/触屏的每一次移动事件唯一要做的事就是
 * 更新跟随目标,再由同一帧的位移逻辑去追;拆开的话,两个类之间除了传一个
 * `{x, y}` 之类的 DTO 之外没有任何独立可测/可复用的价值,纯粹是为了分层而
 * 分层。这不是漏做,是看过需求后的选择——如果哪天这款游戏加了"多角色轮流
 * 控制"或"输入要录像回放"这类真正需要"输入"和"位移"分离演化的需求,
 * 再拆不迟。
 *
 * 键盘 SPACE 触发冲击波也不在这里处理:它不属于"移动输入的分流"(鼠标/
 * 触屏的移动和点击天然耦合,SPACE 和移动毫无关系),由 PlayScene 自己
 * 绑定 spaceKey 直接调用它自己的 onPulse(),没有必要为了"只有一个 hook"
 * 硬把一个无关的按键也塞进这个类。
 */
export class PlayerController {
  private readonly _sprite: Phaser.Physics.Arcade.Image;
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;

  /**
   * 跟随目标。只在 onPointerMove / onPointerDown 里更新,update() 只读它,
   * 不再每帧读 `scene.input.activePointer` —— activePointer 在场景刚创建时
   * 残留的是上一个场景最后一次点击的位置(比如 MenuScene "点击任意位置
   * 开始"的落点),会导致开局球自己飞;触屏上手指抬起后 activePointer 位置
   * 也不会变,球会一直黏在最后触摸点上。
   */
  private readonly followTarget = new Phaser.Math.Vector2();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: PlayerControllerHooks,
  ) {
    this._sprite = scene.physics.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'tex-player')
      .setCircle(PLAYER.radius, PLAYER.radius, PLAYER.radius);
    // 不设 setCollideWorldBounds(true):它表达了一个不成立的意图。玩家
    // 位置全程是在 update() 里直接写 sprite.x/y,从没走 velocity,Arcade
    // 物理的世界边界钳制只对 velocity 生效,这行代码从来没起过作用,留着
    // 只会误导后来者以为出界已经被挡住了。真正的边界钳制见 update()。

    this.followTarget.set(GAME_WIDTH / 2, GAME_HEIGHT / 2);

    this.cursors = scene.input.keyboard!.createCursorKeys();

    // 触屏玩家必须按住手指才能移动,如果冲击波也绑在同一根手指的
    // pointerdown 上,每次移动起手都会白白放掉一次冲击波 —— 手机上冲击波
    // 基本不可能在玩家真正想放的时候放出来。这里按输入类型分流,是两种
    // 一等公民的输入模式,不是兜底:
    //   - 鼠标(wasTouch === false):pointerdown 立即触发冲击波
    //   - 触屏:默认创建的 pointer1 是"第一根按下的手指" = move pointer,
    //     只用来更新 followTarget,永不触发冲击波;
    //     额外 addPointer(1) 出来的 pointer2 是"第二根手指",专门用来在
    //     任意位置触发冲击波。
    scene.input.addPointer(1);
    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
  }

  get position(): { x: number; y: number } {
    return { x: this._sprite.x, y: this._sprite.y };
  }

  get sprite(): Phaser.Physics.Arcade.Image {
    return this._sprite;
  }

  /**
   * 复活:挪回屏幕中心,闪烁提示玩家"刚刚复活了"。
   *
   * **这只是视觉提示,不是无敌判定** —— `onHitHazard` 在闪烁期间照常触发,
   * 撞上了照样死。真正的保护来自 `PlayScene.revive()` 的清场(复活时清空
   * 场上所有 hazard)加上 `RUN.reviveBufferMs` 这段生成缓冲窗(清场后
   * `reviveBufferMs` 内不再生成新的 hazard/mote)。闪烁总时长刻意对齐
   * `RUN.reviveBufferMs`,这样"看起来还在闪"和"清场缓冲窗还没过"这两件
   * 事同时结束,不会出现闪烁还没停、缓冲窗却已经过去,玩家在真实存在
   * 死亡风险的时段里误以为自己还处于安全期。
   */
  respawnAtCenter(): void {
    this._sprite.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2).setVisible(true).setAlpha(0.4);
    const halfCycleMs = 200;
    const cycles = Math.round(RUN.reviveBufferMs / (halfCycleMs * 2));
    this.scene.tweens.add({
      targets: this._sprite,
      alpha: 1,
      duration: halfCycleMs,
      yoyo: true,
      repeat: cycles - 1,
    });
  }

  update(delta: number): void {
    // 指针按下过或正在移动 -> 跟随指针;否则走键盘。两套输入并存,桌面和
    // 手机都能玩,这是 CrazyGames 技术要求里明确列的一条。
    const usingKeyboard =
      this.cursors.left.isDown || this.cursors.right.isDown || this.cursors.up.isDown || this.cursors.down.isDown;

    // 球心必须整个留在屏幕内,不能只钳制中心点 —— 钳中心点的话球心贴边时
    // 有半径那么多是在屏幕外,是可视上界破的。两个分支统一钳到
    // [PLAYER.radius, GAME_WIDTH/HEIGHT - PLAYER.radius]。
    const minX = PLAYER.radius;
    const maxX = GAME_WIDTH - PLAYER.radius;
    const minY = PLAYER.radius;
    const maxY = GAME_HEIGHT - PLAYER.radius;

    if (usingKeyboard) {
      const step = (PLAYER.keyboardSpeed * delta) / 1000;
      const dx = (this.cursors.right.isDown ? 1 : 0) - (this.cursors.left.isDown ? 1 : 0);
      const dy = (this.cursors.down.isDown ? 1 : 0) - (this.cursors.up.isDown ? 1 : 0);
      const len = Math.hypot(dx, dy) || 1;
      this._sprite.x = Phaser.Math.Clamp(this._sprite.x + (dx / len) * step, minX, maxX);
      this._sprite.y = Phaser.Math.Clamp(this._sprite.y + (dy / len) * step, minY, maxY);
      return;
    }

    // **帧率补偿**。直接每帧 lerp 固定比例会让 144Hz 显示器上的跟随速度
    // 快 2.4 倍、165Hz 快 2.75 倍 —— 等于不同硬件难度不同,
    // CrazyGames 明文要求 "physics must perform consistently across
    // different monitor refresh rates"。
    // 这里把"每帧 18%"换算成"每 16.667ms 18%",任何刷新率下手感一致。
    // followTarget 只在 onPointerMove/onPointerDown 里更新,不再每帧读
    // this.input.activePointer —— 场景刚创建时 activePointer 残留的是上一个
    // 场景最后一次点击的位置,会导致开局球自己飞;触屏抬手后 activePointer
    // 也不会变,球会一直黏在最后触摸点。
    const t = 1 - Math.pow(1 - PLAYER.followLerp, delta / FRAME_MS_60);
    const nextX = Phaser.Math.Linear(this._sprite.x, this.followTarget.x, t);
    const nextY = Phaser.Math.Linear(this._sprite.y, this.followTarget.y, t);
    this._sprite.x = Phaser.Math.Clamp(nextX, minX, maxX);
    this._sprite.y = Phaser.Math.Clamp(nextY, minY, maxY);
  }

  /**
   * 只有"move pointer"允许更新跟随目标:鼠标,或者触屏上第一根按下的手指
   * (默认创建的 pointer1)。额外 addPointer(1) 出来的 pointer2 专门留给
   * 触屏冲击波,它的移动不应该拖着球跑。
   */
  private isMovePointer(pointer: Phaser.Input.Pointer): boolean {
    return !pointer.wasTouch || pointer === this.scene.input.pointer1;
  }

  private updateFollowTarget(pointer: Phaser.Input.Pointer): void {
    const world = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    // 触屏专用的纵向偏移:球显示在手指上方,否则球会一直被手指本身盖住,
    // 这是移动端躲避类游戏的标准做法。鼠标不需要这个偏移。
    const offsetY = pointer.wasTouch ? TOUCH_OFFSET_Y : 0;
    this.followTarget.set(world.x, world.y + offsetY);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isMovePointer(pointer)) {
      return;
    }
    this.updateFollowTarget(pointer);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.isMovePointer(pointer)) {
      // 触屏第二根手指:只用来触发冲击波,不参与移动,避免和拖动手指打架
      this.hooks.onPulseInput();
      return;
    }

    this.updateFollowTarget(pointer);

    if (!pointer.wasTouch) {
      // 鼠标:pointerdown 立即触发冲击波,保持原有桌面手感
      this.hooks.onPulseInput();
    }
    // 触屏第一根手指(move pointer):只更新跟随目标,不触发冲击波 —— 触屏
    // 玩家必须按住才能移动,绑在这根手指上会导致每次移动起手都白白放掉
    // 一次冲击波。
  }
}
