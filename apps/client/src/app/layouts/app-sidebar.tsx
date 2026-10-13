import { NavLink, useLocation } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Briefcase01Icon } from "@hugeicons/core-free-icons"

import { NAV_GROUPS, isNavItemActive } from "@/app/navigation"
import { useBuro } from "@/features/ayarlar/queries"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { UserMenu } from "@/app/layouts/user-menu"
import { useEBelgeOzet } from "@/features/e-belge/queries"
import { useGelenSayac } from "@/features/evrak-talebi/queries"
import { useFisSayac } from "@/features/fis-aktarimi/queries"
import { useTebligatOzet } from "@/features/tebligat/queries"
import { useBorcOzet } from "@/features/borc/queries"

const SAYAC_ETIKET = {
  gelenEvrak: "inceleme bekleyen evrak",
  yanitBekleyen: "yanıt bekleyen fatura",
  acikTebligat: "açık e-Tebligat",
  fisTaslak: "onay bekleyen fiş",
  kamuDogrulama: "doğrulama bekleyen GİB / SGK girişi",
} as const

export function AppSidebar() {
  const { pathname } = useLocation()
  const { data: buro } = useBuro()
  const gelen = useGelenSayac()
  const eBelge = useEBelgeOzet()
  const tebligat = useTebligatOzet()
  const fis = useFisSayac()
  const borc = useBorcOzet()
  const sayaclar = {
    kamuDogrulama: borc.data?.dogrulamaBekleyen ?? 0,
    fisTaslak: fis.data?.taslak ?? 0,
    acikTebligat: tebligat.data?.acik ?? 0,
    gelenEvrak: gelen.data?.bekleyen ?? 0,
    yanitBekleyen: eBelge.data?.yanitBekleyen ?? 0,
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<NavLink to="/" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <HugeiconsIcon
                  icon={Briefcase01Icon}
                  strokeWidth={2}
                  className="size-4"
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Prime Ofis</span>
                <span className="truncate text-xs text-muted-foreground">
                  {buro?.ad ?? "Muhasebe Bürosu"}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={isNavItemActive(item, pathname)}
                      tooltip={item.title}
                      render={<NavLink to={item.to} end={item.to === "/"} />}
                    >
                      <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {item.sayac && sayaclar[item.sayac] > 0 && (
                      <SidebarMenuBadge
                        aria-label={`${sayaclar[item.sayac]} ${SAYAC_ETIKET[item.sayac]}`}
                        className="bg-primary text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-active/menu-button:text-primary-foreground"
                      >
                        {sayaclar[item.sayac]}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
