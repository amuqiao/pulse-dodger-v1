import { platform } from '../../platform';

class AudioController {
  private context: AudioContext | null = null;
  private platformMuted = false;
  private adMuted = false;

  get muted(): boolean {
    return this.platformMuted || this.adMuted;
  }

  bindPlatformSettings(): void {
    const adapter = platform();
    this.platformMuted = adapter.getSettings().muteAudio;
    adapter.onSettingsChange((settings) => {
      this.platformMuted = settings.muteAudio;
    });
  }

  setAdMuted(muted: boolean): void {
    this.adMuted = muted;
  }

  blip(frequency: number, durationMs = 80): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = frequency;
    osc.type = 'triangle';
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000);
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
    return this.context;
  }
}

export const audio = new AudioController();

