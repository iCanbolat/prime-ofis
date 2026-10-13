import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { useKasadanAktar } from "@/features/tebligat/kasa-aktarim"
import { useTebligatErisim } from "@/features/tebligat/queries"
import type { CredentialKaydi } from "@prime/shared/types/api"

/**
 * Kasadaki İnteraktif VD kartında: bu şifrenin e-Tebligat gece taramasında kullanılıp
 * kullanılmadığı ve tek tıkla aktarma / güncelleme.
 */
export function KasaTebligatSatiri({
  credential,
}: {
  credential: CredentialKaydi
}) {
  const erisim = useTebligatErisim(credential.mukellefId)
  const { aktar, isPending } = useKasadanAktar()
  const s = erisim.data
  if (!s) return null
  const e = s.erisim
  const kasadan = e?.kasaKaynagi?.credentialId === credential.id

  const [metin, dugme] = !e
    ? ["e-Tebligat gece taramasında kullanılmıyor.", "Taramada kullan"]
    : s.kasaDahaYeni
      ? [
          "Kasadaki şifre, e-Tebligat taramasının kullandığından daha yeni.",
          "Taramayı güncelle",
        ]
      : kasadan
        ? [
            e.durum === "HATA"
              ? "e-Tebligat taraması bu şifreyi kullanıyor ama GİB girişi başarısız."
              : "e-Tebligat taraması bu şifreyi kullanıyor.",
            null,
          ]
        : [
            e.durum === "HATA"
              ? "e-Tebligat taraması ayrı girilmiş bir şifre kullanıyor ve GİB girişi başarısız."
              : "e-Tebligat taraması ayrı girilmiş bir şifre kullanıyor.",
            "Bu şifreyle değiştir",
          ]

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs"
      aria-label="e-Tebligat taraması"
    >
      <span
        className={
          s.kasaDahaYeni || e?.durum === "HATA"
            ? "text-destructive"
            : "text-muted-foreground"
        }
      >
        {metin}{" "}
        <Link
          to={`/mukellefler/${credential.mukellefId}/tebligat`}
          className="underline"
        >
          e-Tebligat
        </Link>
      </span>
      {dugme && (
        <Button
          size="xs"
          variant="outline"
          disabled={isPending}
          onClick={() => aktar(credential)}
        >
          {dugme}
        </Button>
      )}
    </div>
  )
}
