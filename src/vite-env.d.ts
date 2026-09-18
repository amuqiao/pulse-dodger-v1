/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_CRAZYGAMES_ADS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

