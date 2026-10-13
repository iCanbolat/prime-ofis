import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { useAktiviteList } from "@/features/aktivite/queries"
import { formatDateTime } from "@prime/shared/lib/format"
import type { AktiviteEylem } from "@prime/shared/types/domain"

const ERISIM_EYLEMLERI: AktiviteEylem[] = [
  "DOSYA_GORUNTULENDI",
  "DOSYA_INDIRILDI",
]

const ISLEM_ETIKET: Partial<Record<AktiviteEylem, string>> = {
  DOSYA_GORUNTULENDI: "Görüntüledi",
  DOSYA_INDIRILDI: "İndirdi",
}

/** Bir dosyanın içeriğinin kimler tarafından açıldığı / indirildiği (sunucu tarafı erişim kaydı) */
export function ErisimGecmisi({ dosyaId }: { dosyaId: string }) {
  const kayitlar = useAktiviteList({
    hedefId: dosyaId,
    eylem: ERISIM_EYLEMLERI,
    limit: 50,
  })

  if (kayitlar.isError)
    return (
      <ErrorState error={kayitlar.error} onRetry={() => kayitlar.refetch()} />
    )
  if (!kayitlar.data) return <LoadingState />
  if (kayitlar.data.length === 0)
    return (
      <p className="text-sm text-muted-foreground">Henüz erişim kaydı yok.</p>
    )

  return (
    <ol
      aria-label="Erişim geçmişi"
      className="grid max-h-48 gap-2 overflow-y-auto"
    >
      {kayitlar.data.map((k) => (
        <li key={k.id} className="flex items-center gap-2 text-sm">
          {k.aktor ? (
            <PersonelAvatar personel={k.aktor} size="sm" />
          ) : (
            <span className="size-6" />
          )}
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">
              {k.aktor ? `${k.aktor.ad} ${k.aktor.soyad}` : "Sistem"}
            </span>{" "}
            {ISLEM_ETIKET[k.eylem] ?? k.eylem}
          </span>
          <time
            dateTime={k.zaman}
            className="shrink-0 text-xs text-muted-foreground"
          >
            {formatDateTime(k.zaman)}
          </time>
        </li>
      ))}
    </ol>
  )
}
