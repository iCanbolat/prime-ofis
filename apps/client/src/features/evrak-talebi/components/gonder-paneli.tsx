import { useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  Link01Icon,
  Mail01Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"

import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Textarea } from "@/components/ui/textarea"
import { useBuro } from "@/features/ayarlar/queries"
import {
  epostaGecerli,
  epostaLinki,
  mesajOlustur,
  portalLinki,
  talepDegiskenleri,
  telefonNormalize,
  whatsappLinki,
} from "@prime/shared/evrak-talebi/mesaj"
import { useTalepGonderim } from "@/features/evrak-talebi/queries"
import { VARSAYILAN_SABLONLAR } from "@prime/shared/evrak-talebi/sabitler"
import { kanalHazir } from "@prime/shared/kanal/kurallar"
import { E_POSTA_KONU } from "@prime/shared/kanal/sabitler"
import { useKanallar, useMukellefeGonder } from "@/features/kanal/queries"
import { formatPhone } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { TalepView } from "@prime/shared/types/api"
import type { MesajSablonTip, TalepKanal } from "@prime/shared/types/domain"

interface GonderPaneliProps {
  talep: TalepView
  sablon?: MesajSablonTip
  /** RED şablonu için */
  neden?: string
}

async function kopyala(metin: string, mesaj: string) {
  try {
    await navigator.clipboard.writeText(metin)
    toast.success(mesaj)
  } catch {
    toast.error("Panoya kopyalanamadı")
  }
}

/**
 * Talep mesajının önizlemesi ve paylaşım eylemleri (WhatsApp, e-posta, kopyala). Kanal Ayarlar'da
 * yapılandırılmışsa mesaj sunucudan gider; değilse wa.me / mailto açılır. Her paylaşım kaydedilir.
 */
export function GonderPaneli({
  talep,
  sablon = "TALEP",
  neden,
}: GonderPaneliProps) {
  const { data: buro } = useBuro()
  const gonderim = useTalepGonderim()
  const link = portalLinki(talep.token, window.location.origin)
  const varsayilan = mesajOlustur(
    buro?.mesajSablonlari?.[sablon] ?? VARSAYILAN_SABLONLAR[sablon],
    talepDegiskenleri({
      mukellefUnvan: talep.mukellefUnvan,
      buroAd: buro?.ad ?? "",
      donem: talep.donem,
      istenenler: talep.istenenler,
      link,
      sonKullanma: talep.sonKullanma,
      neden,
    })
  )
  const [mesaj, setMesaj] = useState(varsayilan)
  const telefonGecerli = telefonNormalize(talep.mukellefTelefon) !== null
  const epostaVar = epostaGecerli(talep.mukellefEposta)
  const aktif = talep.durum === "AKTIF"
  const kanallar = useKanallar()
  const gonder = useMukellefeGonder()
  const waSunucu = kanalHazir(kanallar.data?.WHATSAPP)
  const epostaSunucu = kanalHazir(kanallar.data?.EPOSTA)
  const konu = `${E_POSTA_KONU[sablon]} — ${buro?.ad ?? ""}`

  const sunucudanGonder = (kanal: "WHATSAPP" | "EPOSTA") =>
    gonder.mutate(
      {
        sablon,
        kanal,
        neden,
        metin: kanal === "EPOSTA" ? mesaj : undefined,
        hedefler: [{ mukellefId: talep.mukellefId, talepId: talep.id }],
      },
      {
        onSuccess: ({ sonuclar }) => {
          const s = sonuclar[0]
          if (s?.durum === "GONDERILDI")
            toast.success(
              kanal === "WHATSAPP"
                ? "WhatsApp mesajı gönderildi"
                : "E-posta gönderildi"
            )
          else toast.error(s?.hataMesaji ?? "Gönderilemedi")
        },
        onError: (error) => toast.error(error.message),
      }
    )

  const kaydet = (kanal: TalepKanal) => {
    if (!aktif) return
    gonderim.mutate(
      { id: talep.id, kanal },
      { onError: (error) => toast.error(error.message) }
    )
  }

  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="talep-mesaj">Mesaj</FieldLabel>
        <Textarea
          id="talep-mesaj"
          rows={5}
          value={mesaj}
          onChange={(e) => setMesaj(e.target.value)}
        />
        <FieldDescription>
          {[
            telefonGecerli && formatPhone(talep.mukellefTelefon),
            epostaVar && talep.mukellefEposta,
          ]
            .filter(Boolean)
            .join(" · ") ||
            "Mükellefin geçerli telefonu veya e-postası yok; bağlantıyı kopyalayıp paylaşın."}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="talep-link">Yükleme bağlantısı</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <HugeiconsIcon icon={Link01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput
            id="talep-link"
            readOnly
            value={link}
            className="font-mono text-xs"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label="Bağlantıyı kopyala"
              onClick={() => void kopyala(link, "Bağlantı kopyalandı")}
            >
              <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>

      <div className="grid gap-2 sm:grid-cols-3">
        {waSunucu ? (
          <Button
            disabled={!aktif || !telefonGecerli || gonder.isPending}
            onClick={() => sunucudanGonder("WHATSAPP")}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <HugeiconsIcon
              icon={WhatsappIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            WhatsApp ile gönder
          </Button>
        ) : (
          <a
            href={
              telefonGecerli
                ? (whatsappLinki(talep.mukellefTelefon, mesaj) ?? undefined)
                : undefined
            }
            target="_blank"
            rel="noreferrer"
            aria-disabled={!telefonGecerli || undefined}
            onClick={() => kaydet("WHATSAPP")}
            className={cn(
              buttonVariants(),
              "bg-emerald-600 text-white hover:bg-emerald-700",
              !telefonGecerli && "pointer-events-none opacity-50"
            )}
          >
            <HugeiconsIcon
              icon={WhatsappIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            WhatsApp'ta aç
          </a>
        )}
        {epostaSunucu ? (
          <Button
            variant="outline"
            disabled={!aktif || !epostaVar || gonder.isPending}
            onClick={() => sunucudanGonder("EPOSTA")}
          >
            <HugeiconsIcon
              icon={Mail01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            E-posta ile gönder
          </Button>
        ) : (
          <a
            href={epostaLinki(talep.mukellefEposta, konu, mesaj) ?? undefined}
            aria-disabled={!epostaVar || undefined}
            onClick={() => kaydet("EPOSTA")}
            className={cn(
              buttonVariants({ variant: "outline" }),
              !epostaVar && "pointer-events-none opacity-50"
            )}
          >
            <HugeiconsIcon
              icon={Mail01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            E-postada aç
          </a>
        )}
        <Button
          variant="outline"
          onClick={() => {
            void kopyala(mesaj, "Mesaj kopyalandı")
            kaydet("LINK")
          }}
        >
          <HugeiconsIcon
            icon={Copy01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Mesajı kopyala
        </Button>
      </div>
      {waSunucu && (
        <p className="text-xs text-muted-foreground">
          WhatsApp Business onaylı şablonla gönderir; düzenlenen metin yalnızca
          e-posta ve kopyalamada kullanılır.
        </p>
      )}
    </div>
  )
}
