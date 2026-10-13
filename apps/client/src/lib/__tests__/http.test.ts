import { HttpResponse, http as mswHttp } from "msw"
import { describe, expect, it } from "vitest"

import { ApiError, buildUrl, http } from "@/lib/http"
import { setMockErrorPattern } from "@/mocks/config"
import { server } from "@/mocks/server"

describe("buildUrl", () => {
  it("/api önekini ve query parametrelerini ekler, boş değerleri atlar", () => {
    const url = new URL(
      buildUrl("/mukellefler", {
        q: "çınar",
        tur: ["LTD", "AS"],
        sorumlu: undefined,
        x: "",
      })
    )
    expect(url.pathname).toBe("/api/mukellefler")
    expect(url.searchParams.get("q")).toBe("çınar")
    expect(url.searchParams.getAll("tur")).toEqual(["LTD", "AS"])
    expect(url.searchParams.has("sorumlu")).toBe(false)
    expect(url.searchParams.has("x")).toBe(false)
  })
})

describe("http", () => {
  it("başarılı JSON yanıtını döner", async () => {
    const personel = await http.get<{ id: string }[]>("/personel")
    expect(personel.map((p) => p.id)).toEqual(["p_1", "p_2", "p_3", "p_4"])
  })

  it("hata yanıtında sunucu mesajıyla ApiError fırlatır", async () => {
    await expect(http.get("/mukellefler/yok")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Mükellef bulunamadı",
    })
  })

  it("mesajsız hata yanıtında varsayılan mesaj kullanır", async () => {
    server.use(
      mswHttp.get("/api/buro", () => new HttpResponse(null, { status: 502 }))
    )
    const error = await http.get("/buro").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe("İstek başarısız (502)")
  })

  it("mockError deseniyle eşleşen istekler 500 döner, diğerleri etkilenmez", async () => {
    setMockErrorPattern("/api/mukellefler")
    await expect(http.get("/mukellefler")).rejects.toMatchObject({
      status: 500,
    })
    await expect(http.get("/buro")).resolves.toMatchObject({ id: "b_1" })

    setMockErrorPattern(null)
    await expect(http.get("/mukellefler")).resolves.toMatchObject({ total: 3 })
  })
})
