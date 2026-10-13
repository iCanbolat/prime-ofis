import { useState } from "react"
import { NavLink, Outlet, useNavigate, useParams } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  FileNotFoundIcon,
  PencilEdit02Icon,
  Task01Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { ButtonLink } from "@/components/shared/button-link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { usePersonelList } from "@/features/auth/queries"
import {
  TalepOlusturDialog,
  type TalepHedef,
} from "@/features/evrak-talebi/components/talep-olustur-dialog"
import {
  GorevFormDialog,
  type GorevHedef,
} from "@/features/gorev/components/gorev-form-dialog"
import {
  AktifBadge,
  MukellefTurBadge,
} from "@/features/mukellef/components/mukellef-badges"
import { useMukellef } from "@/features/mukellef/queries"
import { ApiError } from "@/lib/http"
import { cn } from "@/lib/utils"
import {
  MUKELLEF_SEKMELERI,
  type MukellefKartContext,
} from "@/features/mukellef/pages/mukellef-kart-context"

export function MukellefKartLayout() {
  const { id = "" } = useParams()
  const mukellef = useMukellef(id)
  const [talepHedef, setTalepHedef] = useState<TalepHedef | null>(null)
  const [gorevHedef, setGorevHedef] = useState<GorevHedef | null>(null)
  const navigate = useNavigate()
  const personel = usePersonelList()

  if (mukellef.isPending) return <LoadingState />
  if (mukellef.isError) {
    if (mukellef.error instanceof ApiError && mukellef.error.status === 404) {
      return (
        <EmptyState
          icon={FileNotFoundIcon}
          title="Mükellef bulunamadı"
          description="Kayıt silinmiş veya bağlantı hatalı olabilir."
          action={
            <ButtonLink variant="outline" to="/mukellefler">
              Mükellef listesine dön
            </ButtonLink>
          }
        />
      )
    }
    return (
      <ErrorState error={mukellef.error} onRetry={() => mukellef.refetch()} />
    )
  }

  const m = mukellef.data
  const sorumlu = personel.data?.find((p) => p.id === m.sorumluPersonelId)

  return (
    <>
      <Card size="sm">
        <CardContent className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid min-w-0 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <MukellefTurBadge tur={m.tur} />
              <AktifBadge aktif={m.aktif} />
              {m.etiketler.map((e) => (
                <span key={e} className="text-xs text-muted-foreground">
                  #{e}
                </span>
              ))}
            </div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {m.unvan}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                {m.tur === "SAHIS" ? "TCKN" : "VKN"}:{" "}
                <span className="font-mono text-foreground tabular-nums">
                  {m.vkn ?? m.tckn}
                </span>
              </span>
              <span>{m.vergiDairesi} VD</span>
              {sorumlu && (
                <span className="flex items-center gap-1.5">
                  <PersonelAvatar personel={sorumlu} size="sm" />
                  {sorumlu.ad} {sorumlu.soyad}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTalepHedef({ mukellefId: m.id })}
            >
              <HugeiconsIcon
                icon={WhatsappIcon}
                data-icon="inline-start"
                strokeWidth={2}
              />
              Evrak iste
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGorevHedef({ mukellefId: m.id })}
            >
              <HugeiconsIcon
                icon={Task01Icon}
                data-icon="inline-start"
                strokeWidth={2}
              />
              Görev ekle
            </Button>
            <ButtonLink size="sm" to={`/mukellefler/${m.id}/duzenle`}>
              <HugeiconsIcon
                icon={PencilEdit02Icon}
                data-icon="inline-start"
                strokeWidth={2}
              />
              Düzenle
            </ButtonLink>
          </div>
        </CardContent>
      </Card>

      <nav
        aria-label="Mükellef bölümleri"
        className="-mb-2 flex gap-1 overflow-x-auto border-b pb-2"
      >
        {MUKELLEF_SEKMELERI.map((sekme) => (
          <NavLink
            key={sekme.to}
            to={sekme.to}
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-3xl px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive && "bg-muted text-foreground"
              )
            }
          >
            {sekme.label}
          </NavLink>
        ))}
      </nav>

      <Outlet context={{ mukellef: m } satisfies MukellefKartContext} />
      <TalepOlusturDialog
        hedef={talepHedef}
        onClose={() => setTalepHedef(null)}
      />
      <GorevFormDialog
        hedef={gorevHedef}
        onClose={() => setGorevHedef(null)}
        onOlustu={(g) =>
          navigate(`/mukellefler/${m.id}/gorevler?gorev=${g.id}`)
        }
      />
    </>
  )
}
