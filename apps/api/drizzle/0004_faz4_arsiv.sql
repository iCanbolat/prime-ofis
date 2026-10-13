CREATE TABLE "arsiv_dosya" (
	"id" text PRIMARY KEY NOT NULL,
	"mukellef_id" text NOT NULL,
	"kategori" text NOT NULL,
	"ad" text NOT NULL,
	"mime_type" text NOT NULL,
	"boyut" integer NOT NULL,
	"yukleyen_id" text NOT NULL,
	"yukleme_tarihi" timestamp with time zone NOT NULL,
	"gecerlilik_tarihi" date,
	"donem" text,
	"bordro_belge" text,
	"silindi" boolean DEFAULT false NOT NULL,
	"silinme_tarihi" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "arsiv_dosya" ADD CONSTRAINT "arsiv_dosya_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arsiv_dosya_mukellef_kategori_idx" ON "arsiv_dosya" USING btree ("mukellef_id","kategori");--> statement-breakpoint
CREATE INDEX "arsiv_dosya_mukellef_donem_idx" ON "arsiv_dosya" USING btree ("mukellef_id","donem");--> statement-breakpoint
CREATE INDEX "arsiv_dosya_silindi_idx" ON "arsiv_dosya" USING btree ("silindi");