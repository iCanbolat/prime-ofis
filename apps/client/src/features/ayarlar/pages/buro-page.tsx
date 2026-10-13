import { useState } from "react"
import { toast } from "sonner"

import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useBuro } from "@/features/ayarlar/queries"
import { hasRole, useAuthStore } from "@/features/auth/store"
import { useBuroGuncelle } from "@/features/tahsilat/queries"
import { formatPhone } from "@prime/shared/lib/format"
import type { Buro } from "@prime/shared/types/domain"

const ibanBicimle = (iban: string) => iban.replace(/(.{4})/g, "$1 ").trim()

function IbanAlani({ buro }: { buro: Buro }) {
  const guncelle = useBuroGuncelle()
  const [iban, setIban] = useState(buro.iban ? ibanBicimle(buro.iban) : "")
  const [hata, setHata] = useState<string | null>(null)
  const temiz = iban.replace(/\s/g, "").toUpperCase()
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (temiz && !/^TR\d{24}$/.test(temiz)) {
          setHata("TR ile başlayan 26 karakterlik IBAN girin")
          return
        }
        setHata(null)
        guncelle.mutate(
          { iban: temiz },
          {
            onSuccess: () => toast.success("IBAN kaydedildi"),
            onError: (error) => setHata(error.message),
          }
        )
      }}
    >
      <Field data-invalid={Boolean(hata) || undefined}>
        <FieldLabel htmlFor="buro-iban">IBAN</FieldLabel>
        <div className="flex gap-2">
          <Input
            id="buro-iban"
            className="font-mono"
            placeholder="TR00 0000 0000 0000 0000 0000 00"
            value={iban}
            aria-invalid={Boolean(hata) || undefined}
            onChange={(e) => setIban(e.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={guncelle.isPending || temiz === (buro.iban ?? "")}
          >
            Kaydet
          </Button>
        </div>
        <FieldDescription>
          Ücret borcu hatırlatma mesajında {"{iban}"} olarak gönderilir.
        </FieldDescription>
        <FieldError>{hata}</FieldError>
      </Field>
    </form>
  )
}

export function BuroPage() {
  const buro = useBuro()
  const user = useAuthStore((s) => s.user)
  const yonetici = hasRole(user, ["YONETICI"])

  if (buro.isPending) return <LoadingState />
  if (buro.isError)
    return <ErrorState error={buro.error} onRetry={() => buro.refetch()} />

  const rows = [
    ["Unvan", buro.data.ad],
    ["VKN", buro.data.vkn],
    ["Vergi dairesi", buro.data.vergiDairesi],
    ["Telefon", formatPhone(buro.data.telefon)],
    ["E-posta", buro.data.eposta],
    ["Adres", buro.data.adres],
    ...(yonetici
      ? []
      : [["IBAN", buro.data.iban ? ibanBicimle(buro.data.iban) : "—"]]),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Büro bilgileri</CardTitle>
        <CardDescription>
          Müşteri portalı ve mesaj şablonlarında kullanılır.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {yonetici && <IbanAlani buro={buro.data} />}
      </CardContent>
    </Card>
  )
}
