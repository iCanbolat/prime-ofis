import { useState, type ReactNode } from "react"
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  DEFTER_TURU_ETIKET,
  ETIKET_ONERILERI,
  KDV_PERIYODU_ETIKET,
  MUKELLEF_TUR_ACIKLAMA,
  VERGI_DAIRESI_ONERILERI,
} from "@/features/mukellef/constants"
import { PersonelSelect } from "@/features/mukellef/components/personel-select"
import {
  FORM_ADIMLARI,
  mukellefFormSchema,
  type MukellefFormValues,
} from "@prime/shared/mukellef/schemas"
import { ApiError } from "@/lib/http"
import { cn } from "@/lib/utils"
import {
  MUKELLEF_TUR_ETIKET,
  type DefterTuru,
  type KdvPeriyodu,
  type MukellefTur,
} from "@prime/shared/types/domain"

type Errors = FieldErrors<MukellefFormValues>

interface StepProps {
  register: UseFormRegister<MukellefFormValues>
  control: Control<MukellefFormValues>
  errors: Errors
}

/** Etiket + input + hata mesajı: aria-invalid ve aria-describedby bağlantıları tek yerde. */
function FormAlani({
  name,
  label,
  errors,
  description,
  children,
}: {
  name: keyof MukellefFormValues
  label: string
  errors: Errors
  description?: ReactNode
  children: ReactNode
}) {
  const error = errors[name]
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      {children}
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError id={`${name}-hata`} errors={error ? [error] : undefined} />
    </Field>
  )
}

const inputProps = (name: keyof MukellefFormValues, errors: Errors) => ({
  id: name,
  "aria-invalid": Boolean(errors[name]) || undefined,
  "aria-describedby": errors[name] ? `${name}-hata` : undefined,
})

// --- Adım 1 ------------------------------------------------------------------

function TurSecimi({ control }: { control: Control<MukellefFormValues> }) {
  return (
    <Controller
      control={control}
      name="tur"
      render={({ field }) => (
        <FieldSet>
          <FieldLegend>Mükellef türü</FieldLegend>
          <div
            role="radiogroup"
            aria-label="Mükellef türü"
            className="grid gap-2 sm:grid-cols-3"
          >
            {(Object.keys(MUKELLEF_TUR_ETIKET) as MukellefTur[]).map((tur) => {
              const secili = field.value === tur
              return (
                <button
                  key={tur}
                  type="button"
                  role="radio"
                  aria-checked={secili}
                  onClick={() => field.onChange(tur)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-2xl border p-3 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
                    secili ? "border-primary bg-primary/5" : "hover:bg-muted"
                  )}
                >
                  <span className="font-medium">
                    {MUKELLEF_TUR_ETIKET[tur]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {MUKELLEF_TUR_ACIKLAMA[tur]}
                  </span>
                </button>
              )
            })}
          </div>
        </FieldSet>
      )}
    />
  )
}

function KimlikAdimi({ register, control, errors }: StepProps) {
  const tur = useWatch({ control, name: "tur" })
  const isSahis = tur === "SAHIS"

  return (
    <FieldGroup>
      <TurSecimi control={control} />
      <FormAlani
        name="unvan"
        label={isSahis ? "Ad soyad" : "Unvan"}
        errors={errors}
      >
        <Input
          {...register("unvan")}
          {...inputProps("unvan", errors)}
          autoComplete="off"
        />
      </FormAlani>
      {isSahis ? (
        <FormAlani name="tckn" label="TCKN" errors={errors}>
          <Input
            {...register("tckn")}
            {...inputProps("tckn", errors)}
            inputMode="numeric"
            maxLength={11}
            autoComplete="off"
          />
        </FormAlani>
      ) : (
        <>
          <FormAlani name="vkn" label="VKN" errors={errors}>
            <Input
              {...register("vkn")}
              {...inputProps("vkn", errors)}
              inputMode="numeric"
              maxLength={10}
              autoComplete="off"
            />
          </FormAlani>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormAlani
              name="ticaretSicilNo"
              label="Ticaret sicil no"
              errors={errors}
            >
              <Input
                {...register("ticaretSicilNo")}
                {...inputProps("ticaretSicilNo", errors)}
              />
            </FormAlani>
            <FormAlani name="mersisNo" label="MERSİS no" errors={errors}>
              <Input
                {...register("mersisNo")}
                {...inputProps("mersisNo", errors)}
                inputMode="numeric"
                maxLength={16}
              />
            </FormAlani>
          </div>
        </>
      )}
      <FormAlani name="vergiDairesi" label="Vergi dairesi" errors={errors}>
        <Input
          {...register("vergiDairesi")}
          {...inputProps("vergiDairesi", errors)}
          list="vergi-daireleri"
        />
        <datalist id="vergi-daireleri">
          {VERGI_DAIRESI_ONERILERI.map((vd) => (
            <option key={vd} value={vd} />
          ))}
        </datalist>
      </FormAlani>
    </FieldGroup>
  )
}

// --- Adım 2 ------------------------------------------------------------------

function IletisimAdimi({ register, control, errors }: StepProps) {
  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormAlani
          name="telefon"
          label="Telefon (WhatsApp)"
          errors={errors}
          description="WhatsApp mesajları bu numaraya gönderilir."
        >
          <Input
            {...register("telefon")}
            {...inputProps("telefon", errors)}
            type="tel"
            placeholder="0532 123 45 67"
          />
        </FormAlani>
        <FormAlani name="eposta" label="E-posta" errors={errors}>
          <Input
            {...register("eposta")}
            {...inputProps("eposta", errors)}
            type="email"
          />
        </FormAlani>
      </div>
      <Field>
        <FieldLabel htmlFor="tercih-kanal-etiket">Mesaj kanalı</FieldLabel>
        <Controller
          control={control}
          name="tercihKanal"
          render={({ field }) => (
            <Select
              items={{ WHATSAPP: "WhatsApp", EPOSTA: "E-posta" }}
              value={field.value}
              onValueChange={(v) => v && field.onChange(v)}
            >
              <SelectTrigger id="tercih-kanal-etiket" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                <SelectItem value="EPOSTA">E-posta</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <FieldDescription>
          Tahakkuk ve borç hatırlatma gibi toplu gönderimlerde kullanılır.
        </FieldDescription>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormAlani name="il" label="İl" errors={errors}>
          <Input {...register("il")} {...inputProps("il", errors)} />
        </FormAlani>
        <FormAlani name="ilce" label="İlçe" errors={errors}>
          <Input {...register("ilce")} {...inputProps("ilce", errors)} />
        </FormAlani>
      </div>
      <FormAlani name="adres" label="Adres" errors={errors}>
        <Textarea
          {...register("adres")}
          {...inputProps("adres", errors)}
          rows={3}
        />
      </FormAlani>
    </FieldGroup>
  )
}

// --- Adım 3 ------------------------------------------------------------------

function OnayKutusu({
  control,
  name,
  label,
  errors,
  description,
}: {
  control: Control<MukellefFormValues>
  name: "kdvMukellefi" | "sgkIsyeriVar" | "eDefterMukellefi" | "aktif"
  label: string
  errors: Errors
  description?: string
}) {
  const error = errors[name]
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field
          orientation="horizontal"
          data-invalid={Boolean(error) || undefined}
        >
          <Checkbox
            id={name}
            checked={field.value}
            onCheckedChange={field.onChange}
            aria-invalid={Boolean(error) || undefined}
          />
          <div className="grid gap-1">
            <FieldLabel htmlFor={name}>{label}</FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
            <FieldError errors={error ? [error] : undefined} />
          </div>
        </Field>
      )}
    />
  )
}

function VergiAdimi({ register, control, errors }: StepProps) {
  const tur = useWatch({ control, name: "tur" })
  const isSahis = tur === "SAHIS"

  return (
    <FieldGroup>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <FormAlani name="naceKodu" label="NACE kodu" errors={errors}>
          <Input
            {...register("naceKodu")}
            {...inputProps("naceKodu", errors)}
            placeholder="62.01.01"
          />
        </FormAlani>
        <FormAlani name="faaliyet" label="Faaliyet konusu" errors={errors}>
          <Input
            {...register("faaliyet")}
            {...inputProps("faaliyet", errors)}
          />
        </FormAlani>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="defterTuru"
          render={({ field }) => (
            <FormAlani
              name="defterTuru"
              label="Defter türü"
              errors={errors}
              description={
                isSahis
                  ? undefined
                  : "Sermaye şirketleri bilanço esasına tabidir."
              }
            >
              <Select
                items={DEFTER_TURU_ETIKET}
                value={isSahis ? field.value : "BILANCO"}
                onValueChange={(v) => field.onChange(v as DefterTuru)}
                disabled={!isSahis}
              >
                <SelectTrigger id="defterTuru" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DEFTER_TURU_ETIKET) as DefterTuru[]).map(
                    (d) => (
                      <SelectItem key={d} value={d}>
                        {DEFTER_TURU_ETIKET[d]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </FormAlani>
          )}
        />
        <Controller
          control={control}
          name="kdvPeriyodu"
          render={({ field }) => (
            <FormAlani
              name="kdvPeriyodu"
              label="KDV beyan dönemi"
              errors={errors}
            >
              <Select
                items={KDV_PERIYODU_ETIKET}
                value={field.value}
                onValueChange={(v) => field.onChange(v as KdvPeriyodu)}
              >
                <SelectTrigger
                  id="kdvPeriyodu"
                  className="w-full"
                  aria-invalid={Boolean(errors.kdvPeriyodu) || undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(KDV_PERIYODU_ETIKET) as KdvPeriyodu[]).map(
                    (p) => (
                      <SelectItem key={p} value={p}>
                        {KDV_PERIYODU_ETIKET[p]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </FormAlani>
          )}
        />
      </div>

      <FormAlani name="calisanSayisi" label="Çalışan sayısı" errors={errors}>
        <Input
          {...register("calisanSayisi", { valueAsNumber: true })}
          {...inputProps("calisanSayisi", errors)}
          type="number"
          min={0}
          className="w-32"
        />
      </FormAlani>

      <OnayKutusu
        control={control}
        name="kdvMukellefi"
        label="KDV mükellefi"
        errors={errors}
      />
      <OnayKutusu
        control={control}
        name="sgkIsyeriVar"
        label="SGK işyeri kaydı var"
        description="Muhtasar ve prim hizmet beyannamesi takibi için gereklidir."
        errors={errors}
      />
      <OnayKutusu
        control={control}
        name="eDefterMukellefi"
        label="e-Defter mükellefi"
        errors={errors}
      />
    </FieldGroup>
  )
}

// --- Adım 4 ------------------------------------------------------------------

function SorumluAdimi({ control, errors }: StepProps) {
  return (
    <FieldGroup>
      <Controller
        control={control}
        name="sorumluPersonelId"
        render={({ field }) => (
          <FormAlani
            name="sorumluPersonelId"
            label="Sorumlu personel"
            errors={errors}
          >
            <PersonelSelect
              id="sorumluPersonelId"
              value={field.value}
              onValueChange={field.onChange}
              aria-invalid={Boolean(errors.sorumluPersonelId) || undefined}
              className="w-full sm:w-72"
            />
          </FormAlani>
        )}
      />
      <Controller
        control={control}
        name="etiketler"
        render={({ field }) => (
          <FieldSet>
            <FieldLegend variant="label">Etiketler</FieldLegend>
            <ToggleGroup
              multiple
              variant="outline"
              size="sm"
              aria-label="Etiketler"
              className="flex-wrap"
              value={field.value}
              onValueChange={(value) => field.onChange(value as string[])}
            >
              {ETIKET_ONERILERI.map((etiket) => (
                <ToggleGroupItem key={etiket} value={etiket}>
                  {etiket}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FieldSet>
        )}
      />
      <OnayKutusu
        control={control}
        name="aktif"
        label="Aktif mükellef"
        description="Pasif mükellefler listede varsayılan olarak gizlenir ve takvim/görev üretimine dahil edilmez."
        errors={errors}
      />
    </FieldGroup>
  )
}

const ADIM_BILESENLERI = [KimlikAdimi, IletisimAdimi, VergiAdimi, SorumluAdimi]

// --- Form --------------------------------------------------------------------

interface MukellefFormProps {
  defaultValues: MukellefFormValues
  onSubmit: (values: MukellefFormValues) => Promise<unknown>
  submitLabel: string
  /** Düzenlemede tüm adımlar serbestçe gezilebilir. */
  mode: "create" | "edit"
  onCancel: () => void
}

export function MukellefForm({
  defaultValues,
  onSubmit,
  submitLabel,
  mode,
  onCancel,
}: MukellefFormProps) {
  const [adim, setAdim] = useState(0)
  const [enUzakAdim, setEnUzakAdim] = useState(
    mode === "edit" ? FORM_ADIMLARI.length - 1 : 0
  )
  const [sunucuHatasi, setSunucuHatasi] = useState<string | null>(null)

  const form = useForm<MukellefFormValues>({
    resolver: zodResolver(mukellefFormSchema),
    defaultValues,
    mode: "onTouched",
  })
  const { register, control, handleSubmit, trigger, setError, formState } = form
  const sonAdim = adim === FORM_ADIMLARI.length - 1
  const AdimBileseni = ADIM_BILESENLERI[adim]

  const adimaGit = (hedef: number) => {
    setAdim(hedef)
    setEnUzakAdim((onceki) => Math.max(onceki, hedef))
  }

  const ileri = async () => {
    const gecerli = await trigger([...FORM_ADIMLARI[adim].alanlar], {
      shouldFocus: true,
    })
    if (gecerli) adimaGit(adim + 1)
  }

  const gonder = handleSubmit(
    async (values) => {
      setSunucuHatasi(null)
      try {
        await onSubmit(values)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Kayıt başarısız"
        if (error instanceof ApiError && error.status === 409) {
          setError(values.tur === "SAHIS" ? "tckn" : "vkn", { message })
          setAdim(0)
        }
        setSunucuHatasi(message)
      }
    },
    (errors) => {
      // Hatalı alanın bulunduğu ilk adıma dön
      const hataliAdim = FORM_ADIMLARI.findIndex((a) =>
        a.alanlar.some((alan) => alan in errors)
      )
      if (hataliAdim >= 0) setAdim(hataliAdim)
    }
  )

  return (
    <Card>
      <form
        noValidate
        onSubmit={(event) => {
          // Son adım dışında Enter tuşu formu göndermesin, sonraki adıma geçsin
          if (!sonAdim) {
            event.preventDefault()
            void ileri()
            return
          }
          void gonder(event)
        }}
        aria-label="Mükellef formu"
      >
        <CardContent className="grid gap-6">
          <ol
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            aria-label="Form adımları"
          >
            {FORM_ADIMLARI.map((a, i) => {
              const tamamlandi = i < adim
              const gidilebilir = i <= enUzakAdim
              return (
                <li key={a.baslik}>
                  <button
                    type="button"
                    disabled={!gidilebilir}
                    aria-current={i === adim ? "step" : undefined}
                    onClick={() => setAdim(i)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-xs font-medium transition-colors disabled:opacity-50",
                      i === adim
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                        (tamamlandi || i === adim) &&
                          "border-primary bg-primary text-primary-foreground"
                      )}
                    >
                      {tamamlandi ? (
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          strokeWidth={3}
                          className="size-3"
                        />
                      ) : (
                        i + 1
                      )}
                    </span>
                    {a.baslik}
                  </button>
                </li>
              )
            })}
          </ol>

          <section aria-label={FORM_ADIMLARI[adim].baslik}>
            <h2 className="mb-4 font-heading text-lg font-medium">
              {FORM_ADIMLARI[adim].baslik}
            </h2>
            <AdimBileseni
              register={register}
              control={control}
              errors={formState.errors}
            />
          </section>

          {sunucuHatasi && (
            <Alert variant="destructive">
              <AlertDescription>{sunucuHatasi}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        <CardFooter className="justify-between gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Vazgeç
          </Button>
          <div className="flex gap-2">
            {adim > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdim(adim - 1)}
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  data-icon="inline-start"
                  strokeWidth={2}
                />
                Geri
              </Button>
            )}
            {sonAdim ? (
              <Button type="submit" disabled={formState.isSubmitting}>
                {submitLabel}
              </Button>
            ) : (
              <>
                {mode === "edit" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void gonder()}
                  >
                    {submitLabel}
                  </Button>
                )}
                <Button type="submit">
                  İleri
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    data-icon="inline-end"
                    strokeWidth={2}
                  />
                </Button>
              </>
            )}
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}
