/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEFAULT_VANSHA_ID?: string;
  readonly VITE_BETA_ALL_ACCESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
