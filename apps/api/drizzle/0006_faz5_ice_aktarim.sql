CREATE TABLE "mizan" (
	"id" text PRIMARY KEY NOT NULL,
	"mukellef_id" text NOT NULL,
	"donem" text NOT NULL,
	"dosya_adi" text NOT NULL,
	"hesaplar" jsonb NOT NULL,
	"kontroller" jsonb NOT NULL,
	"arsiv_dosya_id" text,
	"yukleyen_id" text NOT NULL,
	"yukleme_tarihi" timestamp with time zone NOT NULL,
	CONSTRAINT "mizan_anahtar_uq" UNIQUE("mukellef_id","donem")
);
--> statement-breakpoint
CREATE TABLE "tahakkuk" (
	"id" text PRIMARY KEY NOT NULL,
	"mukellef_id" text NOT NULL,
	"tip" text NOT NULL,
	"donem" text NOT NULL,
	"beyanname_kodu" text,
	"tahakkuk_no" text,
	"odenecek" numeric(14, 2),
	"vade" date,
	"arsiv_dosya_id" text,
	"yukleyen_id" text NOT NULL,
	"yukleme_tarihi" timestamp with time zone NOT NULL,
	CONSTRAINT "tahakkuk_anahtar_uq" UNIQUE("mukellef_id","tip","donem")
);
--> statement-breakpoint
ALTER TABLE "mizan" ADD CONSTRAINT "mizan_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mizan" ADD CONSTRAINT "mizan_arsiv_dosya_id_arsiv_dosya_id_fk" FOREIGN KEY ("arsiv_dosya_id") REFERENCES "public"."arsiv_dosya"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tahakkuk" ADD CONSTRAINT "tahakkuk_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tahakkuk" ADD CONSTRAINT "tahakkuk_arsiv_dosya_id_arsiv_dosya_id_fk" FOREIGN KEY ("arsiv_dosya_id") REFERENCES "public"."arsiv_dosya"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mizan_donem_idx" ON "mizan" USING btree ("donem");