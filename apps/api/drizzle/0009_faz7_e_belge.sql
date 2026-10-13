CREATE TABLE "ebelge" (
	"id" text PRIMARY KEY NOT NULL,
	"mukellef_id" text NOT NULL,
	"tur" text NOT NULL,
	"yon" text NOT NULL,
	"ettn" text NOT NULL,
	"belge_no" text NOT NULL,
	"senaryo" text NOT NULL,
	"fatura_tipi" text NOT NULL,
	"karsi_taraf" jsonb NOT NULL,
	"duzenleme_tarihi" date NOT NULL,
	"alinma_tarihi" timestamp with time zone NOT NULL,
	"matrah" numeric(14, 2) NOT NULL,
	"kdv" numeric(14, 2) NOT NULL,
	"toplam" numeric(14, 2) NOT NULL,
	"para_birimi" text NOT NULL,
	"gib_durumu" text NOT NULL,
	"yanit" text,
	"red_nedeni" text,
	"yanitlayan_id" text,
	"yanit_tarihi" timestamp with time zone,
	"arsiv_dosya_id" text,
	CONSTRAINT "ebelge_ettn_unique" UNIQUE("ettn")
);
--> statement-breakpoint
CREATE TABLE "edefter_berat" (
	"mukellef_id" text NOT NULL,
	"donem" text NOT NULL,
	"durum" text NOT NULL,
	"yukleme_tarihi" timestamp with time zone,
	"onay_tarihi" timestamp with time zone,
	"hata_mesaji" text,
	CONSTRAINT "edefter_berat_mukellef_id_donem_pk" PRIMARY KEY("mukellef_id","donem")
);
--> statement-breakpoint
CREATE TABLE "entegrator_baglanti" (
	"id" text PRIMARY KEY NOT NULL,
	"mukellef_id" text NOT NULL,
	"durum" text NOT NULL,
	"ortam" text NOT NULL,
	"e_fatura" boolean NOT NULL,
	"e_arsiv" boolean NOT NULL,
	"e_defter" boolean NOT NULL,
	"posta_kutusu" text,
	"anahtar" text,
	"anahtar_ipucu" text,
	"son_senkron" timestamp with time zone,
	"hata_mesaji" text,
	"baglayan_id" text,
	"baglanma_tarihi" timestamp with time zone,
	CONSTRAINT "entegrator_baglanti_mukellefId_unique" UNIQUE("mukellef_id")
);
--> statement-breakpoint
CREATE TABLE "kontor_alim" (
	"id" text PRIMARY KEY NOT NULL,
	"tarih" date NOT NULL,
	"paket_adet" integer NOT NULL,
	"hediye_adet" integer NOT NULL,
	"tutar" numeric(14, 2) NOT NULL,
	"not" text,
	"ekleyen_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ebelge" ADD CONSTRAINT "ebelge_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebelge" ADD CONSTRAINT "ebelge_arsiv_dosya_id_arsiv_dosya_id_fk" FOREIGN KEY ("arsiv_dosya_id") REFERENCES "public"."arsiv_dosya"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edefter_berat" ADD CONSTRAINT "edefter_berat_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entegrator_baglanti" ADD CONSTRAINT "entegrator_baglanti_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ebelge_mukellef_tarih_idx" ON "ebelge" USING btree ("mukellef_id","duzenleme_tarihi");--> statement-breakpoint
CREATE INDEX "ebelge_yon_senaryo_idx" ON "ebelge" USING btree ("yon","senaryo");