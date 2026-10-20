import { NavLink, Outlet } from "react-router"

import { PageHeader } from "@/components/shared/page-header"
import { useDevAraclari } from "@/features/ayarlar/queries"
import { hasRole, useAuthStore } from "@/features/auth/store"
import { cn } from "@/lib/utils"
import type { Rol } from "@prime/shared/types/domain"

const TABS: { to: string; label: string; roles?: Rol[]; dev?: true }[] = [
  { to: "buro", label: "Büro" },
  { to: "personel", label: "Personel", roles: ["YONETICI"] },
  { to: "sablonlar", label: "Mesaj Şablonları", roles: ["YONETICI"] },
  { to: "kanallar", label: "Kanallar", roles: ["YONETICI"] },
  { to: "luca", label: "Luca Aktarımı", roles: ["YONETICI"] },
  { to: "luca-hesap", label: "Luca Hesabı", roles: ["YONETICI"] },
  { to: "bildirimler", label: "Bildirimlerim" },
  { to: "gonderimler", label: "Gönderim Geçmişi", roles: ["YONETICI"] },
  { to: "gelistirici", label: "Geliştirici", dev: true },
]

export function AyarlarLayout() {
  const user = useAuthStore((s) => s.user)
  const devAraclari = useDevAraclari()
  const tabs = TABS.filter(
    (tab) =>
      (!tab.roles || hasRole(user, tab.roles)) && (!tab.dev || devAraclari)
  )

  return (
    <>
      <PageHeader
        title="Ayarlar"
        description="Büro bilgileri, personel, gönderim kanalları ve uygulama tercihleri"
      />
      <nav
        aria-label="Ayarlar bölümleri"
        className="flex flex-wrap gap-1 border-b pb-2"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "rounded-3xl px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive && "bg-muted text-foreground"
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
