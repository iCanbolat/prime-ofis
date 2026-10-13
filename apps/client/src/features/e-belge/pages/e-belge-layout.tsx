import { Link, NavLink, Outlet } from "react-router"
import { formatDistanceToNow } from "date-fns"
import { tr } from "date-fns/locale"

import { PageHeader } from "@/components/shared/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { SenkronButonu } from "@/features/e-belge/components/senkron-butonu"
import { useEBelgeOzet } from "@/features/e-belge/queries"
import { cn } from "@/lib/utils"

const SEKMELER = [
  { to: "e-fatura", label: "e-Fatura" },
  { to: "e-arsiv", label: "e-Arşiv" },
  { to: "e-defter", label: "e-Defter" },
  { to: "kontor", label: "Kontör" },
  { to: "baglantilar", label: "Bağlantılar" },
] as const

export function EBelgeLayout() {
  const ozet = useEBelgeOzet()
  const sonSenkron = ozet.data?.sonSenkron

  return (
    <>
      <PageHeader
        title="e-Belge"
        description={
          <>
            Luca e-Entegratör üzerinden e-Fatura, e-Arşiv ve e-Defter berat
            takibi
            {sonSenkron && (
              <>
                {" · "}Son senkron{" "}
                {formatDistanceToNow(new Date(sonSenkron), {
                  addSuffix: true,
                  locale: tr,
                })}
              </>
            )}
          </>
        }
        actions={<SenkronButonu />}
      />

      {ozet.data && ozet.data.baglantiHatasi > 0 && (
        <Alert variant="destructive">
          <AlertTitle>
            {ozet.data.baglantiHatasi} mükellefin Luca bağlantısı hatalı
          </AlertTitle>
          <AlertDescription>
            Bu mükelleflerin faturaları senkronize edilemiyor.{" "}
            <Link to="baglantilar?durum=HATA" className="underline">
              Bağlantıları görüntüle
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {ozet.data?.kontorDusuk && (
        <Alert variant="destructive">
          <AlertTitle>
            {ozet.data.kontorKalan <= 0
              ? "Luca kontörü bitti"
              : `Luca kontörü azalıyor: ${ozet.data.kontorKalan.toLocaleString("tr-TR")} kaldı`}
          </AlertTitle>
          <AlertDescription>
            Kontör bitince e-belge gönderilemez ve alınamaz.{" "}
            <Link to="kontor" className="underline">
              Kontör durumunu görüntüle
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <nav
        aria-label="e-Belge bölümleri"
        className="flex flex-wrap gap-1 border-b pb-2"
      >
        {SEKMELER.map((sekme) => (
          <NavLink
            key={sekme.to}
            to={sekme.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-1.5 rounded-3xl px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive && "bg-muted text-foreground"
              )
            }
          >
            {sekme.label}
            {sekme.to === "e-fatura" && !!ozet.data?.yanitBekleyen && (
              <span
                className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums"
                aria-label={`${ozet.data.yanitBekleyen} yanıt bekleyen fatura`}
              >
                {ozet.data.yanitBekleyen}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
