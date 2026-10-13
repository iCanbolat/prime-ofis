import { useNavigate, useParams } from "react-router"
import { toast } from "sonner"

import { PageHeader } from "@/components/shared/page-header"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { useAuthStore } from "@/features/auth/store"
import { MukellefForm } from "@/features/mukellef/components/mukellef-form"
import {
  useCreateMukellef,
  useMukellef,
  useUpdateMukellef,
} from "@/features/mukellef/queries"
import {
  BOS_MUKELLEF_FORMU,
  formValuesToInput,
  mukellefToFormValues,
} from "@prime/shared/mukellef/schemas"

export function MukellefCreatePage() {
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id ?? "")
  const create = useCreateMukellef()

  return (
    <>
      <PageHeader
        title="Yeni mükellef"
        description="Dört adımda mükellef kartını oluşturun. Şifreler kart oluşturulduktan sonra eklenir."
      />
      <MukellefForm
        mode="create"
        submitLabel="Mükellefi kaydet"
        // Varsayılan sorumlu: formu açan personel
        defaultValues={{ ...BOS_MUKELLEF_FORMU, sorumluPersonelId: userId }}
        onCancel={() => navigate("/mukellefler")}
        onSubmit={async (values) => {
          const created = await create.mutateAsync(formValuesToInput(values))
          toast.success(`${created.unvan} eklendi`)
          navigate(`/mukellefler/${created.id}`)
        }}
      />
    </>
  )
}

export function MukellefEditPage() {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const mukellef = useMukellef(id)
  const update = useUpdateMukellef(id)

  if (mukellef.isPending) return <LoadingState />
  if (mukellef.isError) {
    return (
      <ErrorState error={mukellef.error} onRetry={() => mukellef.refetch()} />
    )
  }

  return (
    <>
      <PageHeader title="Mükellefi düzenle" description={mukellef.data.unvan} />
      <MukellefForm
        // Başka bir mükellefe geçilirse form sıfırdan kurulsun
        key={mukellef.data.id}
        mode="edit"
        submitLabel="Değişiklikleri kaydet"
        defaultValues={mukellefToFormValues(mukellef.data)}
        onCancel={() => navigate(`/mukellefler/${id}`)}
        onSubmit={async (values) => {
          await update.mutateAsync(formValuesToInput(values))
          toast.success("Mükellef bilgileri güncellendi")
          navigate(`/mukellefler/${id}`)
        }}
      />
    </>
  )
}
