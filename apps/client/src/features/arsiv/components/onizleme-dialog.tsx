import { useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Download04Icon, Clock01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { aktiviteKeys } from "@/features/aktivite/queries"
import { dosyaIndir } from "@/lib/dosya"
import type { DosyaErisimIslemi } from "@prime/shared/types/api"

import { arsivApi } from "@/features/arsiv/api"
import { ErisimGecmisi } from "@/features/arsiv/components/erisim-gecmisi"
import { arsivKeys } from "@/features/arsiv/queries"
import { eBelgeApi } from "@/features/e-belge/api"
import { eBelgeKeys } from "@/features/e-belge/queries"
import { evrakTalebiApi } from "@/features/evrak-talebi/api"
import { evrakTalebiKeys } from "@/features/evrak-talebi/queries"

/** Arşiv dosyası, portaldan gelen evrak veya e-Belge (fatura görüntüsü) */
export interface OnizlenecekDosya {
  id: string
  ad: string
  mimeType: string
  /** Başlık altındaki açıklama satırı */
  aciklama: string
  kaynak: "arsiv" | "gelen" | "ebelge"
}

const ICERIK_KAYNAKLARI = {
  arsiv: { key: arsivKeys.icerik, fn: arsivApi.icerik },
  gelen: { key: evrakTalebiKeys.icerik, fn: evrakTalebiApi.gelenIcerik },
  ebelge: { key: eBelgeKeys.icerik, fn: eBelgeApi.icerik },
} satisfies Record<
  OnizlenecekDosya["kaynak"],
  {
    key: (id: string) => readonly unknown[]
    fn: (id: string, islem?: DosyaErisimIslemi) => Promise<{ dataUrl: string }>
  }
>

function useDosyaIcerik(dosya: OnizlenecekDosya) {
  const kaynak = ICERIK_KAYNAKLARI[dosya.kaynak]
  return useQuery({
    queryKey: kaynak.key(dosya.id),
    queryFn: () => kaynak.fn(dosya.id),
    staleTime: Infinity,
  })
}

/** data URL → blob URL. Tarayıcılar data: PDF'leri iframe'de engelleyebildiği için blob URL kullanılır. */
function useBlobUrl(dataUrl: string | undefined) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!dataUrl) return
    let iptal = false
    let olusan: string | undefined
    void fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => {
        if (iptal) return
        olusan = URL.createObjectURL(blob)
        setUrl(olusan)
      })
      .catch(() => !iptal && setUrl(dataUrl))
    return () => {
      iptal = true
      if (olusan) URL.revokeObjectURL(olusan)
      setUrl(undefined)
    }
  }, [dataUrl])
  return url
}

/** Dosya içeriği (PDF iframe'i ya da görsel) ve indirme bağlantısı; pencere dışında da kullanılır */
export function DosyaIcerigi({ dosya }: { dosya: OnizlenecekDosya }) {
  const icerik = useDosyaIcerik(dosya)
  const queryClient = useQueryClient()
  const [indiriliyor, setIndiriliyor] = useState(false)
  const [gecmisAcik, setGecmisAcik] = useState(false)
  const dataUrl = icerik.data?.dataUrl
  const blobUrl = useBlobUrl(dataUrl)

  // İndirme sunucuda ayrıca kaydedilir (`?islem=indir`); içerik önizleme için zaten elimizde
  const indirTikla = async () => {
    setIndiriliyor(true)
    try {
      const { dataUrl: icerikUrl } = await ICERIK_KAYNAKLARI[dosya.kaynak].fn(
        dosya.id,
        "indir"
      )
      dosyaIndir(await (await fetch(icerikUrl)).blob(), dosya.ad)
      void queryClient.invalidateQueries({ queryKey: aktiviteKeys.all })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "İndirilemedi")
    } finally {
      setIndiriliyor(false)
    }
  }

  if (icerik.isError)
    return <ErrorState error={icerik.error} onRetry={() => icerik.refetch()} />
  if (!dataUrl) return <LoadingState />

  const indir = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => void indirTikla()}
      disabled={indiriliyor}
    >
      <HugeiconsIcon
        icon={Download04Icon}
        strokeWidth={2}
        data-icon="inline-start"
      />
      İndir
    </Button>
  )

  let govde
  if (dosya.mimeType === "application/pdf") {
    govde = blobUrl ? (
      <iframe
        src={blobUrl}
        title={dosya.ad}
        className="h-[65vh] w-full rounded-xl border bg-muted"
      />
    ) : (
      <LoadingState />
    )
  } else if (
    dosya.mimeType === "image/heic" &&
    !dataUrl.startsWith("data:image/svg")
  ) {
    govde = (
      <p className="rounded-xl border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        HEIC dosyaları tarayıcıda önizlenemiyor. Görüntülemek için indirin.
      </p>
    )
  } else {
    govde = (
      <div className="flex max-h-[65vh] items-center justify-center overflow-auto rounded-xl border bg-muted/40 p-2">
        <img
          src={dataUrl}
          alt={dosya.ad}
          className="max-h-[62vh] max-w-full object-contain"
        />
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {govde}
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={gecmisAcik}
          onClick={() => setGecmisAcik((a) => !a)}
        >
          <HugeiconsIcon
            icon={Clock01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Erişim geçmişi
        </Button>
        {indir}
      </div>
      {gecmisAcik && <ErisimGecmisi dosyaId={dosya.id} />}
    </div>
  )
}

export function OnizlemeDialog({
  dosya,
  onClose,
}: {
  dosya: OnizlenecekDosya | null
  onClose: () => void
}) {
  return (
    <Dialog open={Boolean(dosya)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        {dosya && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-8">{dosya.ad}</DialogTitle>
              <DialogDescription>{dosya.aciklama}</DialogDescription>
            </DialogHeader>
            <DosyaIcerigi key={`${dosya.kaynak}:${dosya.id}`} dosya={dosya} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
