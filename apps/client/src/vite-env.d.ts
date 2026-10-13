/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" ise production build'de de MSW mock API'si çalışır (demo/staging). */
  readonly VITE_ENABLE_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
