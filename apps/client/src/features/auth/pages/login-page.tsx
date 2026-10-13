import { useState } from "react"
import { Navigate, useLocation, useNavigate } from "react-router"
import { toast } from "sonner"

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
import { useLogin, useOturum } from "@/features/auth/queries"
import { useAuthStore } from "@/features/auth/store"
import { MOCK_MODU } from "@/lib/http"
import { girisSemasi } from "@prime/shared/auth/schemas"

interface LocationState {
  from?: string
}

type Hatalar = Partial<Record<"eposta" | "sifre" | "genel", string>>

export function LoginPage() {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const navigate = useNavigate()
  const login = useLogin()
  // Yerel kopya yok ama cookie oturumu geçerliyse (ör. depolama temizlendi) giriş atlanır
  useOturum(user === null && !MOCK_MODU)
  const [eposta, setEposta] = useState("")
  const [sifre, setSifre] = useState("")
  const [hatalar, setHatalar] = useState<Hatalar>({})

  const from = (location.state as LocationState | null)?.from ?? "/"

  if (user) return <Navigate to={from} replace />

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const sonuc = girisSemasi.safeParse({ eposta, sifre })
    if (!sonuc.success) {
      const alanHatalari: Hatalar = {}
      for (const sorun of sonuc.error.issues) {
        const alan = sorun.path[0] as "eposta" | "sifre"
        alanHatalari[alan] ??= sorun.message
      }
      setHatalar(alanHatalari)
      return
    }
    setHatalar({})
    login.mutate(sonuc.data, {
      onSuccess: ({ personel: p }) => {
        toast.success(`Hoş geldiniz, ${p.ad}`)
        navigate(from, { replace: true })
      },
      onError: (error) => {
        setSifre("")
        setHatalar({ genel: error.message })
      },
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Giriş yap</CardTitle>
        <CardDescription>
          Büro hesabınızın e-posta adresi ve şifresiyle giriş yapın.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="grid gap-4">
          <Field data-invalid={Boolean(hatalar.eposta) || undefined}>
            <FieldLabel htmlFor="giris-eposta">E-posta</FieldLabel>
            <Input
              id="giris-eposta"
              type="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              value={eposta}
              aria-invalid={Boolean(hatalar.eposta) || undefined}
              onChange={(event) => setEposta(event.target.value)}
            />
            <FieldError>{hatalar.eposta}</FieldError>
          </Field>
          <Field
            data-invalid={Boolean(hatalar.sifre || hatalar.genel) || undefined}
          >
            <FieldLabel htmlFor="giris-sifre">Şifre</FieldLabel>
            <Input
              id="giris-sifre"
              type="password"
              autoComplete="current-password"
              value={sifre}
              aria-invalid={
                Boolean(hatalar.sifre || hatalar.genel) || undefined
              }
              onChange={(event) => setSifre(event.target.value)}
            />
            {MOCK_MODU && (
              <FieldDescription className="grid gap-0.5">
                <span>
                  Yönetici:{" "}
                  <code className="font-mono">
                    ayse.yilmaz@primemusavirlik.com.tr
                  </code>
                </span>
                <span>
                  Personel:{" "}
                  <code className="font-mono">
                    mehmet.kaya@primemusavirlik.com.tr
                  </code>
                </span>
                <span>
                  Demo şifresi: <code className="font-mono">demo1234</code>
                </span>
              </FieldDescription>
            )}
            <FieldError>{hatalar.sifre ?? hatalar.genel}</FieldError>
          </Field>
          <Button type="submit" disabled={login.isPending}>
            {login.isPending && <Spinner />}
            Giriş yap
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
