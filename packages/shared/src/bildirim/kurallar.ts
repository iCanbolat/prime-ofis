/**
 * Aktivite → bildirim kurallarının saf kısmı (client mock'u ve api ortak kullanır): hangi eylemin
 * bildirim ürettiği, başlığı, bağlantısı ve görünürlük. Veri gerektiren kısımlar (alıcı çözümü,
 * talep / e-Belge türü) çağıran tarafından `LinkBaglami` ile verilir.
 */
import type { AktiviteLog, Bildirim, BildirimTur } from "../types/domain"

/** Bildirim üreten eylemler ve başlıkları; açıklama olarak log açıklaması kullanılır. */
export const BILDIRIM_BASLIKLARI: Partial<
  Record<AktiviteLog["eylem"], string>
> = {
  GOREV_OLUSTURULDU: "Size yeni bir görev atandı",
  GOREV_ATANDI: "Bir görev size atandı",
  GOREV_DURUMU_DEGISTI: "Görevinizin durumu değişti",
  GOREV_YORUMLANDI: "Görevinize yorum yazıldı",
  GOREV_SILINDI: "Görevleriniz arasından bir görev silindi",
  DONEM_GOREVLERI_OLUSTURULDU: "Dönem görevleri oluşturuldu",
  EVRAK_YUKLENDI: "Müşteri evrak yükledi",
  TALEP_TAMAMLANDI: "Evrak talebi tamamlandı",
  EFATURA_KABUL_EDILDI: "e-Fatura kabul edildi",
  EFATURA_REDDEDILDI: "e-Fatura reddedildi",
  EBELGE_SENKRONIZE_EDILDI: "e-Belge senkronu tamamlandı",
  ENTEGRATOR_BAGLANTI_KALDIRILDI: "Luca bağlantısı kaldırıldı",
  ARSIV_YUKLENDI: "Arşive yeni dosya yüklendi",
  MUKELLEF_OLUSTURULDU: "Sorumlu olduğunuz yeni mükellef",
  BEYAN_DURUMU_GUNCELLENDI: "Beyan durumu güncellendi",
  SIFRE_SILINDI: "Kasadan bir şifre silindi",
  SABLON_GUNCELLENDI: "Mesaj şablonları güncellendi",
}

export interface BildirimSecenekleri {
  /** Kural alıcısı yerine bu kişilere (kişi başına bir bildirim) */
  alicilar?: (string | null)[]
  tur?: BildirimTur
  /** Kural dışı bir eylem için verilirse bildirim yine üretilir */
  baslik?: string
}

/** Bağlantı için veriden çözülen bilgiler */
export interface LinkBaglami {
  /** EVRAK hedefi bir gelen evraksa ait olduğu talep */
  talepId?: string
  /** EBELGE hedefi e-Arşiv faturasıysa */
  eArsiv?: boolean
}

/** Bağlantı: bildirime tıklanınca açılacak uygulama içi yol */
export function bildirimLinki(
  log: Pick<AktiviteLog, "eylem" | "hedefTip" | "hedefId" | "mukellefId">,
  baglam: LinkBaglami = {}
): string | undefined {
  const { hedefTip, hedefId, mukellefId } = log
  switch (hedefTip) {
    case "GOREV":
      return hedefId && log.eylem !== "GOREV_SILINDI"
        ? `/gorevler?gorev=${hedefId}`
        : "/gorevler"
    case "EVRAK": {
      const talepId = hedefId && (baglam.talepId ?? hedefId)
      return talepId ? `/evrak-talepleri?talep=${talepId}` : "/evrak-talepleri"
    }
    case "EBELGE":
      if (hedefId) {
        const sekme = baglam.eArsiv ? "e-arsiv" : "e-fatura"
        return `/e-belge/${sekme}?fatura=${hedefId}`
      }
      return "/e-belge"
    case "ARSIV":
      return mukellefId ? `/arsiv?mukellef=${mukellefId}` : "/arsiv"
    case "TAKVIM":
      return mukellefId ? `/mukellefler/${mukellefId}/takvim` : "/takvim"
    case "CREDENTIAL":
      return mukellefId ? `/mukellefler/${mukellefId}/sifreler` : "/kasa"
    case "TEBLIGAT":
      return hedefId ? `/tebligat?tebligat=${hedefId}` : "/tebligat"
    case "TAHSILAT":
      return mukellefId ? `/mukellefler/${mukellefId}/tahsilat` : "/tahsilat"
    case "MUKELLEF":
      return mukellefId ? `/mukellefler/${mukellefId}` : "/mukellefler"
    case "BORDRO":
      return mukellefId ? `/mukellefler/${mukellefId}/bordro` : "/bordro"
    case "FIS":
      return hedefId
        ? `/fis-aktarimi/taslaklar?fis=${hedefId}`
        : "/fis-aktarimi"
    default:
      return log.eylem === "SABLON_GUNCELLENDI"
        ? "/ayarlar/sablonlar"
        : undefined
  }
}

/** Kullanıcının görebileceği bildirim mi? Yayını (aliciId null) aktörün kendisi görmez. */
export function bildirimGorunurMu(
  b: Pick<Bildirim, "aliciId" | "aktorId">,
  kullaniciId: string
): boolean {
  return b.aliciId === null
    ? b.aktorId !== kullaniciId
    : b.aliciId === kullaniciId
}
