import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { initials } from "@prime/shared/lib/format"
import { cn } from "@/lib/utils"
import type { Personel, PersonelRenk } from "@prime/shared/types/domain"

const RENK_CLASS: Record<PersonelRenk, string> = {
  blue: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  rose: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  violet: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
}

interface PersonelAvatarProps {
  personel: Pick<Personel, "ad" | "soyad" | "renk">
  size?: "sm" | "default" | "lg"
  className?: string
}

export function PersonelAvatar({
  personel,
  size = "default",
  className,
}: PersonelAvatarProps) {
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback className={cn("font-medium", RENK_CLASS[personel.renk])}>
        {initials(`${personel.ad} ${personel.soyad}`)}
      </AvatarFallback>
    </Avatar>
  )
}
