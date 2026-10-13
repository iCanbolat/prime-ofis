import { NavLink, Outlet } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { FileImportIcon } from "@hugeicons/core-free-icons"

import { ButtonLink } from "@/components/shared/button-link"
import { PageHeader } from "@/components/shared/page-header"
import { useAuthStore } from "@/features/auth/store"
import { cn } from "@/lib/utils"

const SEKMELER = [
  { to: "ozet", label: "Özet" },
  { to: "cari", label: "Cari hesaplar" },
  { to: "kesinti", label: "Kesinti kontrolü" },
] as const

export function TahsilatLayout() {
  const yonetici = useAuthStore((s) => s.user?.rol === "YONETICI")
  return (
    <>
      <PageHeader
        title="Tahsilat"
        description="Mükelleflerden alınacak hizmet bedelleri, ödemeler ve SMMM stopaj kesintileri"
        actions={
          yonetici && (
            <ButtonLink variant="outline" to="/ice-aktarim/bakiyeler">
              <HugeiconsIcon
                icon={FileImportIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              <span className="hidden sm:inline">
                Ücret ve bakiyeleri içe aktar
              </span>
              <span className="sm:hidden">İçe aktar</span>
            </ButtonLink>
          )
        }
      />
      <nav
        aria-label="Tahsilat bölümleri"
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
