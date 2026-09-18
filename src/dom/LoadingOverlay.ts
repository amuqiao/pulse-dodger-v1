export class LoadingOverlay {
  private readonly enabled: boolean;
  private root: HTMLElement | null = null;
  private showTimer: number | null = null;
  private shown = false;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  start(): void {
    if (!this.enabled) {
      return;
    }

    this.root = document.getElementById('loading-overlay');
    if (!this.root) {
      throw new Error('Loading overlay DOM is missing');
    }

    this.showTimer = window.setTimeout(() => {
      this.root!.hidden = false;
      this.shown = true;
      this.setProgress(0);
    }, 300);
  }

  setProgress(ratio: number): void {
    if (!this.shown || !this.root) {
      return;
    }

    const bar = this.root.querySelector<HTMLElement>('.loading-bar-fill');
    if (!bar) {
      throw new Error('Loading overlay progress bar is missing');
    }

    const clamped = Math.max(0, Math.min(1, ratio));
    bar.style.width = `${Math.round(clamped * 100)}%`;
  }

  finish(): void {
    if (this.showTimer !== null) {
      window.clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    if (this.root) {
      this.root.hidden = true;
    }
    this.shown = false;
  }
}
