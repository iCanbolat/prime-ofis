import type { ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AktiviteListesi } from "@/features/aktivite/components/aktivite-listesi"
import {
  DEFTER_TURU_ETIKET,
  KDV_PERIYODU_ETIKET,
} from "@/features/mukellef/constants"
import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"
import { formatDate, formatPhone } from "@prime/shared/lib/format"

const evetHayir = (value: boolean) => (value ? "Evet" : "Hayır")

function BilgiKarti({
  title,
  rows,
}: {
  title: string
  rows: [string, ReactNode][]
}) {
  return (
    <Card size="sm" className="@container">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-4 gap-y-1 text-sm @sm:grid-cols-[8rem_1fr] @sm:gap-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="mb-1 min-w-0 font-medium break-words @sm:mb-0">
                {value || "—"}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

export function MukellefGenelTab() {
  const { mukellef: m } = useMukellefKart()
  const isSahis = m.tur === "SAHIS"

  return (
    // Container query: sidebar açık/kapalıyken de içerik genişliğine göre dizilir
    <div className="@container">
      <div className="grid gap-4 @4xl:grid-cols-3">
        <div className="grid gap-4 @2xl:grid-cols-2 @4xl:col-span-2">
          <BilgiKarti
            title="Kimlik"
            rows={[
              [
                isSahis ? "TCKN" : "VKN",
                <span className="font-mono">{m.vkn ?? m.tckn}</span>,
              ],
              ["Vergi dairesi", m.vergiDairesi],
              ...(!isSahis
                ? ([
                    ["Ticaret sicil no", m.ticaretSicilNo],
                    ["MERSİS no", m.mersisNo],
                  ] as [string, ReactNode][])
                : []),
              ["Kayıt tarihi", formatDate(m.olusturmaTarihi)],
            ]}
          />
          <BilgiKarti
            title="İletişim"
            rows={[
              ["Telefon", formatPhone(m.telefon)],
              ["E-posta", m.eposta],
              ["İl / İlçe", `${m.il} / ${m.ilce}`],
              ["Adres", m.adres],
            ]}
          />
          <div className="@2xl:col-span-2">
            <BilgiKarti
              title="Vergi ve yükümlülükler"
              rows={[
                ["Faaliyet", `${m.naceKodu} — ${m.faaliyet}`],
                ["Defter türü", DEFTER_TURU_ETIKET[m.defterTuru]],
                ["KDV mükellefi", evetHayir(m.kdvMukellefi)],
                [
                  "KDV dönemi",
                  m.kdvMukellefi ? KDV_PERIYODU_ETIKET[m.kdvPeriyodu] : "—",
                ],
                [
                  "SGK işyeri",
                  m.sgkIsyeriVar ? `Var (${m.calisanSayisi} çalışan)` : "Yok",
                ],
                ["e-Defter", evetHayir(m.eDefterMukellefi)],
              ]}
            />
          </div>
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Son aktiviteler</CardTitle>
          </CardHeader>
          <CardContent>
            <AktiviteListesi mukellefId={m.id} limit={10} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
