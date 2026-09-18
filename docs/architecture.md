# Architecture Notes

This starter has one job: provide a reusable Phaser + CrazyGames spine without carrying one game's business logic into the next project.

## Mental Model

```text
index.html
-> src/main.ts
-> platform init
-> loading overlay
-> Phaser game
-> scenes
-> core rules
```

Keep these boundaries:

| Layer | Owns | Must not own |
| --- | --- | --- |
| `src/main.ts` | Browser bootstrap, platform init, loading overlay | Gameplay rules |
| `src/platform/` | CrazyGames/Web adapters | Phaser scenes or game logic |
| `src/game/main.ts` | Phaser config and scene order | Platform SDK calls |
| `src/game/scenes/` | Per-frame orchestration and Phaser objects | SDK globals |
| `src/game/core/` | Pure rules and state transitions | Browser, Phaser, platform SDK |
| `scripts/` | Build, package, upload-folder checks | Gameplay behavior |

## Why Phaser 3

This template intentionally uses Phaser 3.90.0. The official Vite template may track newer Phaser releases, but the Phaser 3 ecosystem has broader examples and matches the proven Pulse Dodger path used for CrazyGames submission practice.

## Platform Adapter

Game code calls:

```text
platform().gameplayStart()
platform().gameplayStop()
platform().save(key, value)
platform().showRewarded(reason, hooks)
```

Game code does not call:

```text
window.CrazyGames.SDK...
```

That is the part you reuse when publishing to another platform: add a new adapter and keep gameplay mostly unchanged.

