import { beforeEach, describe, expect, it, vi } from "vitest"

import { STORAGE_KEY, db, getDbSnapshot, resetDb, setDbState } from "@/mocks/db"
import { FIXTURE_MUKELLEFLER, createFixtureState } from "@prime/mock-data/fixtures"
import { createSeed } from "@prime/mock-data/seed"

const storedState = () =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")

describe("mock db", () => {
  beforeEach(() => setDbState(createFixtureState()))

  it("okuma: all / find / where / count", () => {
    expect(db.mukellef.all()).toHaveLength(3)
    expect(db.mukellef.find("m_ltd")?.unvan).toBe(FIXTURE_MUKELLEFLER[1].unvan)
    expect(db.mukellef.find("yok")).toBeUndefined()
    expect(
      db.mukellef.where((m) => m.sorumluPersonelId === "p_2").map((m) => m.id)
    ).toEqual(["m_sahis", "m_as"])
    expect(db.mukellef.count((m) => m.tur === "AS")).toBe(1)
  })

  it("all() kopya döner; dönen diziyi değiştirmek veriyi bozmaz", () => {
    db.mukellef.all().pop()
    expect(db.mukellef.count()).toBe(3)
  })

  it("insert: id üretir, kaydı ekler ve localStorage'a yazar", () => {
    const row = db.aktivite.insert({
      aktorId: "p_1",
      eylem: "GIRIS",
      zaman: "2026-09-23T10:00:00Z",
    })
    expect(row.id).toMatch(/^a_[0-9a-f]{8}$/)
    expect(db.aktivite.find(row.id)).toEqual(row)
    expect(storedState().aktivite).toHaveLength(1)
  })

  it("insert: verilen id'yi korur", () => {
    const row = db.aktivite.insert({
      id: "a_sabit",
      aktorId: "p_1",
      eylem: "CIKIS",
      zaman: "2026-09-23T10:00:00Z",
    })
    expect(row.id).toBe("a_sabit")
  })

  it("update: alanları birleştirir, id değişmez, olmayan kayıtta undefined döner", () => {
    const updated = db.mukellef.update("m_ltd", {
      unvan: "Yeni Unvan Ltd. Şti.",
      calisanSayisi: 12,
    })
    expect(updated).toMatchObject({
      id: "m_ltd",
      unvan: "Yeni Unvan Ltd. Şti.",
      calisanSayisi: 12,
      tur: "LTD",
    })
    expect(
      storedState().mukellef.find((m: { id: string }) => m.id === "m_ltd").unvan
    ).toBe("Yeni Unvan Ltd. Şti.")
    expect(db.mukellef.update("yok", { unvan: "x" })).toBeUndefined()
  })

  it("remove: kaydı siler; olmayan kayıtta false döner", () => {
    expect(db.mukellef.remove("m_as")).toBe(true)
    expect(db.mukellef.count()).toBe(2)
    expect(db.mukellef.remove("m_as")).toBe(false)
  })

  it("resetDb: tüm değişiklikleri atıp seed verisine döner", () => {
    db.mukellef.remove("m_ltd")
    resetDb()
    expect(getDbSnapshot()).toEqual(createSeed())
    expect(storedState().mukellef).toHaveLength(40)
  })

  it("getDbSnapshot derin kopya döner", () => {
    const snapshot = getDbSnapshot()
    snapshot.mukellef[0].unvan = "değişti"
    expect(db.mukellef.find(snapshot.mukellef[0].id)?.unvan).not.toBe("değişti")
  })
})

describe("mock db — localStorage'dan yükleme", () => {
  it("kalıcı veri varsa onu, bozuksa seed'i yükler", async () => {
    vi.resetModules()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...createFixtureState(), mukellef: [] })
    )
    const fresh = await import("@/mocks/db")
    expect(fresh.db.mukellef.count()).toBe(0)

    vi.resetModules()
    localStorage.setItem(STORAGE_KEY, "{bozuk json")
    const reseeded = await import("@/mocks/db")
    expect(reseeded.db.mukellef.count()).toBe(40)
  })

  it("başka sekmenin yazdığı veriyi yeniden yükler; kendi yazması onu ezmez", () => {
    setDbState(createFixtureState())
    const digerSekme = { ...createFixtureState(), mukellef: [] }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(digerSekme))
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }))

    expect(db.mukellef.count()).toBe(0)
    db.aktivite.insert({ aktorId: "p_1", eylem: "GIRIS", zaman: "x" })
    expect(storedState().mukellef).toEqual([])
    expect(storedState().aktivite).toHaveLength(1)
  })
})
