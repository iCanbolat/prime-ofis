import { useState, type FormEvent } from "react"
import { subMonths } from "date-fns"
import { toast } from "sonner"

import { MonthPicker } from "@/components/shared/date-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { GonderPaneli } from "@/features/evrak-talebi/components/gonder-paneli"
import {
  GECERLILIK_SECENEKLERI,
  ISTENEN_EVRAKLAR,
  ISTENEN_SIRASI,
  KANAL_ETIKET,
  hassasMi,
  varsayilanGecerlilik,
} from "@prime/shared/evrak-talebi/sabitler"
import { useTalepOlustur } from "@/features/evrak-talebi/queries"
import { MukellefSelect } from "@/features/mukellef/components/mukellef-select"
import type { TalepView } from "@prime/shared/types/api"
import type { IstenenEvrak, TalepKanal } from "@prime/shared/types/domain"

export interface TalepHedef {
  /** Verilirse mükellef sabittir (mükellef kartı) */
  mukellefId?: string
  istenenler?: IstenenEvrak[]
  /** "2026-08"; verilirse dönem alanı bununla başlar */
  donem?: string
}

const GECERLILIK_ITEMS = Object.fromEntries(
  GECERLILIK_SECENEKLERI.map((g) => [String(g), `${g} gün`])
)
const KANALLAR: TalepKanal[] = ["WHATSAPP", "EPOSTA", "LINK"]

function oncekiAy() {
  const d = subMonths(new Date(), 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function TalepForm({
  hedef,
  onOlustu,
  onClose,
}: {
  hedef: TalepHedef
  onOlustu: (talep: TalepView) => void
  onClose: () => void
}) {
  const olustur = useTalepOlustur()
  const [mukellefId, setMukellefId] = useState(hedef.mukellefId ?? "")
  const [istenenler, setIstenenler] = useState<IstenenEvrak[]>(
    hedef.istenenler ?? ["FIS_FATURA", "BANKA_EKSTRESI"]
  )
  const [donem, setDonem] = useState(
    hedef.donem ?? (hedef.istenenler ? "" : oncekiAy())
  )
  const [gun, setGun] = useState(String(varsayilanGecerlilik(istenenler)))
  // Kullanıcı süreyi elle seçtiyse seçilen evraklar süreyi değiştirmez
  const [gunElle, setGunElle] = useState(false)
  const [kanal, setKanal] = useState<TalepKanal>("WHATSAPP")
  const [aciklama, setAciklama] = useState("")
  const [hatalar, setHatalar] = useState<{
    mukellef?: string
    istenen?: string
  }>({})

  const toggle = (i: IstenenEvrak, secili: boolean) => {
    const yeni = secili ? [...istenenler, i] : istenenler.filter((x) => x !== i)
    setIstenenler(yeni)
    if (!gunElle) setGun(String(varsayilanGecerlilik(yeni)))
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const yeniHatalar = {
      mukellef: mukellefId ? undefined : "Bir mükellef seçin",
      istenen: istenenler.length ? undefined : "En az bir evrak seçin",
    }
    setHatalar(yeniHatalar)
    if (yeniHatalar.mukellef || yeniHatalar.istenen) return

    olustur.mutate(
      {
        mukellefId,
        istenenler,
        donem: donem || undefined,
        aciklama: aciklama || undefined,
        kanal,
        gecerlilikGun: Number(gun),
      },
      {
        onSuccess: (talep) => {
          toast.success("Evrak talebi oluşturuldu")
          onOlustu(talep)
        },
        onError: (error) => toast.error(error.message),
      }
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Evrak iste</DialogTitle>
        <DialogDescription>
          Müşteriye girişsiz yükleme bağlantısı gönderilir; fotoğraf çekerek
          veya dosya seçerek yükler.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        {!hedef.mukellefId && (
          <Field data-invalid={Boolean(hatalar.mukellef) || undefined}>
            <FieldLabel htmlFor="talep-mukellef">Mükellef</FieldLabel>
            <MukellefSelect
              id="talep-mukellef"
              value={mukellefId}
              onValueChange={setMukellefId}
              aria-invalid={Boolean(hatalar.mukellef) || undefined}
            />
            <FieldError>{hatalar.mukellef}</FieldError>
          </Field>
        )}

        <FieldSet data-invalid={Boolean(hatalar.istenen) || undefined}>
          <FieldLegend variant="label">İstenen evraklar</FieldLegend>
          <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {ISTENEN_SIRASI.map((i) => (
              <Field key={i} orientation="horizontal">
                <Checkbox
                  id={`istenen-${i}`}
                  checked={istenenler.includes(i)}
                  onCheckedChange={(c) => toggle(i, c)}
                />
                <FieldLabel htmlFor={`istenen-${i}`} className="font-normal">
                  {ISTENEN_EVRAKLAR[i].ad}
                </FieldLabel>
              </Field>
            ))}
          </div>
          <FieldError>{hatalar.istenen}</FieldError>
        </FieldSet>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="talep-donem">Dönem</FieldLabel>
            <MonthPicker
              id="talep-donem"
              value={donem}
              onChange={setDonem}
              placeholder="Dönemsiz"
              clearable
            />
            <FieldDescription>
              Dönemsiz talepler için boş bırakın.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="talep-gecerlilik">
              Bağlantı geçerliliği
            </FieldLabel>
            <Select
              items={GECERLILIK_ITEMS}
              value={gun}
              onValueChange={(v) => {
                if (!v) return
                setGun(String(v))
                setGunElle(true)
              }}
            >
              <SelectTrigger id="talep-gecerlilik" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GECERLILIK_SECENEKLERI.map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    {g} gün
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hassasMi(istenenler) && (
              <FieldDescription>
                Bordro / SGK evrakı: bağlantı kısa süreli tutulur.
              </FieldDescription>
            )}
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="talep-kanal-etiket">Gönderim kanalı</FieldLabel>
          <Select
            items={KANAL_ETIKET}
            value={kanal}
            onValueChange={(v) => v && setKanal(v as TalepKanal)}
          >
            <SelectTrigger id="talep-kanal-etiket" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KANALLAR.map((k) => (
                <SelectItem key={k} value={k}>
                  {KANAL_ETIKET[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="talep-aciklama">
            Müşteriye not (opsiyonel)
          </FieldLabel>
          <Textarea
            id="talep-aciklama"
            rows={2}
            maxLength={300}
            value={aciklama}
            onChange={(e) => setAciklama(e.target.value)}
            placeholder="Ör. Kredi kartı ekstrelerini de ekleyebilir misiniz?"
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={olustur.isPending}>
          Talep oluştur
        </Button>
      </DialogFooter>
    </form>
  )
}

/** İki adım: talep formu → mesaj önizleme ve gönderim. */
export function TalepOlusturDialog({
  hedef,
  onClose,
  onOlustu,
}: {
  hedef: TalepHedef | null
  onClose: () => void
  /** Talep oluşunca (gönderim adımından önce) çağrılır */
  onOlustu?: (talep: TalepView) => void
}) {
  const [olusan, setOlusan] = useState<TalepView | null>(null)
  const kapat = () => {
    setOlusan(null)
    onClose()
  }

  return (
    <Dialog open={Boolean(hedef)} onOpenChange={(open) => !open && kapat()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        {olusan ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Talebi gönder</DialogTitle>
              <DialogDescription>{olusan.mukellefUnvan}</DialogDescription>
            </DialogHeader>
            <GonderPaneli talep={olusan} />
            <DialogFooter>
              <Button variant="outline" onClick={kapat}>
                Kapat
              </Button>
            </DialogFooter>
          </div>
        ) : (
          hedef && (
            <TalepForm
              hedef={hedef}
              onOlustu={(talep) => {
                setOlusan(talep)
                onOlustu?.(talep)
              }}
              onClose={kapat}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  )
}
