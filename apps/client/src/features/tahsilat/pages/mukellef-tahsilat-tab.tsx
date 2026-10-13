import { useMukellefKart } from "@/features/mukellef/pages/mukellef-kart-context"
import { CariPanel } from "@/features/tahsilat/components/cari-panel"

export function MukellefTahsilatTab() {
  const { mukellef } = useMukellefKart()
  return (
    <div className="@container">
      <CariPanel mukellef={mukellef} />
    </div>
  )
}
