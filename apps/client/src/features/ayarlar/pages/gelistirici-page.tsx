import { useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Database01Icon, Refresh01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/shared/query-states"
import { useMockDbStats, useResetMockDb } from "@/features/ayarlar/queries"
import { MOCK_MODU } from "@/lib/http"
import {
  getMockErrorPattern,
  isMockDelayEnabled,
  setMockDelayEnabled,
  setMockErrorPattern,
} from "@/mocks/config"

const STAT_LABELS: Record<string, string> = {
  buro: "Büro",
  personel: "Personel",
  mukellef: "Mükellef",
  aktivite: "Aktivite kaydı",
  credential: "Şifre kaydı",
  kasa: "Kasa",
  takvim: "Beyan durumu",
}

function MockDbCard() {
  const stats = useMockDbStats()
  const reset = useResetMockDb()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleReset = () => {
    reset.mutate(undefined, {
      onSuccess: () => {
        setConfirmOpen(false)
        toast.success(
          MOCK_MODU
            ? "Mock veritabanı seed verisine sıfırlandı"
            : "Veritabanı seed verisine sıfırlandı; tekrar giriş yapın"
        )
      },
      onError: (error) => toast.error(error.message),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HugeiconsIcon
            icon={Database01Icon}
            strokeWidth={2}
            className="size-5"
          />
          {MOCK_MODU ? "Mock veritabanı" : "Geliştirme veritabanı"}
        </CardTitle>
        <CardDescription>
          {MOCK_MODU
            ? "Veriler tarayıcıda (localStorage) tutulur. Sıfırlama tüm değişiklikleri siler ve seed verisini yükler."
            : "API veritabanı (DEV_ARACLARI açık). Sıfırlama tüm tabloları, dosyaları ve oturumları siler, seed verisini yükler."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(stats.data ?? {}).map(([key, count]) => (
            <div key={key} className="rounded-2xl border p-3">
              <dt className="text-xs text-muted-foreground">
                {STAT_LABELS[key] ?? key}
              </dt>
              <dd className="text-xl font-semibold tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
      <CardFooter>
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          <HugeiconsIcon
            icon={Refresh01Icon}
            data-icon="inline-start"
            strokeWidth={2}
          />
          Veritabanını sıfırla
        </Button>
      </CardFooter>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Veritabanı sıfırlansın mı?</DialogTitle>
            <DialogDescription>
              Eklediğiniz ve değiştirdiğiniz tüm mock kayıtlar silinecek. Bu
              işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Vazgeç
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={reset.isPending}
            >
              Sıfırla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function MockBehaviourCard() {
  const [errorPattern, setErrorPattern] = useState(
    () => getMockErrorPattern() ?? ""
  )
  const [delayEnabled, setDelayEnabled] = useState(() => isMockDelayEnabled())

  const saveErrorPattern = () => {
    setMockErrorPattern(errorPattern || null)
    toast.success(
      errorPattern
        ? `${errorPattern} istekleri artık 500 dönecek`
        : "Hata simülasyonu kapatıldı"
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API simülasyonu</CardTitle>
        <CardDescription>
          Yükleme ve hata durumlarını test etmek için sahte API davranışını
          değiştirin.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <Field orientation="horizontal">
          <Checkbox
            id="mock-delay"
            checked={delayEnabled}
            onCheckedChange={(checked) => {
              setDelayEnabled(checked)
              setMockDelayEnabled(checked)
            }}
          />
          <FieldLabel htmlFor="mock-delay">
            Ağ gecikmesi (200–600 ms)
          </FieldLabel>
        </Field>
        <Field>
          <FieldLabel htmlFor="mock-error">
            Hata döndürülecek yol öneki
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="mock-error"
              placeholder="/api/mukellefler"
              value={errorPattern}
              onChange={(event) => setErrorPattern(event.target.value)}
            />
            <Button variant="outline" onClick={saveErrorPattern}>
              Kaydet
            </Button>
          </div>
          <FieldDescription>
            Boş bırakıp kaydederseniz hata simülasyonu kapanır.
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  )
}

export function GelistiriciPage() {
  const stats = useMockDbStats()
  if (!MOCK_MODU && stats.isError) {
    return (
      <EmptyState
        icon={Database01Icon}
        title="Geliştirici araçları kapalı"
        description="API'de DEV_ARACLARI=true değil."
      />
    )
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <MockDbCard />
      {MOCK_MODU && <MockBehaviourCard />}
    </div>
  )
}
