import { Navigate, type RouteObject } from "react-router"

import { AppLayout } from "@/app/layouts/app-layout"
import { AuthLayout, PublicLayout } from "@/app/layouts/minimal-layouts"
import type { RouteHandle } from "@/app/route-handle"
import { LoadingState } from "@/components/shared/query-states"
import { NotFoundPage, RouteErrorPage } from "@/components/shared/status-pages"
import {
  RequireAuth,
  RequireRole,
} from "@/features/auth/components/require-auth"
import { MukellefCrumb } from "@/features/mukellef/components/mukellef-crumb"

const crumb = (label: string): RouteHandle => ({ crumb: label })

/**
 * Tüm rota ağacı. Hem `createBrowserRouter` (uygulama) hem `createMemoryRouter` (testler) bunu kullanır.
 * Henüz geliştirilmemiş sayfalar `PlaceholderPage` ile işaretli; ilgili fazda gerçek sayfa lazy import edilir.
 */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    // İlk yüklemede lazy route modülü gelene kadar gösterilir
    hydrateFallbackElement: <LoadingState />,
    children: [
      {
        path: "/login",
        element: <AuthLayout />,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("@/features/auth/pages/login-page"))
                .LoginPage,
            }),
          },
        ],
      },
      {
        path: "/p/:token",
        element: <PublicLayout />,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("@/features/portal/pages/portal-page"))
                .PortalPage,
            }),
          },
        ],
      },
      {
        path: "/",
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        handle: crumb("Ana sayfa"),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (
                await import("@/features/dashboard/pages/dashboard-page")
              ).DashboardPage,
            }),
          },
          {
            path: "mukellefler",
            handle: crumb("Mükellefler"),
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (
                    await import("@/features/mukellef/pages/mukellef-list-page")
                  ).MukellefListPage,
                }),
              },
              {
                path: "yeni",
                handle: crumb("Yeni mükellef"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/mukellef/pages/mukellef-form-pages")
                  ).MukellefCreatePage,
                }),
              },
              {
                path: ":id",
                handle: {
                  crumb: (params) => <MukellefCrumb id={params.id ?? ""} />,
                } satisfies RouteHandle,
                children: [
                  {
                    path: "duzenle",
                    handle: crumb("Düzenle"),
                    lazy: async () => ({
                      Component: (
                        await import("@/features/mukellef/pages/mukellef-form-pages")
                      ).MukellefEditPage,
                    }),
                  },
                  {
                    // Kart başlığı + sekmeler (pathless layout)
                    lazy: async () => ({
                      Component: (
                        await import("@/features/mukellef/pages/mukellef-kart-layout")
                      ).MukellefKartLayout,
                    }),
                    children: [
                      { index: true, element: <Navigate to="genel" replace /> },
                      {
                        path: "genel",
                        handle: crumb("Genel"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/mukellef/pages/mukellef-genel-tab")
                          ).MukellefGenelTab,
                        }),
                      },
                      {
                        path: "sifreler",
                        handle: crumb("Şifreler"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/kasa/pages/mukellef-sifreler-tab")
                          ).MukellefSifrelerTab,
                        }),
                      },
                      {
                        path: "takvim",
                        handle: crumb("Takvim"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/takvim/pages/mukellef-takvim-tab")
                          ).MukellefTakvimTab,
                        }),
                      },
                      {
                        path: "arsiv",
                        handle: crumb("Arşiv"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/arsiv/pages/mukellef-arsiv-tab")
                          ).MukellefArsivTab,
                        }),
                      },
                      {
                        path: "evrak-talepleri",
                        handle: crumb("Evrak Talepleri"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/evrak-talebi/pages/mukellef-evrak-tab")
                          ).MukellefEvrakTab,
                        }),
                      },
                      {
                        path: "gorevler",
                        handle: crumb("Görevler"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/gorev/pages/mukellef-gorevler-tab")
                          ).MukellefGorevlerTab,
                        }),
                      },
                      {
                        path: "e-belge",
                        handle: crumb("e-Belge"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/e-belge/pages/mukellef-ebelge-tab")
                          ).MukellefEBelgeTab,
                        }),
                      },
                      {
                        path: "tebligat",
                        handle: crumb("e-Tebligat"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/tebligat/pages/mukellef-tebligat-tab")
                          ).MukellefTebligatTab,
                        }),
                      },
                      {
                        path: "borc",
                        handle: crumb("Borç ve levha"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/borc/pages/mukellef-borc-tab")
                          ).MukellefBorcTab,
                        }),
                      },
                      {
                        path: "bordro",
                        handle: crumb("Bordro"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/bordro/pages/mukellef-bordro-tab")
                          ).MukellefBordroTab,
                        }),
                      },
                      {
                        path: "tahsilat",
                        handle: crumb("Tahsilat"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/tahsilat/pages/mukellef-tahsilat-tab")
                          ).MukellefTahsilatTab,
                        }),
                      },
                      {
                        path: "fis-aktarimi",
                        handle: crumb("Fiş Aktarımı"),
                        lazy: async () => ({
                          Component: (
                            await import("@/features/fis-aktarimi/pages/mukellef-fis-tab")
                          ).MukellefFisTab,
                        }),
                      },
                      { path: "*", element: <NotFoundPage /> },
                    ],
                  },
                ],
              },
            ],
          },
          {
            path: "kasa",
            handle: crumb("Şifre Kasası"),
            lazy: async () => ({
              Component: (await import("@/features/kasa/pages/kasa-page"))
                .KasaPage,
            }),
          },
          {
            path: "takvim",
            handle: crumb("Takvim"),
            lazy: async () => ({
              Component: (await import("@/features/takvim/pages/takvim-page"))
                .TakvimPage,
            }),
          },
          {
            path: "arsiv",
            handle: crumb("Dijital Arşiv"),
            lazy: async () => ({
              Component: (await import("@/features/arsiv/pages/arsiv-page"))
                .ArsivPage,
            }),
          },
          {
            path: "evrak-talepleri",
            handle: crumb("Evrak Talepleri"),
            lazy: async () => ({
              Component: (
                await import("@/features/evrak-talebi/pages/evrak-talepleri-page")
              ).EvrakTalepleriPage,
            }),
          },
          {
            path: "gorevler",
            handle: crumb("Görevler"),
            lazy: async () => ({
              Component: (await import("@/features/gorev/pages/gorevler-page"))
                .GorevlerPage,
            }),
          },
          {
            path: "e-belge",
            handle: crumb("e-Belge"),
            lazy: async () => ({
              Component: (
                await import("@/features/e-belge/pages/e-belge-layout")
              ).EBelgeLayout,
            }),
            children: [
              { index: true, element: <Navigate to="e-fatura" replace /> },
              {
                path: "e-fatura",
                handle: crumb("e-Fatura"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/e-belge/pages/fatura-pages")
                  ).EFaturaPage,
                }),
              },
              {
                path: "e-arsiv",
                handle: crumb("e-Arşiv"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/e-belge/pages/fatura-pages")
                  ).EArsivPage,
                }),
              },
              {
                path: "e-defter",
                handle: crumb("e-Defter"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/e-belge/pages/e-defter-page")
                  ).EDefterPage,
                }),
              },
              {
                path: "kontor",
                handle: crumb("Kontör"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/e-belge/pages/kontor-page")
                  ).KontorPage,
                }),
              },
              {
                path: "baglantilar",
                handle: crumb("Bağlantılar"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/e-belge/pages/baglantilar-page")
                  ).BaglantilarPage,
                }),
              },
            ],
          },
          {
            path: "tebligat",
            handle: crumb("e-Tebligat"),
            lazy: async () => ({
              Component: (
                await import("@/features/tebligat/pages/tebligat-page")
              ).TebligatPage,
            }),
          },
          {
            path: "borc-levha",
            handle: crumb("Borç ve levha"),
            lazy: async () => ({
              Component: (await import("@/features/borc/pages/borc-levha-page"))
                .BorcLevhaPage,
            }),
          },
          {
            path: "bordro",
            handle: crumb("Bordro takibi"),
            lazy: async () => ({
              Component: (await import("@/features/bordro/pages/bordro-page"))
                .BordroPage,
            }),
          },
          {
            path: "tahsilat",
            handle: crumb("Tahsilat"),
            lazy: async () => ({
              Component: (
                await import("@/features/tahsilat/pages/tahsilat-layout")
              ).TahsilatLayout,
            }),
            children: [
              { index: true, element: <Navigate to="ozet" replace /> },
              {
                path: "ozet",
                handle: crumb("Özet"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/tahsilat/pages/tahsilat-ozet-page")
                  ).TahsilatOzetPage,
                }),
              },
              {
                path: "cari",
                handle: crumb("Cari hesaplar"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/tahsilat/pages/cari-page")
                  ).CariPage,
                }),
              },
              {
                path: "kesinti",
                handle: crumb("Kesinti kontrolü"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/tahsilat/pages/kesinti-page")
                  ).KesintiPage,
                }),
              },
            ],
          },
          {
            path: "ice-aktarim",
            handle: crumb("İçe Aktarım"),
            lazy: async () => ({
              Component: (
                await import("@/features/ice-aktarim/pages/ice-aktarim-layout")
              ).IceAktarimLayout,
            }),
            children: [
              { index: true, element: <Navigate to="tahakkuk" replace /> },
              {
                path: "tahakkuk",
                handle: crumb("Tahakkuk fişleri"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/ice-aktarim/pages/tahakkuk-page")
                  ).TahakkukPage,
                }),
              },
              {
                path: "mizan",
                handle: crumb("Mizan"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/ice-aktarim/pages/mizan-page")
                  ).MizanPage,
                }),
              },
              {
                path: "sifreler",
                handle: crumb("Şifreler"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/ice-aktarim/pages/sifre-aktarim-page")
                  ).SifreAktarimPage,
                }),
              },
              {
                path: "bakiyeler",
                handle: crumb("Ücret ve bakiyeler"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/ice-aktarim/pages/bakiye-aktarim-page")
                  ).BakiyeAktarimPage,
                }),
              },
            ],
          },
          {
            path: "fis-aktarimi",
            handle: crumb("Fiş Aktarımı"),
            lazy: async () => ({
              Component: (
                await import("@/features/fis-aktarimi/pages/fis-aktarimi-layout")
              ).FisAktarimiLayout,
            }),
            children: [
              { index: true, element: <Navigate to="taslaklar" replace /> },
              {
                path: "taslaklar",
                handle: crumb("Taslaklar"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/fis-aktarimi/pages/taslaklar-page")
                  ).TaslaklarPage,
                }),
              },
              {
                path: "hazir",
                handle: crumb("Aktarıma hazır"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/fis-aktarimi/pages/hazir-page")
                  ).HazirPage,
                }),
              },
              {
                path: "aktarimlar",
                handle: crumb("Aktarımlar"),
                lazy: async () => {
                  const { AktarimlarPage } =
                    await import("@/features/fis-aktarimi/pages/aktarimlar-page")
                  return { Component: () => <AktarimlarPage /> }
                },
              },
            ],
          },
          {
            path: "ayarlar",
            handle: crumb("Ayarlar"),
            lazy: async () => ({
              Component: (
                await import("@/features/ayarlar/pages/ayarlar-layout")
              ).AyarlarLayout,
            }),
            children: [
              { index: true, element: <Navigate to="buro" replace /> },
              {
                path: "buro",
                handle: crumb("Büro"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/ayarlar/pages/buro-page")
                  ).BuroPage,
                }),
              },
              {
                path: "personel",
                handle: crumb("Personel"),
                lazy: async () => {
                  const { PersonelPage } =
                    await import("@/features/ayarlar/pages/personel-page")
                  return {
                    Component: () => (
                      <RequireRole roles={["YONETICI"]}>
                        <PersonelPage />
                      </RequireRole>
                    ),
                  }
                },
              },
              {
                path: "sablonlar",
                handle: crumb("Mesaj Şablonları"),
                lazy: async () => {
                  const { SablonlarPage } =
                    await import("@/features/ayarlar/pages/sablonlar-page")
                  return {
                    Component: () => (
                      <RequireRole roles={["YONETICI"]}>
                        <SablonlarPage />
                      </RequireRole>
                    ),
                  }
                },
              },
              {
                path: "kanallar",
                handle: crumb("Kanallar"),
                lazy: async () => {
                  const { KanallarPage } =
                    await import("@/features/kanal/pages/kanallar-page")
                  return {
                    Component: () => (
                      <RequireRole roles={["YONETICI"]}>
                        <KanallarPage />
                      </RequireRole>
                    ),
                  }
                },
              },
              {
                path: "bildirimler",
                handle: crumb("Bildirimlerim"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/kanal/pages/bildirimlerim-page")
                  ).BildirimlerimPage,
                }),
              },
              {
                path: "gonderimler",
                handle: crumb("Gönderim Geçmişi"),
                lazy: async () => {
                  const { GonderimlerPage } =
                    await import("@/features/kanal/pages/gonderimler-page")
                  return {
                    Component: () => (
                      <RequireRole roles={["YONETICI"]}>
                        <GonderimlerPage />
                      </RequireRole>
                    ),
                  }
                },
              },
              {
                path: "luca",
                handle: crumb("Luca Aktarımı"),
                lazy: async () => {
                  const { LucaSablonuPage } =
                    await import("@/features/fis-aktarimi/pages/luca-sablonu-page")
                  return {
                    Component: () => (
                      <RequireRole roles={["YONETICI"]}>
                        <LucaSablonuPage />
                      </RequireRole>
                    ),
                  }
                },
              },
              {
                path: "luca-hesap",
                handle: crumb("Luca Hesabı"),
                lazy: async () => {
                  const { LucaHesapPage } =
                    await import("@/features/e-belge/pages/luca-hesap-page")
                  return {
                    Component: () => (
                      <RequireRole roles={["YONETICI"]}>
                        <LucaHesapPage />
                      </RequireRole>
                    ),
                  }
                },
              },
              {
                path: "gelistirici",
                handle: crumb("Geliştirici"),
                lazy: async () => ({
                  Component: (
                    await import("@/features/ayarlar/pages/gelistirici-page")
                  ).GelistiriciPage,
                }),
              },
            ],
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
