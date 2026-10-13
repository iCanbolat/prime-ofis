import { Fragment, useEffect } from "react"
import {
  Link,
  Outlet,
  useLocation,
  useMatches,
  useNavigation,
} from "react-router"

import { AppSidebar } from "@/app/layouts/app-sidebar"
import { GlobalSearch } from "@/app/layouts/global-search"
import { ThemeToggle } from "@/app/layouts/theme-toggle"
import { BildirimZili } from "@/features/bildirim/components/bildirim-zili"
import {
  KasaKilitDialog,
  KasaOtomatikKilit,
} from "@/features/kasa/components/kasa-kilidi"
import { getCrumbs } from "@/app/route-handle"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"

function AppBreadcrumb() {
  const crumbs = getCrumbs(useMatches())
  if (crumbs.length === 0) return null

  return (
    <Breadcrumb className="hidden min-w-0 flex-1 md:block">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <Fragment key={crumb.to}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem
                // Sabit etiketler tam görünür; yalnızca dinamik (uzun) başlıklar kısalır
                className={cn(
                  "whitespace-nowrap",
                  typeof crumb.label === "string" ? "shrink-0" : "min-w-0"
                )}
              >
                {isLast ? (
                  <BreadcrumbPage className="truncate">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="truncate"
                    render={<Link to={crumb.to} />}
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** Mobilde bir menü öğesine tıklanınca sidebar sheet'ini kapatır. */
function CloseMobileSidebarOnNavigate() {
  const { pathname } = useLocation()
  const { setOpenMobile } = useSidebar()
  useEffect(() => setOpenMobile(false), [pathname, setOpenMobile])
  return null
}

function NavigationProgress() {
  const navigation = useNavigation()
  if (navigation.state === "idle") return null
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-primary"
    />
  )
}

export function AppLayout() {
  return (
    <SidebarProvider>
      <a
        href="#icerik"
        className="sr-only z-50 rounded-full bg-background px-4 py-2 text-sm font-medium shadow-md ring-3 ring-ring/30 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        İçeriğe geç
      </a>
      <CloseMobileSidebarOnNavigate />
      <KasaOtomatikKilit />
      <KasaKilitDialog />
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 h-4 data-vertical:self-center"
          />
          <AppBreadcrumb />
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 md:flex-none">
            <GlobalSearch />
            <BildirimZili />
            <ThemeToggle />
          </div>
          <NavigationProgress />
        </header>
        <div
          id="icerik"
          tabIndex={-1}
          className="isolate flex min-w-0 flex-1 scroll-mt-14 flex-col gap-6 p-4 outline-none md:p-6"
        >
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
