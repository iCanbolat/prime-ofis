import { useId, useRef, useState, type DragEvent } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CloudUploadIcon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"

interface FileDropzoneProps {
  /** `<input accept>` değeri */
  accept?: string
  multiple?: boolean
  disabled?: boolean
  /** Seçilen / bırakılan dosyalar (doğrulama çağıran tarafta yapılır) */
  onFiles: (files: File[]) => void
  hint?: string
  className?: string
}

/** Sürükle-bırak veya tıklayarak dosya seçme alanı. Klavyeyle de kullanılabilir. */
export function FileDropzone({
  accept,
  multiple = true,
  disabled,
  onFiles,
  hint,
  className,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [surukleniyor, setSurukleniyor] = useState(false)

  const teslim = (list: FileList | null) => {
    const files = Array.from(list ?? [])
    if (files.length) onFiles(multiple ? files : files.slice(0, 1))
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setSurukleniyor(false)
    if (!disabled) teslim(event.dataTransfer.files)
  }

  return (
    <label
      htmlFor={inputId}
      data-dragging={surukleniyor || undefined}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setSurukleniyor(true)
      }}
      onDragLeave={() => setSurukleniyor(false)}
      onDrop={onDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/30 px-6 py-8 text-center transition-colors hover:bg-muted/60 has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50 data-dragging:border-primary data-dragging:bg-primary/5",
        disabled && "pointer-events-none opacity-50",
        className
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-background ring-1 ring-border">
        <HugeiconsIcon
          icon={CloudUploadIcon}
          strokeWidth={2}
          className="size-5"
        />
      </span>
      <span className="text-sm font-medium">
        Dosyaları sürükleyip bırakın veya{" "}
        <span className="text-link">seçin</span>
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        aria-label="Dosya seç"
        onChange={(e) => {
          teslim(e.target.files)
          e.target.value = ""
        }}
      />
    </label>
  )
}
