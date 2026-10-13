import { useMukellef } from "@/features/mukellef/queries"

/** Breadcrumb'da mükellef unvanı (kart zaten aynı sorguyu kullandığı için ek istek yapılmaz). */
export function MukellefCrumb({ id }: { id: string }) {
  const { data } = useMukellef(id)
  return (
    <span className="inline-block max-w-56 truncate align-bottom whitespace-nowrap">
      {data?.unvan ?? "Mükellef"}
    </span>
  )
}
