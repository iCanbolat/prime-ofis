import { Outlet } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Briefcase01Icon } from "@hugeicons/core-free-icons"

function Brand() {
  return (
    <div className="flex items-center gap-2 font-semibold">
      <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <HugeiconsIcon
          icon={Briefcase01Icon}
          strokeWidth={2}
          className="size-4"
        />
      </div>
      Prime Ofis
    </div>
  )
}

/** Giriş ekranı: ortalanmış kart. */
export function AuthLayout() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <Brand />
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  )
}

/** Müşteri portalı (/p/:token): girişsiz, mobil öncelikli, sidebar yok. */
export function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="flex h-14 items-center border-b bg-background px-4">
        <Brand />
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
        <Outlet />
      </main>
    </div>
  )
}
