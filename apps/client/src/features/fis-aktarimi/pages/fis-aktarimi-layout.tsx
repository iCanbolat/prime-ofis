import { NavLink, Outlet } from "react-router"

import { PageHeader } from "@/components/shared/page-header"
import { Badge } from "@/components/ui/badge"
import { useFisSayac } from "@/features/fis-aktarimi/queries"
import { cn } from "@/lib/utils"

export function FisAktarimiLayout() {
  const sayac = useFisSayac()
  const sekmeler = [
    {
      to: "taslaklar",
      label: "Taslaklar",
      sayi: (sayac.data?.taslak ?? 0) + (sayac.data?.hatali ?? 0),
    },
    { to: "hazir", label: "Aktarıma hazır", sayi: sayac.data?.hazir ?? 0 },
    { to: "aktarimlar", label: "Aktarımlar", sayi: 0 },
  ]
  return (
    <>
      <PageHeader
        title="Fiş Aktarımı"
        description="Portaldan gelen fiş ve banka ekstreleri okunur, muhasebe fişine dönüşür; onaylananlar Luca Excel aktarım dosyası olarak indirilir."
      />
      <nav
        aria-label="Fiş aktarımı bölümleri"
        className="flex flex-wrap gap-1 border-b pb-2"
      >
        {sekmeler.map((sekme) => (
          <NavLink
            key={sekme.to}
            to={sekme.to}
            className={({ isActive }) =>
              cn(
                "inline-flex items-center gap-1.5 rounded-3xl px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive && "bg-muted text-foreground"
              )
            }
          >
            {sekme.label}
            {sekme.sayi > 0 && (
              <Badge variant="secondary" className="tabular-nums">
                {sekme.sayi}
              </Badge>
            )}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
