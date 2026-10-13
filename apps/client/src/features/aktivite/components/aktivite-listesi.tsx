import { MUSTERI_AKTOR_ID } from "@prime/shared/evrak-talebi/sabitler"
import { formatDistanceToNow } from "date-fns"
import { tr } from "date-fns/locale"
import { Clock01Icon } from "@hugeicons/core-free-icons"

import { PersonelAvatar } from "@/components/shared/personel-avatar"
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states"
import { useAktiviteList } from "@/features/aktivite/queries"
import { SISTEMLER } from "@prime/shared/kasa/sistemler"
import { formatDateTime } from "@prime/shared/lib/format"
import type { AktiviteListParams } from "@prime/shared/types/api"
import type { AktiviteEylem, Sistem } from "@prime/shared/types/domain"

const EYLEM_ETIKET: Record<AktiviteEylem, string> = {
  GIRIS: "oturum açtı",
  CIKIS: "oturumu kapattı",
  MUKELLEF_OLUSTURULDU: "mükellefi oluşturdu",
  MUKELLEF_GUNCELLENDI: "mükellef bilgilerini güncelledi",
  SIFRE_EKLENDI: "şifre ekledi",
  SIFRE_GORUNTULENDI: "şifreyi görüntüledi",
  SIFRE_KOPYALANDI: "şifreyi kopyaladı",
  SIFRE_TEBLIGATA_AKTARILDI: "şifreyi e-Tebligat taramasına aktardı",
  SIFRE_GUNCELLENDI: "şifreyi güncelledi",
  SIFRE_SILINDI: "şifreyi sildi",
  KASA_KURULDU: "şifre kasasını kurdu",
  KASA_ANAHTARI_DEGISTI: "kasa ana şifresini değiştirdi",
  BEYAN_DURUMU_GUNCELLENDI: "beyan durumunu güncelledi",
  ARSIV_YUKLENDI: "arşive dosya yükledi",
  ARSIV_GUNCELLENDI: "arşiv dosyasını güncelledi",
  ARSIV_SILINDI: "arşiv dosyasını çöp kutusuna taşıdı",
  ARSIV_GERI_ALINDI: "arşiv dosyasını geri aldı",
  ARSIV_KALICI_SILINDI: "arşiv dosyasını kalıcı olarak sildi",
  DOSYA_GORUNTULENDI: "dosyayı görüntüledi",
  DOSYA_INDIRILDI: "dosyayı indirdi",
  BORDRO_GUNCELLENDI: "bordro durumunu güncelledi",
  BORDRO_OZET_ICE_AKTARILDI: "bordro özetini içe aktardı",
  ISE_HAREKETI_KAYDEDILDI: "işe giriş / çıkış bildirimini güncelledi",
  TALEP_OLUSTURULDU: "evrak talebi oluşturdu",
  TALEP_GONDERILDI: "evrak talebini gönderdi",
  TALEP_UZATILDI: "evrak talebinin süresini uzattı",
  TALEP_IPTAL_EDILDI: "evrak talebini iptal etti",
  TALEP_YENIDEN_ACILDI: "evrak talebini yeniden açtı",
  TALEP_TAMAMLANDI: "evrak gönderimini tamamladı",
  EVRAK_YUKLENDI: "portaldan evrak yükledi",
  EVRAK_ONAYLANDI: "gelen evrakı onaylayıp arşive kaydetti",
  EVRAK_REDDEDILDI: "gelen evrakı reddetti",
  SABLON_GUNCELLENDI: "mesaj şablonunu güncelledi",
  GOREV_OLUSTURULDU: "görev oluşturdu",
  GOREV_GUNCELLENDI: "görevi güncelledi",
  GOREV_DURUMU_DEGISTI: "görevin durumunu değiştirdi",
  GOREV_ATANDI: "görevi atadı",
  GOREV_YORUMLANDI: "göreve yorum yazdı",
  GOREV_SILINDI: "görevi sildi",
  DONEM_GOREVLERI_OLUSTURULDU: "dönem görevlerini oluşturdu",
  ENTEGRATOR_BAGLANDI: "Luca bağlantısını kurdu",
  ENTEGRATOR_BAGLANTI_KALDIRILDI: "Luca bağlantısını kaldırdı",
  EBELGE_SENKRONIZE_EDILDI: "e-Belgeleri senkronize etti",
  EFATURA_KABUL_EDILDI: "ticari faturayı kabul etti",
  EFATURA_REDDEDILDI: "ticari faturayı reddetti",
  EBELGE_ARSIVE_KAYDEDILDI: "faturayı arşive kaydetti",
  KONTOR_ALINDI: "Luca kontör alımını kaydetti",
  TAHAKKUK_ICE_AKTARILDI: "tahakkuk fişini içe aktardı",
  MIZAN_ICE_AKTARILDI: "mizanı içe aktardı",
  TAHSILAT_BORC_EKLENDI: "cari hesaba borç ekledi",
  TAHSILAT_ODEME_ALINDI: "tahsilat kaydetti",
  TAHSILAT_HAREKET_SILINDI: "cari hareketi sildi",
  UCRET_GUNCELLENDI: "aylık ücreti güncelledi",
  KESINTI_ICE_AKTARILDI: "İVD kesinti listesini içe aktardı",
  BURO_GUNCELLENDI: "büro bilgilerini güncelledi",
  TEBLIGAT_ALINDI: "e-Tebligat kaydetti",
  TEBLIGAT_GUNCELLENDI: "e-Tebligatı güncelledi",
  TEBLIGAT_ERISIMI_TANIMLANDI: "GİB e-Tebligat erişimini tanımladı",
  TEBLIGAT_ERISIMI_KALDIRILDI: "GİB e-Tebligat erişimini kaldırdı",
  TEBLIGAT_ERISIM_HATASI: "GİB e-Tebligat kutusuna giriş yapamadı",
  KANAL_GUNCELLENDI: "gönderim kanalını yapılandırdı",
  KANAL_KALDIRILDI: "gönderim kanalını kaldırdı",
  MUKELLEFE_GONDERILDI: "mükellefe mesaj gönderdi",
  FIS_OKUNDU: "belgeyi okuttu",
  FIS_ONAYLANDI: "muhasebe fişini onayladı",
  LUCA_AKTARIMI: "Luca aktarım dosyası indirdi",
  LUCA_AKTARIMI_GERI_ALINDI: "Luca aktarımını geri aldı",
  PERSONEL_EKLENDI: "personel ekledi",
  PERSONEL_GUNCELLENDI: "personel bilgilerini güncelledi",
  PERSONEL_SIFRESI_DEGISTI: "personelin şifresini değiştirdi",
  PERSONEL_SILINDI: "personeli sildi",
  SGK_ERISIMI_TANIMLANDI: "SGK sorgu erişimini tanımladı",
  SGK_ERISIMI_KALDIRILDI: "SGK sorgu erişimini kaldırdı",
  SGK_ERISIM_HATASI: "SGK İşveren Sistemi'ne giriş yapamadı",
  SIFRE_SGK_SORGUSUNA_AKTARILDI: "şifreyi SGK sorgularına aktardı",
  VERGI_LEVHASI_ALINDI: "vergi levhasını GİB'den aldı",
  BORC_SORGULANDI: "borç sorguladı",
  BORC_TESPIT_EDILDI: "vadesi geçmiş borç tespit etti",
  BORCU_YOKTUR_TALEP_EDILDI: "borcu yoktur yazısı istedi",
  BORCU_YOKTUR_SONUCLANDI: "borcu yoktur talebini sonuçlandırdı",
  KAMU_DOGRULAMA_BEKLIYOR: "doğrulama ekranına takıldı",
  KAMU_DOGRULAMA_TAMAMLANDI: "doğrulama kodunu girdi",
}

export function AktiviteListesi(params: AktiviteListParams) {
  const aktivite = useAktiviteList(params)

  if (aktivite.isPending) return <LoadingState />
  if (aktivite.isError) {
    return (
      <ErrorState error={aktivite.error} onRetry={() => aktivite.refetch()} />
    )
  }
  if (aktivite.data.length === 0) {
    return <EmptyState icon={Clock01Icon} title="Henüz aktivite yok" />
  }

  return (
    <ol className="grid gap-3" aria-label="Aktivite geçmişi">
      {aktivite.data.map((a) => {
        const detay =
          a.hedefTip === "CREDENTIAL" && a.aciklama
            ? ` (${SISTEMLER[a.aciklama as Sistem]?.ad ?? a.aciklama})`
            : a.aciklama && a.eylem !== "MUKELLEF_OLUSTURULDU"
              ? ` — ${a.aciklama}`
              : ""
        return (
          <li key={a.id} className="flex items-start gap-3 text-sm">
            {a.aktor ? (
              <PersonelAvatar personel={a.aktor} size="sm" />
            ) : (
              <span className="size-6" />
            )}
            <div className="grid min-w-0 flex-1 leading-snug">
              <span>
                <span className="font-medium">
                  {a.aktor
                    ? `${a.aktor.ad} ${a.aktor.soyad}`
                    : a.aktorId === MUSTERI_AKTOR_ID
                      ? "Müşteri"
                      : "Sistem"}
                </span>{" "}
                {EYLEM_ETIKET[a.eylem]}
                {detay}
              </span>
              <time
                dateTime={a.zaman}
                title={formatDateTime(a.zaman)}
                className="text-xs text-muted-foreground"
              >
                {formatDistanceToNow(new Date(a.zaman), {
                  addSuffix: true,
                  locale: tr,
                })}
              </time>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
