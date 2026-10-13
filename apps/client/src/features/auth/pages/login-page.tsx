import { useState } from "react"
import { Navigate, useLocation, useNavigate } from "react-router"
import { toast } from "sonner"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useLogin, usePersonelList } from "@/features/auth/queries"
import { useAuthStore } from "@/features/auth/store"
import { ROL_ETIKET, type Personel } from "@prime/shared/types/domain"

const demoModu =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS === "true"

interface LocationState {
  from?: string
}

export function LoginPage() {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const navigate = useNavigate()
  const personel = usePersonelList()
  const login = useLogin()
  const [secili, setSecili] = useState<Personel | null>(null)
  const [sifre, setSifre] = useState("")
  const [hata, setHata] = useState<string | null>(null)

  const from = (location.state as LocationState | null)?.from ?? "/"

  if (user) return <Navigate to={from} replace />

  const sec = (p: Personel | null) => {
    setSecili(p)
    setSifre("")
    setHata(null)
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!secili || !sifre) return
    setHata(null)
    login.mutate(
      { personelId: secili.id, sifre },
      {
        onSuccess: ({ personel: p }) => {
          toast.success(`Hoş geldiniz, ${p.ad}`)
          navigate(from, { replace: true })
        },
        onError: (error) => {
          setSifre("")
          setHata(error.message)
        },
      }
    )
  }

  if (secili) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Giriş yap</CardTitle>
          <CardDescription>Devam etmek için şifrenizi girin.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="grid gap-4">
            <div className="flex items-center gap-3 rounded-2xl border p-3">
              <PersonelAvatar personel={secili} />
              <span className="grid flex-1 leading-tight">
                <span className="font-medium">
                  {secili.ad} {secili.soyad}
                </span>
                <span className="text-xs text-muted-foreground">
                  {secili.eposta}
                </span>
              </span>
            </div>
            <Field data-invalid={Boolean(hata) || undefined}>
              <FieldLabel htmlFor="giris-sifre">Şifre</FieldLabel>
              <Input
                id="giris-sifre"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={sifre}
                aria-invalid={Boolean(hata) || undefined}
                onChange={(event) => setSifre(event.target.value)}
              />
              {demoModu && (
                <FieldDescription>
                  Demo kullanıcılarının şifresi:{" "}
                  <code className="font-mono">demo1234</code>
                </FieldDescription>
              )}
              <FieldError>{hata}</FieldError>
            </Field>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" onClick={() => sec(null)}>
                Başka kullanıcı
              </Button>
              <Button type="submit" disabled={!sifre || login.isPending}>
                {login.isPending && <Spinner />}
                Giriş yap
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Giriş yap</CardTitle>
        <CardDescription>Devam etmek için kullanıcınızı seçin.</CardDescription>
      </CardHeader>
      <CardContent>
        {personel.isPending ? (
          <LoadingState />
        ) : personel.isError ? (
          <ErrorState
            error={personel.error}
            onRetry={() => personel.refetch()}
          />
        ) : (
          <ul className="grid gap-2">
            {personel.data
              .filter((p) => p.aktif)
              .map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => sec(p)}
                    className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60"
                  >
                    <PersonelAvatar personel={p} />
                    <span className="grid flex-1 leading-tight">
                      <span className="font-medium">
                        {p.ad} {p.soyad}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.eposta}
                      </span>
                    </span>
                    <Badge
                      variant={p.rol === "YONETICI" ? "default" : "secondary"}
                    >
                      {ROL_ETIKET[p.rol]}
                    </Badge>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
