import { NavLink, Outlet } from "react-router"

import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"

const SEKMELER = [
  { to: "tahakkuk", label: "Tahakkuk fişleri" },
  { to: "mizan", label: "Mizan" },
  { to: "mukellefler", label: "Mükellefler" },
  { to: "sifreler", label: "Şifreler" },
  { to: "bakiyeler", label: "Ücret ve bakiyeler" },
] as const

export function IceAktarimLayout() {
  return (
    <>
      <PageHeader
        title="İçe Aktarım"
        description="Tahakkuk fişleri ve mizanlar; hızlı başlangıç için mevcut mükellefler, şifreler ve bakiyeler"
      />
      <nav
        aria-label="İçe aktarım bölümleri"
        className="flex flex-wrap gap-1 border-b pb-2"
      >
        {SEKMELER.map((sekme) => (
          <NavLink
            key={sekme.to}
            to={sekme.to}
            className={({ isActive }) =>
              cn(
                "rounded-3xl px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive && "bg-muted text-foreground"
              )
            }
          >
            {sekme.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
