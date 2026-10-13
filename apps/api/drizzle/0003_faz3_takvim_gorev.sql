CREATE TABLE "takvim_durum" (
	"mukellef_id" text NOT NULL,
	"tip" text NOT NULL,
	"donem" text NOT NULL,
	"durum" text NOT NULL,
	"guncelleyen_id" text NOT NULL,
	"guncelleme_tarihi" timestamp with time zone NOT NULL,
	CONSTRAINT "takvim_durum_mukellef_id_tip_donem_pk" PRIMARY KEY("mukellef_id","tip","donem")
);
--> statement-breakpoint
CREATE TABLE "gorev" (
	"id" text PRIMARY KEY NOT NULL,
	"baslik" text NOT NULL,
	"aciklama" text,
	"mukellef_id" text NOT NULL,
	"tip" text NOT NULL,
	"donem" text,
	"atanan_id" text NOT NULL,
	"durum" text NOT NULL,
	"oncelik" text NOT NULL,
	"son_tarih" date NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"yorumlar" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bagli_talep_idler" text[] DEFAULT '{}'::text[] NOT NULL,
	"olusturan_id" text NOT NULL,
	"olusturma_tarihi" timestamp with time zone NOT NULL,
	"guncelleme_tarihi" timestamp with time zone NOT NULL,
	"tamamlanma_tarihi" timestamp with time zone,
	"otomatik_anahtar" text
);
--> statement-breakpoint
ALTER TABLE "takvim_durum" ADD CONSTRAINT "takvim_durum_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gorev" ADD CONSTRAINT "gorev_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gorev_otomatik_anahtar_uq" ON "gorev" USING btree ("otomatik_anahtar") WHERE "gorev"."otomatik_anahtar" is not null;--> statement-breakpoint
CREATE INDEX "gorev_atanan_durum_idx" ON "gorev" USING btree ("atanan_id","durum");--> statement-breakpoint
CREATE INDEX "gorev_mukellef_idx" ON "gorev" USING btree ("mukellef_id");