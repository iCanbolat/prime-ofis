import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  Edit02Icon,
  MoreHorizontalIcon,
  PasswordValidationIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import { ErrorState, LoadingState } from "@/components/shared/query-states"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  PersonelIslemDialog,
  type PersonelIslemi,
} from "@/features/ayarlar/components/personel-dialoglari"
import { usePersonelList } from "@/features/auth/queries"
import { useAuthStore } from "@/features/auth/store"
import { formatPhone } from "@prime/shared/lib/format"
import { ROL_ETIKET, type Personel } from "@prime/shared/types/domain"

function PersonelMenu({
  personel,
  kendisi,
  onIslem,
}: {
  personel: Personel
  kendisi: boolean
  onIslem: (islem: PersonelIslemi) => void
}) {
  const ad = `${personel.ad} ${personel.soyad}`
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${ad} işlemleri`}
          />
        }
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem onClick={() => onIslem({ tur: "duzenle", personel })}>
          <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
          Düzenle
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onIslem({ tur: "sifre", personel })}>
          <HugeiconsIcon icon={PasswordValidationIcon} strokeWidth={2} />
          Şifre belirle
        </DropdownMenuItem>
        {!kendisi && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onIslem({ tur: "sil", personel })}
            >
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              Sil
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PersonelPage() {
  const personel = usePersonelList()
  const user = useAuthStore((s) => s.user)
  const [islem, setIslem] = useState<PersonelIslemi | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personel</CardTitle>
        <CardDescription>
          Büro çalışanları, rolleri ve giriş şifreleri. Her değişiklik yönetici
          şifrenizle onaylanır.
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setIslem({ tur: "ekle" })}>
            <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} />
            Personel ekle
          </Button>
        </CardAction>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Soyad</TableHead>
                <TableHead className="hidden md:table-cell">E-posta</TableHead>
                <TableHead className="hidden lg:table-cell">Telefon</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">İşlemler</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personel.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-normal md:whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <PersonelAvatar personel={p} size="sm" />
                      <div className="grid leading-tight">
                        {p.ad} {p.soyad}
                        {/* Dar ekranda gizlenen iletişim sütunlarının özeti */}
                        <span className="text-xs break-all text-muted-foreground md:hidden">
                          {p.eposta}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {p.eposta}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatPhone(p.telefon)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={p.rol === "YONETICI" ? "default" : "secondary"}
                    >
                      {ROL_ETIKET[p.rol]}
                    </Badge>
                    {!p.aktif && (
                      <Badge variant="outline" className="ms-1">
                        Pasif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <PersonelMenu
                      personel={p}
                      kendisi={p.id === user?.id}
                      onIslem={setIslem}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <PersonelIslemDialog
        islem={islem}
        personelSayisi={personel.data?.length ?? 0}
        onClose={() => setIslem(null)}
      />
    </Card>
  )
}
