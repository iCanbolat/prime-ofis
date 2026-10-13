CREATE TABLE "evrak_talebi" (
	"id" text PRIMARY KEY NOT NULL,
	"mukellef_id" text NOT NULL,
	"token" text NOT NULL,
	"kanal" text NOT NULL,
	"istenenler" text[] NOT NULL,
	"donem" text,
	"aciklama" text,
	"durum" text NOT NULL,
	"son_kullanma" timestamp with time zone NOT NULL,
	"olusturan_id" text NOT NULL,
	"olusturma_tarihi" timestamp with time zone NOT NULL,
	"gonderimler" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"musteri_notu" text,
	"tamamlanma_tarihi" timestamp with time zone,
	CONSTRAINT "evrak_talebi_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "gelen_evrak" (
	"id" text PRIMARY KEY NOT NULL,
	"talep_id" text NOT NULL,
	"mukellef_id" text NOT NULL,
	"istenen" text NOT NULL,
	"ad" text NOT NULL,
	"mime_type" text NOT NULL,
	"boyut" integer NOT NULL,
	"yukleme_tarihi" timestamp with time zone NOT NULL,
	"durum" text NOT NULL,
	"red_nedeni" text,
	"arsiv_dosya_id" text,
	"okuma_id" text,
	"inceleyen_id" text,
	"inceleme_tarihi" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "evrak_talebi" ADD CONSTRAINT "evrak_talebi_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gelen_evrak" ADD CONSTRAINT "gelen_evrak_talep_id_evrak_talebi_id_fk" FOREIGN KEY ("talep_id") REFERENCES "public"."evrak_talebi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gelen_evrak" ADD CONSTRAINT "gelen_evrak_arsiv_dosya_id_arsiv_dosya_id_fk" FOREIGN KEY ("arsiv_dosya_id") REFERENCES "public"."arsiv_dosya"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evrak_talebi_mukellef_idx" ON "evrak_talebi" USING btree ("mukellef_id");--> statement-breakpoint
CREATE INDEX "gelen_evrak_talep_idx" ON "gelen_evrak" USING btree ("talep_id");--> statement-breakpoint
CREATE INDEX "gelen_evrak_durum_idx" ON "gelen_evrak" USING btree ("durum");