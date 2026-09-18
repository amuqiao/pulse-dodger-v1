import Phaser from 'phaser';
import { TEXTURES, SCENES } from '../keys';
import { hex, THEME } from '../theme';
import { platform } from '../../platform';
import { audio } from '../effects/audio';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Boot);
  }

  preload(): void {
    platform().loadingStart();
    this.load.on('progress', (ratio: number) => this.game.events.emit('boot-progress', ratio));
  }

  create(): void {
    this.createCircleTexture(TEXTURES.player, 22, hex(THEME.color.accent));
    this.createCircleTexture(TEXTURES.collectible, 14, hex(THEME.color.warning));
    this.createCircleTexture(TEXTURES.hazard, 18, hex(THEME.color.danger));
    this.createCircleTexture(TEXTURES.sparkle, 6, hex(THEME.color.text));

    audio.bindPlatformSettings();
    platform().loadingStop();
    this.game.events.emit('boot-complete');
    this.scene.start(SCENES.Menu);
  }

  private createCircleTexture(key: string, radius: number, color: number): void {
    const graphics = this.add.graphics();
    graphics.fillStyle(color, 1);
    graphics.fillCircle(radius, radius, radius);
    graphics.generateTexture(key, radius * 2, radius * 2);
    graphics.destroy();
  }
}

