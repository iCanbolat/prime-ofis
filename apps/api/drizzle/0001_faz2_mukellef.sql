CREATE TABLE "mukellef" (
	"id" text PRIMARY KEY NOT NULL,
	"tur" text NOT NULL,
	"unvan" text NOT NULL,
	"vkn" text,
	"tckn" text,
	"ticaret_sicil_no" text,
	"mersis_no" text,
	"vergi_dairesi" text NOT NULL,
	"nace_kodu" text NOT NULL,
	"faaliyet" text NOT NULL,
	"telefon" text NOT NULL,
	"eposta" text NOT NULL,
	"il" text NOT NULL,
	"ilce" text NOT NULL,
	"adres" text NOT NULL,
	"sorumlu_personel_id" text NOT NULL,
	"kdv_mukellefi" boolean NOT NULL,
	"kdv_periyodu" text NOT NULL,
	"defter_turu" text NOT NULL,
	"sgk_isyeri_var" boolean NOT NULL,
	"calisan_sayisi" integer NOT NULL,
	"e_defter_mukellefi" boolean NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"etiketler" text[] DEFAULT '{}'::text[] NOT NULL,
	"olusturma_tarihi" timestamp with time zone NOT NULL,
	"ucret" jsonb,
	"tercih_kanal" text
);
--> statement-breakpoint
ALTER TABLE "mukellef" ADD CONSTRAINT "mukellef_sorumlu_personel_id_personel_id_fk" FOREIGN KEY ("sorumlu_personel_id") REFERENCES "public"."personel"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mukellef_vkn_uq" ON "mukellef" USING btree ("vkn") WHERE "mukellef"."vkn" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "mukellef_tckn_uq" ON "mukellef" USING btree ("tckn") WHERE "mukellef"."tckn" is not null;--> statement-breakpoint
CREATE INDEX "mukellef_sorumlu_idx" ON "mukellef" USING btree ("sorumlu_personel_id");