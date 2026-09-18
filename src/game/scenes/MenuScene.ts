import Phaser from 'phaser';
import { SCENES } from '../keys';
import { hex, THEME } from '../theme';
import { GAME_HEIGHT, GAME_WIDTH, u } from '../viewport';
import { createButton } from '../ui/Button';
import { platform } from '../../platform';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super(SCENES.Menu);
  }

  create(): void {
    platform().gameplayStop();

    this.cameras.main.setBackgroundColor(THEME.color.background);
    this.add
      .text(GAME_WIDTH / 2, u(170), THEME.text.title, {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${u(68)}px`,
        color: THEME.color.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, u(245), THEME.text.subtitle, {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${u(26)}px`,
        color: THEME.color.muted,
      })
      .setOrigin(0.5);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + u(6), u(420), u(190), hex(THEME.color.panel), 0.85);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - u(30), 'Template flow: Menu -> Play -> Result', {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${u(22)}px`,
        color: THEME.color.text,
      })
      .setOrigin(0.5);

    createButton(this, {
      text: THEME.text.start,
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2 + u(55),
      width: u(220),
      height: u(64),
      onClick: () => this.scene.start(SCENES.Play),
    });
  }
}

