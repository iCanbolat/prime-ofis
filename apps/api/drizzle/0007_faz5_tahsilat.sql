CREATE TABLE "cari_hareket" (
	"id" text PRIMARY KEY NOT NULL,
	"mukellef_id" text NOT NULL,
	"tip" text NOT NULL,
	"kalem" text NOT NULL,
	"donem" text,
	"tarih" date NOT NULL,
	"brut" numeric(14, 2) NOT NULL,
	"kdv" numeric(14, 2) NOT NULL,
	"stopaj" numeric(14, 2) NOT NULL,
	"tutar" numeric(14, 2) NOT NULL,
	"aciklama" text,
	"makbuz_no" text,
	"kapatmalar" jsonb,
	"otomatik_anahtar" text,
	"olusturan_id" text NOT NULL,
	"olusturma_tarihi" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kesinti_ice_aktarim" (
	"id" text PRIMARY KEY NOT NULL,
	"yil" integer NOT NULL,
	"dosya_adi" text NOT NULL,
	"satir_sayisi" integer NOT NULL,
	"yukleyen_id" text NOT NULL,
	"zaman" timestamp with time zone NOT NULL,
	CONSTRAINT "kesinti_ice_aktarim_yil_unique" UNIQUE("yil")
);
--> statement-breakpoint
CREATE TABLE "kesinti_kaydi" (
	"id" text PRIMARY KEY NOT NULL,
	"ice_aktarim_id" text NOT NULL,
	"vkn" text NOT NULL,
	"unvan" text NOT NULL,
	"donem" text NOT NULL,
	"matrah" numeric(14, 2) NOT NULL,
	"kesinti" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cari_hareket" ADD CONSTRAINT "cari_hareket_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kesinti_kaydi" ADD CONSTRAINT "kesinti_kaydi_ice_aktarim_id_kesinti_ice_aktarim_id_fk" FOREIGN KEY ("ice_aktarim_id") REFERENCES "public"."kesinti_ice_aktarim"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cari_hareket_otomatik_uq" ON "cari_hareket" USING btree ("otomatik_anahtar") WHERE "cari_hareket"."otomatik_anahtar" is not null;--> statement-breakpoint
CREATE INDEX "cari_hareket_mukellef_tarih_idx" ON "cari_hareket" USING btree ("mukellef_id","tarih");--> statement-breakpoint
CREATE INDEX "kesinti_kaydi_aktarim_idx" ON "kesinti_kaydi" USING btree ("ice_aktarim_id");