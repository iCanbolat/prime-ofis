-- Web servis anahtarlı bağlantılar Luca firmasına eşlenene kadar hatalı görünür
UPDATE "entegrator_baglanti" SET "durum" = 'HATA', "hata_mesaji" = 'Mükellefi Luca firmasıyla eşleyin' WHERE "luca_firma_id" IS NULL AND "durum" <> 'BAGLI_DEGIL';--> statement-breakpoint
ALTER TABLE "entegrator_baglanti" DROP COLUMN "ortam";--> statement-breakpoint
ALTER TABLE "entegrator_baglanti" DROP COLUMN "anahtar";--> statement-breakpoint
ALTER TABLE "entegrator_baglanti" DROP COLUMN "anahtar_ipucu";--> statement-breakpoint
ALTER TABLE "entegrator_baglanti" ADD CONSTRAINT "entegrator_baglanti_lucaFirmaId_unique" UNIQUE("luca_firma_id");