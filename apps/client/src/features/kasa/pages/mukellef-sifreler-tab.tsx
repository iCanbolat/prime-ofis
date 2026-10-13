import { MukellefCredentialKartlari } from "@/features/kasa/components/credential-kartlari"
import { KasaDurumUyarisi } from "@/features/kasa/components/kasa-kilidi"
import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"

export function MukellefSifrelerTab() {
  const { mukellef } = useMukellefKart()
  return (
    <div className="grid gap-4">
      <KasaDurumUyarisi />
      <MukellefCredentialKartlari mukellefId={mukellef.id} />
    </div>
  )
}
