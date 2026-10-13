import { Suspense, lazy, useEffect, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"

const GlobalSearchDialog = lazy(async () => ({
  default: (await import("@/app/layouts/global-search-dialog"))
    .GlobalSearchDialog,
}))

/** ⌘K / Ctrl+K ile açılan arama paleti: sayfalar ve mükellefler. */
export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  // İlk açılıştan sonra bağlı kalır (kapanış animasyonu ve sonraki açılışlar için)
  const [yuklendi, setYuklendi] = useState(false)

  const ac = (deger: boolean) => {
    if (deger) setYuklendi(true)
    setOpen(deger)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setYuklendi(true)
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      <Button
        variant="outline"
        className="min-w-0 flex-1 justify-start text-muted-foreground sm:w-64 sm:flex-none"
        onClick={() => ac(true)}
      >
        <HugeiconsIcon
          icon={Search01Icon}
          data-icon="inline-start"
          strokeWidth={2}
        />
        <span className="flex-1 text-left">Ara…</span>
        <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
      </Button>

      {yuklendi && (
        <Suspense fallback={null}>
          <GlobalSearchDialog open={open} onOpenChange={ac} />
        </Suspense>
      )}
    </>
  )
}
