import type { OpenClueApi } from './index'

declare global {
  interface Window {
    openclue: OpenClueApi
  }
}

export {}
