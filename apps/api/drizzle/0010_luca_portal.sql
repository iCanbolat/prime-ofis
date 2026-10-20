CREATE TABLE "luca_hesap" (
	"id" text PRIMARY KEY NOT NULL,
	"kullanici" text NOT NULL,
	"sifre" text NOT NULL,
	"sifre_ipucu" text NOT NULL,
	"durum" text NOT NULL,
	"hata_mesaji" text,
	"son_giris" timestamp with time zone,
	"kontor_bakiye" integer,
	"kontor_tarihi" timestamp with time zone,
	"dogrulama_oturum_id" text,
	"dogrulama_gorsel" text,
	"dogrulama_son_gecerlilik" timestamp with time zone,
	"guncelleyen_id" text NOT NULL,
	"guncelleme_tarihi" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entegrator_baglanti" ADD COLUMN "luca_firma_id" text;