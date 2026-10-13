import {
  Alert02Icon,
  AtIcon,
  Coins01Icon,
  Folder01Icon,
  InboxDownloadIcon,
  Invoice03Icon,
  LegalDocument01Icon,
  MoneyReceive02Icon,
  Settings01Icon,
  TaskDone01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"

import type { BildirimKategori } from "@prime/shared/bildirim/kategori"

export type { BildirimKategori } from "@prime/shared/bildirim/kategori"
export { turKategorisi } from "@prime/shared/bildirim/kategori"

type Ikon = typeof TaskDone01Icon

/** Kategori → ikon ve ikon rozetinin rengi */
export const BILDIRIM_GORUNUM: Record<
  BildirimKategori,
  { icon: Ikon; className: string; etiket: string }
> = {
  gorev: {
    icon: TaskDone01Icon,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    etiket: "Görev",
  },
  anilma: {
    icon: AtIcon,
    className: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    etiket: "Anılma",
  },
  evrak: {
    icon: InboxDownloadIcon,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    etiket: "Evrak",
  },
  ebelge: {
    icon: Invoice03Icon,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    etiket: "e-Belge",
  },
  arsiv: {
    icon: Folder01Icon,
    className: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    etiket: "Arşiv",
  },
  mukellef: {
    icon: UserIcon,
    className: "bg-muted text-foreground",
    etiket: "Mükellef",
  },
  tahsilat: {
    icon: MoneyReceive02Icon,
    className: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
    etiket: "Tahsilat",
  },
  tebligat: {
    icon: LegalDocument01Icon,
    className: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    etiket: "e-Tebligat",
  },
  borc: {
    icon: Coins01Icon,
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    etiket: "Borç ve levha",
  },
  uyari: {
    icon: Alert02Icon,
    className: "bg-destructive/10 text-destructive",
    etiket: "Hatırlatma",
  },
  sistem: {
    icon: Settings01Icon,
    className: "bg-muted text-muted-foreground",
    etiket: "Sistem",
  },
}
