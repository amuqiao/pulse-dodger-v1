import { u } from './viewport';

/**
 * 主题层 —— 换皮时**只改这个文件**。
 *
 * 这里放的全部是"视觉决策":颜色、字号、面板样式、文案。
 * 玩法数值(速度、分数、充能量)在 tuning.ts,画布尺寸和单位换算在 viewport.ts。
 *
 * 这条切分线是整个模板可复用性的关键:
 *   tuning.ts   = 游戏是什么     → 换玩法时改
 *   theme.ts   = 游戏长什么样   → 换皮时改
 * 混在一起的话,换个配色要小心绕开数值,换个难度要小心绕开颜色。
 */

export const THEME = {
  name: 'neon-dark',

  /** 画布与遮罩 */
  bg: 0x080b14,
  bgAccent: 0x121a2e,
  overlayFill: 0x0f172a,
  overlayAlpha: 0.94,
  scrimFill: 0x000000,
  scrimAlpha: 0.62,

  /** 三种实体的颜色 */
  entity: {
    player: 0x5eead4,
    playerGlow: 0x14b8a6,
    hazard: 0xf43f5e,
    hazardGlow: 0x7f1d3a,
    mote: 0x38bdf8,
    moteGlow: 0x0c4a6e,
    pulse: 0xfacc15,
  },

  /** 文字颜色,CSS 字符串形式(Phaser 文本对象要的是字符串) */
  text: {
    primary: '#e2e8f0',
    dim: '#64748b',
    accent: '#5eead4',
    warning: '#facc15',
    onAccent: '#0f172a',
  },

  /**
   * 字号刻度(type scale)。写的是设计单位,u() 换算成实际像素。
   * 各场景只许引用这里的名字,不许自己写 '24px' —— 那就是 magic number。
   */
  font: {
    title: `${u(62)}px`,
    heading: `${u(52)}px`,
    score: `${u(86)}px`,
    hudScore: `${u(40)}px`,
    button: `${u(28)}px`,
    body: `${u(18)}px`,
    /** 小字下限。设计单位 15px,在平台最小 iframe(800×450)下实际显示约 12.5px,仍可读 */
    small: `${u(15)}px`,
  },

  /**
   * 间距刻度(spacing scale)。相当于前端的 --space-*。
   * 布局里不许出现裸数字,一律引用这里的名字。
   */
  space: {
    xs: u(8),
    sm: u(16),
    md: u(24),
    lg: u(40),
    xl: u(64),
  },

  /**
   * 纵向锚点。**写成画布高度的比例,不是绝对像素。**
   *
   * 这是让"改分辨率只改一个数"成立的关键:比例不随分辨率变化,
   * 所以 GAME_HEIGHT 从 540 变成 1080 时,布局代码一行都不用动。
   *
   * 各场景按语义取用,而不是各写各的坐标 —— 这样几个页面的
   * 标题、主按钮、页脚会自动对齐在同一高度上。
   */
  anchor: {
    heading: 0.21,      // 次级页面的标题(结算、设置)
    title: 0.26,        // 主页大标题
    lead: 0.36,         // 副标题 / 大分数
    meta: 0.46,         // 次要信息(存活时间、破纪录进度条)
    /** 状态卡片(主页最高分卡)。夹在 meta 和 action 之间,单独留一档,
     * 不和 meta 共用同一行,避免"大分数/进度条"和"最高分卡"挤在一起。 */
    stats: 0.55,
    action: 0.63,       // 主操作按钮
    subAction: 0.76,    // 次要操作按钮
    footer: 0.92,       // 页脚提示
  },

  /** 按钮样式 */
  button: {
    paddingX: u(28),
    paddingY: u(14),
    primaryBg: '#5eead4',
    primaryText: '#0f172a',
    warningBg: '#facc15',
    warningText: '#0f172a',
    ghostBg: '#1e293b',
    ghostText: '#e2e8f0',
  },

  /**
   * 按钮交互状态机的手感参数(见 ui/Button.ts)。
   * 三态:idle / hover / press,四处(Panel、MenuScene、
   * SettingsScene)共用同一份数值,不许各处各调各的。
   */
  buttonState: {
    hoverScale: 1.04,
    hoverMs: 90,
    pressScale: 0.96,
    pressMs: 60,
    /** 悬停时底色提亮的百分比(0-1),换算成 Phaser.Display.Color.brighten() 的 0-100 参数 */
    hoverBrighten: 0.12,
    /** 保留字段,当前没有按钮实现禁用态(Button.ts 已删掉未被使用的 setDisabled()) */
    disabledAlpha: 0.45,
  },

  /** 面板 */
  panel: {
    strokeWidth: 2,
    cornerRadius: u(10),
    defaultWidth: u(420),
    /** 排版参数:标题区高度 / 副标题行高 / 按钮行距 / 底部留白,全是设计单位 */
    headerHeight: u(82),
    subtitleHeight: u(34),
    buttonRow: u(56),
    bottomPadding: u(24),
    buttonWidthInset: u(120),
  },

  /**
   * HUD 充能条。玩家身上的 PlayerRing 才是充能的主要显示,这里只是
   * 余光里的冗余指示,所以矮一截、透明一档。
   */
  chargeBar: {
    width: u(220),
    height: u(7),
    radius: u(6),
    /** 距画布顶部的距离,设计单位 */
    top: u(58),
    trackFill: 0x1e293b,
    alpha: 0.6,
  },

  /**
   * 玩家身上的充能环 + 冲击波范围预览(见 ui/PlayerRing.ts)。
   * 躲避游戏玩家视线锁在自己身上,把充能状态搬到玩家周围而不是屏幕角落。
   */
  pulsePreview: {
    /** 满充能预览圈线宽 */
    ringWidth: u(2),
    /** inRangeCount 达到 happyTime 阈值时线宽升级 */
    ringWidthHappy: u(4),
    ringAlpha: 0.18,
    ringAlphaHappy: 0.28,
    /** 充能弧距玩家半径的间隙 */
    chargeRingGap: u(9),
    chargeRingWidth: u(3),
    trackAlpha: 0.25,
    /** 满充能常驻预览圈的呼吸周期(ms),配 Math.sin(now / breathMs) */
    breathMs: 1400,
    breathAmount: 0.06,
    /** playReadyBurst 扩张动画时长 */
    readyExpandMs: 280,
    /** 充能弧阻尼跟随系数,每 16.667ms 向目标靠拢的比例 */
    damping: 0.22,
  },

  /** 顶边难度进度条(见 ui/RunTimeline.ts) */
  timeline: {
    height: u(3),
    alpha: 0.4,
    markWidth: u(2),
    markBlinkMs: 220,
  },

  /** 连击显示(见 ui/Hud.ts) */
  combo: {
    colorLow: 0x38bdf8,
    colorHigh: 0xfacc15,
    barWidth: u(64),
    barHeight: u(2),
  },

  /** 数值变化的反馈动效参数(分数 pop 等) */
  feedback: {
    scorePopScale: 1.18,
    scorePopMs: 120,
  },

  /** 星空背景密度 */
  starfield: {
    count: 60,
    minRadius: u(1),
    maxRadius: u(3),
    alpha: 0.55,
  },

  /** 所有面向玩家的文案。做多语言时把这一块换成 i18n 查表即可 */
  copy: {
    gameTitle: 'PULSE DODGER',
    tagline: 'Dodge red shards · collect blue energy · unleash a pulse',
    controls: 'Move with mouse or touch · click or press Space to pulse · Esc to pause',
    /** 主页操作按钮文案。以前这里是"点击任意位置开始"配一段非交互的闪烁文字,
     * 全屏任意位置的 pointerdown 才是真正的触发源;现在按钮本身就是唯一的
     * 交互入口(见 MenuScene 的按钮状态机改造),文案要换成对应这个按钮的动作。 */
    startGame: 'START',
    bestScore: 'BEST',
    settings: 'SETTINGS',
    pulseReady: 'PULSE READY - CLICK / SPACE',
    pauseGlyph: 'II',
    paused: 'PAUSED',
    resume: 'RESUME',
    quitToMenu: 'MENU',
    autoPausedHint: 'Auto-paused while the window is inactive',
    gameOver: 'GAME OVER',
    newBest: 'NEW BEST!',
    playAgain: 'PLAY AGAIN',
    reviveTitle: 'Watch an ad to revive',
    reviveButton: 'REVIVE',
    reviveCountdown: (n: number) => `Results in ${n}s`,
    survivedFor: (s: number, best: number) => `Survived ${s}s  ·  Best ${best}`,
    resultTip: 'Tip: a wider ring pays better, but waiting longer is the risk',
    loading: 'Loading',
    soundOn: 'Sound: On',
    soundOff: 'Sound: Off',
    back: 'BACK',
    settingsEmptyHint: 'Audio is controlled by this platform',

    /** 主页教学图例(用实际游戏贴图建立颜色映射,不依赖玩家读字) */
    legendDodge: 'DODGE',
    legendEat: 'COLLECT',
    legendClear: 'PULSE',

    /**
     * 主页页脚提示,拆成片段是因为"空格"和"ESC"两个词要单独包一层
     * 键帽样式的小方块(ghostBg 底),不能再当一整句纯文本画。
     */
    footerHint: {
      before: 'Move with mouse or touch ·',
      spaceKey: 'SPACE',
      middle: 'or click to pulse ·',
      escKey: 'ESC',
      after: 'pause',
    },

    /**
     * 破纪录进度条文案。
     *
     * `isNewBest` 时 `ResultData.best` 已经是「结算后写回存档的新值」,
     * 和本局 `score` 相等(见 core/GameState.ts `finish()`)——光靠 `best`
     * 和 `score` 算不出"超出纪录多少分",所以 `ResultData` 额外带了
     * `previousBest`(破纪录之前的旧最高分),`overBest` 用
     * `score - previousBest` 算出精确数字(见 ResultScene.createRecordBarCaption);
     * `previousBest` 为 0(首次破纪录,之前从没打过)时没有数字可比,
     * 才退回 `recordBroken` 这句不带数字的庆祝文案。
     */
    recordBroken: 'Record broken!',
    overBest: (n: number) => `${n} over best`,
    gapToBest: (n: number) => `${n} to best`,

    /** 连击倍率标签(HUD,分数正下方) */
    comboLabel: (n: number) => `x${n}`,

    /** 首局内嵌引导文案(见 ui/Tutorial.ts) */
    tutMove: 'Move to dodge',
    tutMoveTouch: 'Drag to move',
    tutCollect: 'Collect blue motes',
    tutCharge: 'Collect 3 motes to arm pulse',
    tutPulseMouse: 'Click to cash out',
    tutPulseKey: 'Press Space',
    tutPulseTouch: 'Tap to pulse',
  },
} as const;
