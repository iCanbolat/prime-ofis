import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon, Moon02Icon, Sun01Icon } from "@hugeicons/core-free-icons"

import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const OPTIONS = [
  { value: "light", label: "Açık", icon: Sun01Icon },
  { value: "dark", label: "Koyu", icon: Moon02Icon },
  { value: "system", label: "Sistem", icon: ComputerIcon },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="Tema seç" />}
      >
        <HugeiconsIcon
          icon={Sun01Icon}
          strokeWidth={2}
          className="dark:hidden"
        />
        <HugeiconsIcon
          icon={Moon02Icon}
          strokeWidth={2}
          className="hidden dark:block"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) =>
            setTheme(value as (typeof OPTIONS)[number]["value"])
          }
        >
          {OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <HugeiconsIcon icon={option.icon} strokeWidth={2} />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
