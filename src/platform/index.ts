import type { PlatformAdapter } from './PlatformAdapter';
import { CrazyGamesAdapter } from './adapters/crazygames';
import { WebAdapter } from './adapters/web';

export type { PlatformAdapter, PlatformCapabilities, PlatformSettings } from './PlatformAdapter';

let current: PlatformAdapter | null = null;

export async function initPlatform(): Promise<PlatformAdapter> {
  const sdkEnabled = import.meta.env.VITE_ENABLE_CRAZYGAMES_SDK === 'true';
  const sdk = sdkEnabled ? window.CrazyGames?.SDK : undefined;
  const adapter: PlatformAdapter = sdk ? new CrazyGamesAdapter(sdk) : new WebAdapter();

  await adapter.init();
  current = adapter;
  return adapter;
}

export function platform(): PlatformAdapter {
  if (!current) {
    throw new Error('platform() called before initPlatform() completed');
  }
  return current;
}
