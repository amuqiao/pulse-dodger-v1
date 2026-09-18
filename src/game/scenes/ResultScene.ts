import Phaser from 'phaser';
import { SCENES } from '../keys';
import { hex, THEME } from '../theme';
import { GAME_HEIGHT, GAME_WIDTH, u } from '../viewport';
import { createButton } from '../ui/Button';
import type { ResultData } from './contracts';

export class ResultScene extends Phaser.Scene {
  private result!: ResultData;

  constructor() {
    super(SCENES.Result);
  }

  init(data: ResultData): void {
    this.result = data;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(THEME.color.background);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, u(560), u(380), hex(THEME.color.panel), 0.94).setStrokeStyle(
      u(2),
      hex(THEME.color.panelStroke),
      0.55,
    );

    this.add
      .text(GAME_WIDTH / 2, u(190), this.result.isNewBest ? 'NEW BEST' : 'RUN COMPLETE', {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${u(46)}px`,
        color: this.result.isNewBest ? THEME.color.warning : THEME.color.text,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, u(285), `Score ${this.result.score}
Best ${this.result.bestScore}
Runs ${this.result.runsPlayed}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${u(28)}px`,
        color: THEME.color.text,
        align: 'center',
        lineSpacing: u(8),
      })
      .setOrigin(0.5);

    if (!this.result.progressSaved) {
      this.add
        .text(GAME_WIDTH / 2, u(390), 'Progress not saved. Check platform storage settings.', {
          fontFamily: 'Arial, sans-serif',
          fontSize: `${u(20)}px`,
          color: THEME.color.danger,
          align: 'center',
          wordWrap: { width: u(460) },
        })
        .setOrigin(0.5);
    }

    createButton(this, {
      text: THEME.text.retry,
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2 + u(145),
      width: u(260),
      height: u(64),
      onClick: () => this.scene.start(SCENES.Play),
    });
  }
}
