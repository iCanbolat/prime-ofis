CREATE TABLE "credential" (
	"id" text PRIMARY KEY NOT NULL,
	"mukellef_id" text NOT NULL,
	"sistem" text NOT NULL,
	"kullanici_adi" text NOT NULL,
	"cipher_text" text NOT NULL,
	"iv" text NOT NULL,
	"not" text,
	"son_guncelleme" timestamp with time zone NOT NULL,
	"guncelleyen_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kasa_meta" (
	"id" text PRIMARY KEY NOT NULL,
	"salt" text NOT NULL,
	"iterations" integer NOT NULL,
	"verifier" jsonb NOT NULL,
	"olusturma_tarihi" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credential" ADD CONSTRAINT "credential_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credential_mukellef_sistem_uq" ON "credential" USING btree ("mukellef_id","sistem");