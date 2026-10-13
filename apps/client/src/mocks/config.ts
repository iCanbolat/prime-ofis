/**
 * Mock API davranış ayarları (localStorage'da tutulur, Ayarlar → Geliştirici sayfasından değiştirilir).
 * - mockError: bu path önekiyle başlayan tüm istekler 500 döner (ör. "/api/mukellefler")
 * - mockDelay: gerçekçi ağ gecikmesi (200–600 ms); testte her zaman kapalı
 */

const ERROR_KEY = "prime-ofis:mock-error"
const DELAY_KEY = "prime-ofis:mock-delay"

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // yoksay
  }
}

export function getMockErrorPattern(): string | null {
  const value = read(ERROR_KEY)?.trim()
  return value ? value : null
}

export function setMockErrorPattern(pattern: string | null) {
  write(ERROR_KEY, pattern?.trim() ? pattern.trim() : null)
}

export function isMockDelayEnabled(): boolean {
  if (import.meta.env.MODE === "test") return false
  return read(DELAY_KEY) !== "off"
}

export function setMockDelayEnabled(enabled: boolean) {
  write(DELAY_KEY, enabled ? null : "off")
}
