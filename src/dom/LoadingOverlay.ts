export class LoadingOverlay {
  private readonly root: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly enabled: boolean;

  constructor(enabled: boolean) {
    const root = document.getElementById('loading-overlay');
    const bar = document.getElementById('loading-bar');
    if (!root || !bar) {
      throw new Error('Loading overlay DOM is missing');
    }
    this.root = root;
    this.bar = bar;
    this.enabled = enabled;
  }

  start(): void {
    if (!this.enabled) {
      this.finish();
      return;
    }
    this.root.classList.remove('is-hidden');
    this.setProgress(0);
  }

  setProgress(ratio: number): void {
    const clamped = Math.max(0, Math.min(1, ratio));
    this.bar.style.width = `${Math.round(clamped * 100)}%`;
  }

  finish(): void {
    this.setProgress(1);
    window.setTimeout(() => this.root.classList.add('is-hidden'), 80);
  }
}

