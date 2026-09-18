import { SAVE_KEYS } from '../keys';
import { platform } from '../../platform';

/**
 * 用 WebAudio 振荡器 + 白噪声 buffer 合成音效,不加载任何音频文件。
 *
 * 这么做有三个实际好处:
 *   1. 零素材 = 零 license 风险,提交包里没有任何来源不明的资源;
 *   2. 包体几乎不增加,直接满足 CrazyGames 的初始下载体积要求;
 *   3. 正好给"响应平台静音开关"这件必做的事一个真实的验证目标。
 */

/** 白噪声 buffer 的时长。所有噪声类音效(≤350ms)都短于这个长度,不需要循环。 */
const NOISE_BUFFER_SECONDS = 0.5;

/** 所有音效包络的默认 attack,落在 5-8ms 区间,避免方波/锯齿波瞬时跳变产生的可闻 click。 */
const DEFAULT_ATTACK = 0.006;

/** collect() 音高随连击上行的基准频率(combo=1 时的频率)。 */
const COLLECT_BASE_FREQ = 660;

/** graze() 的基准频率,chain 每 +1 上行一个半音,封顶在 GRAZE_MAX_CHAIN。 */
const GRAZE_BASE_FREQ = 1400;
const GRAZE_MAX_CHAIN = 8;

/** pulseHit() 逐个命中的琶音基准频率。 */
const PULSE_HIT_BASE_FREQ = 520;

interface FilterSweep {
  type: BiquadFilterType;
  /** 起始(或恒定,当 toFreq 不传时)频率。 */
  freq: number;
  /** 结束频率。不传则该滤波器整段维持在 freq,不做扫频。 */
  toFreq?: number;
  q?: number;
}

interface ToneOptions {
  /** 起始(或恒定,当 toFreq 不传时)频率。 */
  freq: number;
  /** 结束频率。不传则振荡器整段维持在 freq。 */
  toFreq?: number;
  type: OscillatorType;
  /** 单位:秒。 */
  duration: number;
  peak: number;
  attack?: number;
  /** 相对当前时间延后播放,单位:秒。用于同一次调用内的多音符排列。 */
  delay?: number;
  filter?: FilterSweep;
}

interface NoiseOptions {
  duration: number;
  peak: number;
  attack?: number;
  delay?: number;
  filter: FilterSweep;
}

class AudioSystem {
  private ctx: AudioContext | null = null;

  /** 程序生成的白噪声 buffer,在 unlock() 里连同 AudioContext 一起创建并缓存。 */
  private noiseBuffer: AudioBuffer | null = null;

  /**
   * 静音有两个独立来源,必须分开存,不能用一个 boolean:
   *   platformMuted —— 平台外框的喇叭按钮(CrazyGames 提供,玩家在游戏外点)
   *   userMuted     —— 游戏内设置页的开关(只在平台不提供时才会有)
   *   adMuted       —— 广告播放期间的临时静音
   * 合成一个 boolean 就会出现"玩家在游戏内开了声音,把平台的静音覆盖掉"这种 bug。
   */
  private platformMuted = false;
  private userMuted = false;
  private adMuted = false;

  /**
   * 浏览器要求 AudioContext 必须在用户手势里创建/恢复。
   * iOS 尤其严格,CrazyGames 技术要求里也单独点名了这一条。
   */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    // 白噪声 buffer 只需要生成一次,和 ctx 的生命周期绑定,unlock() 可能被多处调用。
    if (!this.noiseBuffer) {
      const buffer = this.ctx.createBuffer(
        1,
        Math.ceil(this.ctx.sampleRate * NOISE_BUFFER_SECONDS),
        this.ctx.sampleRate
      );
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
  }

  /** 接平台静音开关。CrazyGames 播放器外框上的喇叭按钮就是走这条路径。 */
  bindPlatformSettings(): void {
    const adapter = platform();
    this.platformMuted = adapter.getSettings().muteAudio;
    adapter.onSettingsChange((settings) => {
      this.platformMuted = settings.muteAudio;
    });

    // 玩家自己的静音偏好要持久化,否则每次重开都要再关一次
    if (!adapter.capabilities.platformProvidesAudioToggle) {
      this.userMuted = adapter.load(SAVE_KEYS.userMuted) === '1';
    }
  }

  /** 设置页的开关。只在平台不提供静音时才会被调用。 */
  toggleUserMuted(): boolean {
    this.userMuted = !this.userMuted;
    platform().save(SAVE_KEYS.userMuted, this.userMuted ? '1' : '0');
    return this.userMuted;
  }

  get isUserMuted(): boolean {
    return this.userMuted;
  }

  /** 广告期间临时静音。官方要求广告开始时游戏必须静音。 */
  setAdMuted(muted: boolean): void {
    this.adMuted = muted;
  }

  /** 任意一个来源要求静音,就静音。 */
  get isMuted(): boolean {
    return this.platformMuted || this.userMuted || this.adMuted;
  }

  /** 吃到能量点。combo 越高音高越上行,比数字更直接的正反馈。 */
  collect(combo = 1): void {
    const ctx = this.playableContext();
    if (!ctx) return;

    const f0 = COLLECT_BASE_FREQ * Math.pow(2, (combo - 1) / 12);
    this.tone(ctx, { freq: f0, type: 'triangle', duration: 0.09, peak: 0.18, attack: 0.008 });
    // 第二路泛音,压低音量给主音"加厚",不喧宾夺主。
    this.tone(ctx, { freq: f0 * 2, type: 'triangle', duration: 0.09, peak: 0.05, attack: 0.008 });
  }

  /** 擦边碎片但没死。一局要响几百次,必须压到几乎是"沙沙"的存在感。 */
  graze(chain: number): void {
    const ctx = this.playableContext();
    if (!ctx) return;

    const freq = GRAZE_BASE_FREQ * Math.pow(2, Math.min(chain, GRAZE_MAX_CHAIN) / 12);
    this.tone(ctx, { freq, type: 'square', duration: 0.035, peak: 0.05, attack: 0.003 });
  }

  /** 充能条满了。玩家"可以放技能了"这件事唯一的听觉入口。 */
  chargeFull(): void {
    const ctx = this.playableContext();
    if (!ctx) return;

    const interval = 0.07;
    [880, 1320].forEach((freq, i) => {
      this.tone(ctx, { freq, type: 'sine', duration: 0.09, peak: 0.12, attack: 0.006, delay: i * interval });
    });
  }

  /** 冲击波释放。三路叠加:低频 thud(重量)+ 锯齿扫频(释放感)+ 噪声 whoosh(风声)。 */
  pulse(): void {
    const ctx = this.playableContext();
    if (!ctx) return;

    this.tone(ctx, { freq: 140, toFreq: 46, type: 'sine', duration: 0.3, peak: 0.3, attack: 0.006 });
    this.tone(ctx, {
      freq: 200,
      toFreq: 1100,
      type: 'sawtooth',
      duration: 0.22,
      peak: 0.14,
      attack: 0.005,
      filter: { type: 'lowpass', freq: 1800 },
    });
    this.noise(ctx, {
      duration: 0.26,
      peak: 0.1,
      filter: { type: 'bandpass', freq: 400, toFreq: 3000, q: 2 },
    });
  }

  /** 冲击波逐个命中碎片时的上行琶音,index 是本次冲击波内的命中序号(0 开始)。 */
  pulseHit(index: number): void {
    const ctx = this.playableContext();
    if (!ctx) return;

    const freq = PULSE_HIT_BASE_FREQ * Math.pow(2, index / 12);
    this.tone(ctx, { freq, type: 'square', duration: 0.035, peak: 0.07, attack: 0.003 });
  }

  /** 死亡。三路叠加:方波 crack(啪)+ 下坠 body + 噪声 crunch。 */
  death(): void {
    const ctx = this.playableContext();
    if (!ctx) return;

    this.tone(ctx, { freq: 1400, type: 'square', duration: 0.035, peak: 0.14, attack: 0.002 });
    this.tone(ctx, { freq: 160, toFreq: 40, type: 'sine', duration: 0.55, peak: 0.32, attack: 0.006 });
    this.noise(ctx, {
      duration: 0.35,
      peak: 0.16,
      filter: { type: 'lowpass', freq: 1200, toFreq: 300 },
    });
  }

  /** 结算页破纪录。三音上行,比 collect() 更庄重、更长。 */
  newBest(): void {
    const ctx = this.playableContext();
    if (!ctx) return;

    const interval = 0.09;
    [660, 880, 1320].forEach((freq, i) => {
      this.tone(ctx, { freq, type: 'triangle', duration: 0.14, peak: 0.16, attack: 0.006, delay: i * interval });
    });
  }

  /** 结算页滚分期间的计数音,每滴答一次触发一次。 */
  countTick(): void {
    const ctx = this.playableContext();
    if (!ctx) return;

    this.tone(ctx, { freq: 1200, type: 'sine', duration: 0.02, peak: 0.04, attack: 0.002 });
  }

  /** 按钮 hover。 */
  uiHover(): void {
    const ctx = this.playableContext();
    if (!ctx) return;

    this.tone(ctx, { freq: 520, type: 'sine', duration: 0.03, peak: 0.05, attack: 0.003 });
  }

  uiClick(): void {
    const ctx = this.playableContext();
    if (!ctx) return;

    this.tone(ctx, { freq: 440, type: 'square', duration: 0.05, peak: 0.12, attack: 0.005 });
  }

  /** 单个振荡器音符,可选频率扫频、可选串联一个滤波器。 */
  private tone(ctx: AudioContext, opts: ToneOptions): void {
    const attack = opts.attack ?? DEFAULT_ATTACK;
    const delay = opts.delay ?? 0;
    const t0 = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    osc.type = opts.type;
    if (opts.toFreq !== undefined) {
      osc.frequency.setValueAtTime(opts.freq, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.toFreq), t0 + opts.duration);
    } else {
      osc.frequency.setValueAtTime(opts.freq, t0);
    }

    const env = this.envelope(ctx, t0, opts.peak, attack, opts.duration);

    let output: AudioNode = osc;
    if (opts.filter) {
      output = this.connectFilter(ctx, osc, t0, opts.duration, opts.filter);
    }
    output.connect(env).connect(ctx.destination);

    osc.start(t0);
    osc.stop(t0 + opts.duration);
  }

  /** 白噪声 buffer 过一个滤波器,做打击/摩擦类音色。噪声 buffer 必须已在 unlock() 里生成。 */
  private noise(ctx: AudioContext, opts: NoiseOptions): void {
    if (!this.noiseBuffer) {
      throw new Error('noise buffer 尚未生成,必须先调用 unlock()');
    }

    const attack = opts.attack ?? DEFAULT_ATTACK;
    const delay = opts.delay ?? 0;
    const t0 = ctx.currentTime + delay;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const env = this.envelope(ctx, t0, opts.peak, attack, opts.duration);
    const output = this.connectFilter(ctx, src, t0, opts.duration, opts.filter);
    output.connect(env).connect(ctx.destination);

    src.start(t0);
    src.stop(t0 + opts.duration);
  }

  /** 把 source 接进一个 BiquadFilter(可选恒定频率或扫频),返回滤波器节点供继续连线。 */
  private connectFilter(
    ctx: AudioContext,
    source: AudioNode,
    t0: number,
    duration: number,
    filter: FilterSweep
  ): AudioNode {
    const node = ctx.createBiquadFilter();
    node.type = filter.type;
    if (filter.q !== undefined) {
      node.Q.value = filter.q;
    }
    if (filter.toFreq !== undefined) {
      node.frequency.setValueAtTime(filter.freq, t0);
      node.frequency.exponentialRampToValueAtTime(Math.max(1, filter.toFreq), t0 + duration);
    } else {
      node.frequency.setValueAtTime(filter.freq, t0);
    }
    source.connect(node);
    return node;
  }

  /**
   * 统一的增益包络:5-8ms attack 再指数升到 peak,避免方波/锯齿波瞬时跳变的可闻 click,
   * 结束前指数衰减回 0.0001(WebAudio 的 exponentialRamp 不允许目标值为 0)。
   */
  private envelope(ctx: AudioContext, t0: number, peak: number, attack: number, duration: number): GainNode {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    return env;
  }

  /** 静音或还没解锁时返回 null —— 这是"不该发声"的正常状态,不是错误。 */
  private playableContext(): AudioContext | null {
    if (this.isMuted || !this.ctx || this.ctx.state !== 'running') {
      return null;
    }
    return this.ctx;
  }
}

export const audio = new AudioSystem();
