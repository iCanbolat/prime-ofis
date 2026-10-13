import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserIcon } from "@hugeicons/core-free-icons"

import { NAV_ITEMS } from "@/app/navigation"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useMukellefList } from "@/features/mukellef/queries"
import { MUKELLEF_TUR_ETIKET } from "@prime/shared/types/domain"

/**
 * Arama paletinin içeriği. `cmdk` (ve bağımlılıkları) ile tam mükellef listesi yalnızca
 * palet ilk kez açıldığında yüklensin diye `GlobalSearch` tarafından tembel yüklenir.
 */
export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const { data } = useMukellefList()

  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Arama"
      description="Sayfa veya mükellef arayın"
    >
      <Command>
        <CommandInput autoFocus placeholder="Sayfa veya mükellef ara…" />
        <CommandList>
          <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>
          <CommandGroup heading="Sayfalar">
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.to}
                value={item.title}
                keywords={item.keywords}
                onSelect={() => go(item.to)}
              >
                <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                {item.title}
              </CommandItem>
            ))}
          </CommandGroup>
          {data && data.items.length > 0 && (
            <CommandGroup heading="Mükellefler">
              {data.items.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.unvan} ${m.id}`}
                  keywords={[m.vkn ?? "", m.tckn ?? ""].filter(Boolean)}
                  onSelect={() => go(`/mukellefler/${m.id}`)}
                >
                  <HugeiconsIcon icon={UserIcon} strokeWidth={2} />
                  <span className="truncate">{m.unvan}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {MUKELLEF_TUR_ETIKET[m.tur]}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
