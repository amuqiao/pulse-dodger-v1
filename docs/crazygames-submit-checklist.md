# CrazyGames Submit Checklist

This is the reusable submission runbook distilled from the Pulse Dodger submission.

## Lifecycle

```text
Local build
-> Production preview
-> Portal upload folder
-> Developer Portal Upload
-> Preview Tool
-> QA Results
-> Game Details
-> Finalize
-> Awaiting review
-> Basic Launch
-> Public URL verification
-> Full Launch preparation
```

`Awaiting review` means the game is submitted. It does not mean the game is publicly searchable.

## Upload

- Launch type: `Basic` for the first submission.
- Game engine: `HTML5`.
- Hosting: upload HTML5 build files.
- Basic upload command: `npm run portal:upload`; this command forces `VITE_ENABLE_CRAZYGAMES_ADS=false` internally.
- Full Launch / ads verification command: `npm run portal:upload:full`.
- Upload folder: open `submissions/portal-upload/` and drag the files inside it.
- Do not upload `submissions/archives/*.zip` unless the current Portal explicitly asks for an archive.

`npm run portal:upload` forces ads disabled and rebuilds the upload folder. Do not use it for Full Launch ad verification; it will overwrite the upload folder with a Basic package. Use `npm run portal:upload:full` when you need an ads-enabled verification package.

## Capability Fields

| Portal field | Choose when |
| --- | --- |
| Save progress: No | The game has no persistent progress, and all `platform().save/load` usage has been removed. |
| Save progress: CrazyGames Data Module | `CrazyGamesAdapter.save/load` is used for real progress. |
| Supports mobile devices | A real phone can complete one full run. |
| Online multiplayer | Only when the game actually has multiplayer. |
| Supports CrazyGames muting audio through SDK | `muteAudio` settings are implemented and tested. |

The default demo stores `bestScore` and `runsPlayed` through `platform().save/load`, and bootstrap runs a storage self-check.
If you submit the demo flow, choose `Save progress: CrazyGames Data Module`.
If you choose `Save progress: No`, remove persistence from the game first; otherwise CrazyGames may disable the Data Module and the game should fail during preview.

## Store Assets

| Asset | Required baseline | Suggested path |
| --- | --- | --- |
| Gameplay screenshots | 3 real gameplay screenshots. | `materials/screenshots/gameplay-01.png`, `gameplay-02.png`, `gameplay-03.png` |
| Landscape cover | 1920x1080, 16:9. | `materials/covers/landscape-1920x1080.png` |
| Portrait cover | 800x1200, 2:3. | `materials/covers/portrait-800x1200.png` |
| Square cover | 800x800, 1:1. | `materials/covers/square-800x800.png` |
| Landscape preview video | 15-20 seconds, 1080p 16:9, no sound, under 50 MB. | `materials/videos/landscape-1080p.mp4` |
| Portrait preview video | 15-20 seconds, 1080p 2:3, no sound, under 50 MB. | `materials/videos/portrait-1080p.mp4` |
| Metadata | Title, short description, long description, controls, tags. | `materials/metadata.md` |
| Asset license record | Source, author/tool, license, file path. | `docs/asset-license.csv` |

Avoid black screens, logo-only transitions, visible default mouse cursor, promotional text, app icons, social icons, and misleading footage in preview videos.

## Local And Preview Testing

- [ ] Local dev on `localhost` or `127.0.0.1` completes one full run.
- [ ] Phone LAN URL uses `?useLocalSdk=true` if the CrazyGames SDK is loaded.
- [ ] `npm run build` passes.
- [ ] `npm run preview` completes one full run.
- [ ] `npm run portal:upload` creates `submissions/portal-upload/index.html`.
- [ ] CrazyGames Preview Tool completes one full run with no console errors.
