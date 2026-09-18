# QA Checklist

Run this before uploading to CrazyGames.

## Automated

- [ ] `npm ci` passes with Node `>=24.12.0` and npm `>=11 <12`.
- [ ] `npm run build` passes.
- [ ] `npm run check:size` passes.
- [ ] `npm run portal:upload` generates `submissions/portal-upload/`.
- [ ] `submissions/portal-upload/index.html` exists.
- [ ] Build uses relative paths.
- [ ] No non-whitelisted external URLs are present in `dist/**/*.html`, `dist/**/*.js`, or `dist/**/*.css`.
- [ ] No root-relative runtime paths such as `/api`, `/assets`, or CSS `url(/...)` are present.
- [ ] Total size is under 250 MB.
- [ ] File count is under 1500.
- [ ] Conservative initial download is under 50 MB.
- [ ] Conservative initial download is under 20 MB if you want mobile homepage eligibility.

## Manual

- [ ] Open local dev server and complete one full run.
- [ ] For phone LAN testing, append `?useLocalSdk=true` when the CrazyGames SDK is loaded.
- [ ] Open production preview with `npm run preview` and complete one full run.
- [ ] Test desktop pointer input.
- [ ] Test mobile touch input on a real phone.
- [ ] Player-visible UI is English.
- [ ] Browser console has no uncaught errors.
- [ ] Pressing arrow keys or Space does not scroll the page.
- [ ] Pause/resume clears the pause overlay and calls `gameplayStop` / `gameplayStart` once per transition.
- [ ] Platform mute changes game audio.
- [ ] No rewarded ad button is visible in Basic Launch unless ads are enabled and tested.
- [ ] Save-progress selection in the portal matches the real implementation.
- [ ] CrazyGames Preview Tool completes one full run before final submit.

## CrazyGames QA Gate

- [ ] Chrome and Edge both complete one full run.
- [ ] Safari has been tested or intentionally excluded from support.
- [ ] A low-end or 4 GB class device can play smoothly enough.
- [ ] The game is playable inside a 907x510 iframe-style viewport.
- [ ] `devicePixelRatio = 1` view is readable and not blurry.
- [ ] Mobile UI text and controls are readable without overlap.
- [ ] The game does not use custom fullscreen prompts or force fullscreen.
- [ ] The game does not include cross-promotion, social prompts, or external links.
- [ ] Content is appropriate for a broad arcade portal audience and not child-directed.
- [ ] Gameplay, title, metadata, covers, and video are original enough to avoid an asset-flip rejection.
