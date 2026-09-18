import { createGame } from './game/main';
import { LoadingOverlay } from './dom/LoadingOverlay';
import { assertScorePersistenceAvailable } from './game/composition';
import { initPlatform } from './platform';

function installBrowserInputGuards(): void {
  window.addEventListener('wheel', (event) => event.preventDefault(), { passive: false });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(event.key)) {
      event.preventDefault();
    }
  });
}

async function bootstrap(): Promise<void> {
  installBrowserInputGuards();

  const adapter = await initPlatform();
  console.info(`[platform] ${adapter.name}`);
  assertScorePersistenceAvailable();

  const loading = new LoadingOverlay(!adapter.capabilities.platformProvidesLoadingUI);
  loading.start();

  const game = createGame();
  game.events.once('boot-complete', () => loading.finish());
  game.events.on('boot-progress', (ratio: number) => loading.setProgress(ratio));
}

void bootstrap();
