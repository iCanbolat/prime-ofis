import type { IconSvgElement } from "@hugeicons/react"
import {
  Calendar03Icon,
  Coins01Icon,
  DashboardSquare01Icon,
  FileImportIcon,
  Invoice01Icon,
  FolderLibraryIcon,
  Invoice03Icon,
  InboxUploadIcon,
  KanbanIcon,
  LegalDocument01Icon,
  LockPasswordIcon,
  MoneyReceive02Icon,
  Settings01Icon,
  UserGroupIcon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"

import type { Rol } from "@prime/shared/types/domain"

export interface NavItem {
  title: string
  to: string
  icon: IconSvgElement
  /** Arama paletinde eşleşme için ek anahtar kelimeler */
  keywords?: string[]
  roles?: Rol[]
  /** Menüde sayaç rozeti gösterilecek veri */
  sayac?:
    | "gelenEvrak"
    | "yanitBekleyen"
    | "acikTebligat"
    | "fisTaslak"
    | "kamuDogrulama"
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Genel",
    items: [
      {
        title: "Gösterge Paneli",
        to: "/",
        icon: DashboardSquare01Icon,
        keywords: ["dashboard", "özet"],
      },
      {
        title: "Mükellefler",
        to: "/mukellefler",
        icon: UserGroupIcon,
        keywords: ["müşteri", "firma"],
      },
      {
        title: "Şifre Kasası",
        to: "/kasa",
        icon: LockPasswordIcon,
        keywords: ["gib", "sgk", "şifre"],
      },
      {
        title: "Takvim",
        to: "/takvim",
        icon: Calendar03Icon,
        keywords: ["beyanname", "kdv", "son gün"],
      },
    ],
  },
  {
    label: "Evrak & İş",
    items: [
      {
        title: "Dijital Arşiv",
        to: "/arsiv",
        icon: FolderLibraryIcon,
        keywords: ["evrak", "dosya"],
      },
      {
        title: "Evrak Talepleri",
        to: "/evrak-talepleri",
        icon: InboxUploadIcon,
        keywords: ["whatsapp", "link", "portal", "gelen"],
        sayac: "gelenEvrak",
      },
      {
        title: "Fiş Aktarımı",
        to: "/fis-aktarimi",
        icon: Invoice01Icon,
        keywords: [
          "luca",
          "fiş",
          "ekstre",
          "ocr",
          "muhasebe fişi",
          "excel",
          "mahsup",
        ],
        sayac: "fisTaslak",
      },
      {
        title: "Görevler",
        to: "/gorevler",
        icon: KanbanIcon,
        keywords: ["kanban", "iş", "task"],
      },
      {
        title: "e-Belge",
        to: "/e-belge",
        icon: Invoice03Icon,
        keywords: [
          "luca",
          "entegratör",
          "kontör",
          "e-fatura",
          "e-arşiv",
          "e-defter",
          "berat",
          "fatura",
        ],
        sayac: "yanitBekleyen",
      },
      {
        title: "e-Tebligat",
        to: "/tebligat",
        icon: LegalDocument01Icon,
        keywords: [
          "tebligat",
          "ödeme emri",
          "ihbarname",
          "izaha davet",
          "ivd",
          "gib",
        ],
        sayac: "acikTebligat",
      },
      {
        title: "Borç ve levha",
        to: "/borc-levha",
        icon: Coins01Icon,
        keywords: [
          "vergi borcu",
          "sgk borcu",
          "prim borcu",
          "vergi levhası",
          "borcu yoktur",
          "ivd",
          "sgk",
        ],
        sayac: "kamuDogrulama",
      },
      {
        title: "Bordro takibi",
        to: "/bordro",
        icon: UserMultiple02Icon,
        keywords: [
          "bordro",
          "puantaj",
          "muhsgk",
          "sgk",
          "maaş",
          "çalışan",
          "işe giriş",
        ],
      },
      {
        title: "Tahsilat",
        to: "/tahsilat",
        icon: MoneyReceive02Icon,
        keywords: [
          "ücret",
          "cari",
          "ödeme",
          "alacak",
          "kesinti",
          "stopaj",
          "makbuz",
        ],
      },
      {
        title: "İçe Aktarım",
        to: "/ice-aktarim",
        icon: FileImportIcon,
        keywords: ["tahakkuk", "mizan", "excel", "beyanname", "luca", "zirve"],
      },
    ],
  },
  {
    label: "Yönetim",
    items: [
      {
        title: "Ayarlar",
        to: "/ayarlar",
        icon: Settings01Icon,
        keywords: ["büro", "personel"],
      },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === "/") return pathname === "/"
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}
