import Phaser from 'phaser';
import { COLLECTIBLE, HAZARD, PLAYER, RUN } from '../tuning';
import { GAME_HEIGHT, GAME_WIDTH, u } from '../viewport';
import { TEXTURES, SCENES } from '../keys';
import { hex, THEME } from '../theme';
import { RunState } from '../core/RunState.ts';
import { completionReportPercent } from '../core/progressReporting.ts';
import { scores } from '../composition';
import { platform } from '../../platform';
import { audio } from '../effects/audio';
import type { ResultData } from './contracts';

type PlayPhase = 'playing' | 'paused' | 'finished';

export class PlayScene extends Phaser.Scene {
  private state!: RunState;
  private player!: Phaser.Physics.Arcade.Sprite;
  private collectibles!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.Group;
  private scoreText!: Phaser.GameObjects.Text;
  private pauseLabel: Phaser.GameObjects.Text | null = null;
  private resumeFromPointer: (() => void) | null = null;
  private pauseKey: Phaser.Input.Keyboard.Key | null = null;
  private pauseKeyHandler: (() => void) | null = null;
  private phase: PlayPhase = 'playing';
  private nextCollectibleAt = 0;
  private nextHazardAt = RUN.startGraceMs;

  constructor() {
    super(SCENES.Play);
  }

  create(): void {
    this.state = new RunState(scores);
    this.phase = 'playing';
    this.pauseLabel = null;
    this.resumeFromPointer = null;
    this.pauseKey = null;
    this.pauseKeyHandler = null;
    this.nextCollectibleAt = 0;
    this.nextHazardAt = RUN.startGraceMs;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanupSceneHandlers());

    this.cameras.main.setBackgroundColor(THEME.color.background);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - u(48), GAME_HEIGHT - u(48), 0x000000, 0).setStrokeStyle(
      u(2),
      hex(THEME.color.panelStroke),
      0.28,
    );

    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, TEXTURES.player);
    this.player.setCircle(PLAYER.radius);
    this.player.setCollideWorldBounds(true);

    this.collectibles = this.physics.add.group();
    this.hazards = this.physics.add.group();
    this.physics.add.overlap(this.player, this.collectibles, (_player, collectible) => this.onCollect(collectible), undefined, this);
    this.physics.add.overlap(this.player, this.hazards, this.onHit, undefined, this);

    this.scoreText = this.add.text(u(34), u(26), 'Score 0', {
      fontFamily: 'Arial, sans-serif',
      fontSize: `${u(26)}px`,
      color: THEME.color.text,
      fontStyle: 'bold',
    });

    this.pauseKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC) ?? null;
    this.pauseKeyHandler = () => this.togglePause();
    this.pauseKey?.on('down', this.pauseKeyHandler);
    platform().gameplayStart();
  }

  override update(_time: number, delta: number): void {
    if (this.phase !== 'playing') return;

    this.state.tick(delta);
    const activeElapsedMs = this.state.elapsedMs;
    this.movePlayer(delta);

    if (activeElapsedMs >= this.nextCollectibleAt) {
      this.spawnCollectible();
      this.nextCollectibleAt = activeElapsedMs + COLLECTIBLE.spawnMs;
    }
    if (activeElapsedMs >= this.nextHazardAt) {
      this.spawnHazard();
      this.nextHazardAt = activeElapsedMs + HAZARD.spawnMs;
    }

    this.scoreText.setText(`Score ${this.state.score}  Time ${Math.ceil((RUN.durationMs - this.state.elapsedMs) / 1000)}`);

    if (this.state.complete) {
      this.finishRun();
    }
  }

  private movePlayer(delta: number): void {
    const pointer = this.input.activePointer;
    if (!pointer.isDown && !this.input.mousePointer.isDown) {
      this.player.setVelocity(0, 0);
      return;
    }

    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const dx = world.x - this.player.x;
    const dy = world.y - this.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 4) {
      this.player.setVelocity(0, 0);
      return;
    }

    const seconds = Math.max(delta / 1000, 0.001);
    const speed = Math.min(PLAYER.speed, distance / seconds);
    this.player.setVelocity((dx / distance) * speed, (dy / distance) * speed);
  }

  private spawnCollectible(): void {
    const item = this.collectibles.get(
      Phaser.Math.Between(u(80), GAME_WIDTH - u(80)),
      Phaser.Math.Between(u(90), GAME_HEIGHT - u(80)),
      TEXTURES.collectible,
    ) as Phaser.Physics.Arcade.Sprite;
    item.setActive(true).setVisible(true);
    item.body?.reset(item.x, item.y);
    item.setCircle(COLLECTIBLE.radius);
  }

  private spawnHazard(): void {
    const fromLeft = Phaser.Math.Between(0, 1) === 0;
    const x = fromLeft ? -u(30) : GAME_WIDTH + u(30);
    const y = Phaser.Math.Between(u(80), GAME_HEIGHT - u(80));
    const hazard = this.hazards.get(x, y, TEXTURES.hazard) as Phaser.Physics.Arcade.Sprite;
    hazard.setActive(true).setVisible(true);
    hazard.body?.reset(x, y);
    hazard.setCircle(HAZARD.radius);
    const speed = Phaser.Math.Between(HAZARD.speedMin, HAZARD.speedMax);
    hazard.setVelocity(fromLeft ? speed : -speed, Phaser.Math.Between(-40, 40));
  }

  private onCollect(
    raw:
      | Phaser.Types.Physics.Arcade.GameObjectWithBody
      | Phaser.Physics.Arcade.Body
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Tilemaps.Tile,
  ): void {
    if (this.phase !== 'playing') return;
    const item = raw as Phaser.Physics.Arcade.Sprite;
    item.disableBody(true, true);
    this.state.collect();
    audio.blip(740);
  }

  private onHit(): void {
    if (this.phase !== 'playing') return;
    this.state.hitHazard();
    audio.blip(180, 120);
    this.cameras.main.shake(100, 0.006);
    this.finishRun();
  }

  private togglePause(): void {
    this.setPaused(this.phase !== 'paused');
  }

  private setPaused(paused: boolean): void {
    if (this.phase === 'finished') return;

    if (!paused) {
      if (this.phase !== 'paused') return;
      this.clearPauseUi();
      this.phase = 'playing';
      this.physics.resume();
      platform().gameplayStart();
      return;
    }

    if (this.phase === 'paused') return;
    this.phase = 'paused';
    this.player.setVelocity(0, 0);
    this.physics.pause();
    platform().gameplayStop();
    this.pauseLabel = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, THEME.text.pause, {
        fontFamily: 'Arial, sans-serif',
        fontSize: `${u(54)}px`,
        color: THEME.color.warning,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.resumeFromPointer = () => this.setPaused(false);
    this.input.once(Phaser.Input.Events.POINTER_DOWN, this.resumeFromPointer);
  }

  private clearPauseUi(): void {
    if (this.resumeFromPointer) {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.resumeFromPointer);
      this.resumeFromPointer = null;
    }
    this.pauseLabel?.destroy();
    this.pauseLabel = null;
  }

  private cleanupSceneHandlers(): void {
    this.clearPauseUi();
    if (this.pauseKey && this.pauseKeyHandler) {
      this.pauseKey.off('down', this.pauseKeyHandler);
    }
    this.pauseKey = null;
    this.pauseKeyHandler = null;
  }

  private finishRun(): void {
    if (this.phase === 'finished') return;

    const result: ResultData = this.state.finish();
    if (!result.progressSaved) {
      console.error('[storage] run result was not saved', result.saveErrorMessage);
    }

    this.phase = 'finished';
    this.clearPauseUi();
    this.player.setVelocity(0, 0);
    this.physics.pause();
    platform().gameplayStop();
    const completionPercent = completionReportPercent(result.progress);
    if (completionPercent !== null) {
      platform().reportProgress(completionPercent);
    }
    if (result.isNewBest) {
      platform().happyTime();
    }
    this.scene.start(SCENES.Result, result);
  }
}
