import "@testing-library/jest-dom/vitest"
import { cleanup, configure } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest"

import { useAuthStore } from "@/features/auth/store"
import { useGorevTercihleri } from "@/features/gorev/store"
import { useGorunumTercihleri } from "@/hooks/use-liste-gorunumu"
import { useVaultStore } from "@/features/kasa/store"
import { setDbState } from "@/mocks/db"
import { createFixtureState } from "@prime/mock-data/fixtures"
import { server } from "@/mocks/server"

// Lazy route'lar ilk import'ta paralel test yükü altında birkaç saniyeyi bulabiliyor
configure({ asyncUtilTimeout: 6000 })

// --- jsdom eksikleri ---------------------------------------------------------
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

Element.prototype.scrollIntoView ??= () => {}

// --- MSW + mock DB -----------------------------------------------------------
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  localStorage.clear()
  setDbState(createFixtureState())
  useAuthStore.setState({ user: null })
  useGorevTercihleri.setState({ gorunum: "kanban" })
  useGorunumTercihleri.setState({ secimler: {} })
  useVaultStore.setState({
    key: null,
    dialogAcik: false,
    bekleyenIslem: null,
    hataliDeneme: 0,
    beklemeBitis: null,
  })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => server.close())
