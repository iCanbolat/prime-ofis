/**
 * shadcn Date Picker kalıbı (Popover + Calendar). Değerler `lib/tarih` ile uyumlu
 * string olarak taşınır: gün için "yyyy-MM-dd", ay için "yyyy-MM".
 */
import { useState } from "react"
import { format } from "date-fns"
import { tr as trFns } from "date-fns/locale"
import { tr } from "react-day-picker/locale"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
} from "@hugeicons/core-free-icons"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { fromYmd, toYmd } from "@prime/shared/lib/tarih"

interface PickerTriggerProps {
  id?: string
  "aria-label"?: string
  "aria-invalid"?: boolean
  disabled?: boolean
  size?: "default" | "sm"
  className?: string
}

function triggerProps({
  size = "default",
  className,
  bos,
  ...props
}: PickerTriggerProps & { bos: boolean }) {
  return {
    ...props,
    variant: "outline" as const,
    size,
    "data-empty": bos,
    className: cn(
      "w-full justify-between font-normal data-[empty=true]:text-muted-foreground",
      className
    ),
  }
}

interface DatePickerProps extends PickerTriggerProps {
  /** "yyyy-MM-dd" veya boş string */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Seçimi kaldırma düğmesi gösterilir */
  clearable?: boolean
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Tarih seçin",
  clearable = false,
  ...trigger
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const secili = value ? fromYmd(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button {...triggerProps({ ...trigger, bos: !secili })} />}
      >
        <span className="truncate">
          {secili
            ? format(secili, "d MMMM yyyy", { locale: trFns })
            : placeholder}
        </span>
        <HugeiconsIcon
          icon={Calendar03Icon}
          strokeWidth={2}
          data-icon="inline-end"
          className="text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto gap-0 p-0" align="start">
        <Calendar
          mode="single"
          locale={tr}
          selected={secili}
          defaultMonth={secili}
          onSelect={(date) => {
            if (!date) return
            onChange(toYmd(date))
            setOpen(false)
          }}
        />
        {clearable && secili && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                onChange("")
                setOpen(false)
              }}
            >
              Temizle
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

const AYLAR = Array.from({ length: 12 }, (_, i) =>
  format(new Date(2000, i, 1), "LLL", { locale: trFns })
)

interface MonthPickerProps extends PickerTriggerProps {
  /** "yyyy-MM" veya boş string */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  clearable?: boolean
}

/** Ay seçici: shadcn Date Picker ile aynı Popover kalıbı, gün yerine ay ızgarası */
export function MonthPicker({
  value,
  onChange,
  placeholder = "Ay seçin",
  clearable = false,
  ...trigger
}: MonthPickerProps) {
  const [open, setOpen] = useState(false)
  const secili = /^\d{4}-\d{2}$/.test(value)
    ? fromYmd(`${value}-01`)
    : undefined
  const [yil, setYil] = useState(() => (secili ?? new Date()).getFullYear())

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setYil((secili ?? new Date()).getFullYear())
      }}
    >
      <PopoverTrigger
        render={<Button {...triggerProps({ ...trigger, bos: !secili })} />}
      >
        <span className="truncate">
          {secili
            ? format(secili, "LLLL yyyy", { locale: trFns })
            : placeholder}
        </span>
        <HugeiconsIcon
          icon={Calendar03Icon}
          strokeWidth={2}
          data-icon="inline-end"
          className="text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent className="w-64 gap-3 p-3" align="start">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Önceki yıl"
            onClick={() => setYil((y) => y - 1)}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          </Button>
          <span className="text-sm font-medium">{yil}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Sonraki yıl"
            onClick={() => setYil((y) => y + 1)}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {AYLAR.map((ad, i) => {
            const deger = `${yil}-${String(i + 1).padStart(2, "0")}`
            const aktif = deger === value
            return (
              <Button
                key={deger}
                variant={aktif ? "default" : "ghost"}
                size="sm"
                aria-pressed={aktif}
                onClick={() => {
                  onChange(deger)
                  setOpen(false)
                }}
              >
                {ad}
              </Button>
            )
          })}
        </div>
        {clearable && secili && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange("")
              setOpen(false)
            }}
          >
            Temizle
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
