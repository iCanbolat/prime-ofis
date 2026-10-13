import { HttpException, type PipeTransform } from "@nestjs/common"
import type { z } from "zod"

/**
 * İstek gövdesini / query'yi zod şemasıyla doğrular. Mock API'nin çoğu 400 döner;
 * bordro uçları 422 kullanır (`new ZodPipe(sema, 422)`).
 * Yanıt: `{ message }` — ilk sorun, alan yoluyla ("donem: Geçersiz dönem").
 */
export class ZodPipe<S extends z.ZodType> implements PipeTransform {
  constructor(
    private readonly sema: S,
    private readonly status: 400 | 422 = 400,
    private readonly secenek: ZodDogrulaSecenekleri = {}
  ) {}

  transform(deger: unknown): z.output<S> {
    return zodDogrula(this.sema, deger, this.status, this.secenek)
  }
}

export interface ZodDogrulaSecenekleri {
  /** false: mesaja alan yolu eklenmez (şemadaki mesajlar zaten tam cümleyse, mock ile birebir) */
  yolOneki?: boolean
}

/** ZodPipe'ın fonksiyon hâli: doğrulama sırası önemliyse (ör. önce yetki, sonra gövde) */
export function zodDogrula<S extends z.ZodType>(
  sema: S,
  deger: unknown,
  status: 400 | 422 = 400,
  { yolOneki = true }: ZodDogrulaSecenekleri = {}
): z.output<S> {
  const sonuc = sema.safeParse(deger)
  if (sonuc.success) return sonuc.data
  const ilk = sonuc.error.issues[0]
  const yol = yolOneki && ilk?.path.length ? `${ilk.path.join(".")}: ` : ""
  throw new HttpException(
    { message: `${yol}${ilk?.message ?? "Geçersiz istek"}` },
    status
  )
}
