import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { SentIcon } from "@hugeicons/core-free-icons"

import { ListeAraclari, SekmeFiltre } from "@/components/shared/liste-araclari"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { Sayfalama } from "@/components/shared/sayfalama"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useGonderimTekrar, useGonderimler } from "@/features/kanal/queries"
import {
  GONDERIM_DURUM_ETIKET,
  GONDERIM_KAYNAK_ETIKET,
  KANAL_ETIKET,
} from "@prime/shared/kanal/sabitler"
import { formatDateTime } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { GonderimDurumu, KanalTip } from "@prime/shared/types/domain"

const SAYFA_BOYUTU = 20
const DURUMLAR = Object.keys(GONDERIM_DURUM_ETIKET) as GonderimDurumu[]
const KANALLAR = Object.keys(KANAL_ETIKET) as KanalTip[]

const DURUM_RENK: Record<GonderimDurumu, string> = {
  KUYRUKTA: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  GONDERILDI: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300",
  HATA: "bg-destructive/10 text-destructive",
  ELLE: "bg-muted text-muted-foreground",
}

export function GonderimlerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const durumParam = searchParams.get("durum") as GonderimDurumu | null
  const durum = durumParam && DURUMLAR.includes(durumParam) ? durumParam : null
  const kanalParam = searchParams.get("kanal") as KanalTip | null
  const kanal = kanalParam && KANALLAR.includes(kanalParam) ? kanalParam : null
  const sayfa = Math.max(Number(searchParams.get("sayfa")) || 1, 1)
  const liste = useGonderimler({
    durum: durum ?? undefined,
    kanal: kanal ?? undefined,
    sayfa,
    sayfaBoyutu: SAYFA_BOYUTU,
  })
  const tekrar = useGonderimTekrar()

  const ayarla = (degisim: Record<string, string | null>) =>
    setSearchParams(
      (onceki) => {
        const yeni = new URLSearchParams(onceki)
        for (const [k, v] of Object.entries(degisim))
          if (v === null) yeni.delete(k)
          else yeni.set(k, v)
        if (!("sayfa" in degisim)) yeni.delete("sayfa")
        return yeni
      },
      { replace: true }
    )

  return (
    <>
      <ListeAraclari
        etiket="Gönderim filtreleri"
        arama={
          <SekmeFiltre
            etiket="Kanal"
            secenekler={KANAL_ETIKET}
            value={kanal}
            onChange={(v) => ayarla({ kanal: v })}
          />
        }
      >
        <SekmeFiltre
          etiket="Durum"
          secenekler={GONDERIM_DURUM_ETIKET}
          value={durum}
          onChange={(v) => ayarla({ durum: v })}
        />
      </ListeAraclari>

      {liste.data && liste.data.hataliSon7Gun > 0 && !durum && (
        <p className="text-sm text-destructive">
          Son 7 günde {liste.data.hataliSon7Gun} gönderim başarısız oldu.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => ayarla({ durum: "HATA" })}
          >
            Hatalıları göster
          </button>
        </p>
      )}

      {liste.isError ? (
        <ErrorState error={liste.error} onRetry={() => liste.refetch()} />
      ) : !liste.data ? (
        <LoadingState />
      ) : liste.data.items.length === 0 ? (
        <EmptyState icon={SentIcon} title="Gönderim yok" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-3xl border">
            <Table aria-label="Gönderim geçmişi">
              <TableHeader>
                <TableRow>
                  <TableHead>Alıcı</TableHead>
                  <TableHead className="hidden md:table-cell">İçerik</TableHead>
                  <TableHead className="hidden sm:table-cell">Zaman</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-24">
                    <span className="sr-only">İşlemler</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liste.data.items.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="max-w-64 whitespace-normal">
                      <span className="block font-medium">{g.aliciAd}</span>
                      <span className="block text-xs text-muted-foreground">
                        {KANAL_ETIKET[g.kanal]} · {g.adres}
                      </span>
                    </TableCell>
                    <TableCell className="hidden max-w-80 whitespace-normal md:table-cell">
                      <span className="block truncate">{g.konu}</span>
                      <span className="block text-xs text-muted-foreground">
                        {GONDERIM_KAYNAK_ETIKET[g.kaynak]}
                        {g.denemeSayisi > 1 && ` · ${g.denemeSayisi}. deneme`}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">
                      {formatDateTime(g.zaman)}
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal">
                      <Badge
                        variant="secondary"
                        className={cn(DURUM_RENK[g.durum])}
                      >
                        {GONDERIM_DURUM_ETIKET[g.durum]}
                      </Badge>
                      {g.hataMesaji && (
                        <span className="mt-1 block text-xs text-destructive">
                          {g.hataMesaji}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {g.durum === "HATA" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={tekrar.isPending}
                          aria-label={`${g.aliciAd} gönderimini yeniden dene`}
                          onClick={() =>
                            tekrar.mutate(g.id, {
                              onSuccess: (y) =>
                                y.durum === "GONDERILDI"
                                  ? toast.success("Gönderildi")
                                  : toast.error(
                                      y.hataMesaji ?? "Yine gönderilemedi"
                                    ),
                              onError: (e) => toast.error(e.message),
                            })
                          }
                        >
                          Tekrar dene
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Sayfalama
            total={liste.data.total}
            sayfa={liste.data.sayfa}
            sayfaBoyutu={liste.data.sayfaBoyutu}
            birim="gönderimden"
            onChange={(s) => ayarla({ sayfa: String(s) })}
          />
        </>
      )}
    </>
  )
}
