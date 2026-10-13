CREATE TABLE "aktivite" (
	"id" text PRIMARY KEY NOT NULL,
	"aktor_id" text NOT NULL,
	"eylem" text NOT NULL,
	"hedef_tip" text,
	"hedef_id" text,
	"mukellef_id" text,
	"aciklama" text,
	"zaman" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bildirim" (
	"id" text PRIMARY KEY NOT NULL,
	"tur" text NOT NULL,
	"alici_id" text,
	"aktor_id" text,
	"baslik" text NOT NULL,
	"aciklama" text,
	"link" text,
	"mukellef_id" text,
	"hedef_tip" text,
	"hedef_id" text,
	"zaman" timestamp with time zone NOT NULL,
	"okuyanlar" text[] DEFAULT '{}'::text[] NOT NULL,
	"anahtar" text
);
--> statement-breakpoint
CREATE TABLE "buro" (
	"id" text PRIMARY KEY NOT NULL,
	"ad" text NOT NULL,
	"vkn" text NOT NULL,
	"vergi_dairesi" text NOT NULL,
	"telefon" text NOT NULL,
	"eposta" text NOT NULL,
	"adres" text NOT NULL,
	"mesaj_sablonlari" jsonb NOT NULL,
	"iban" text,
	"luca_sablonu" jsonb
);
--> statement-breakpoint
CREATE TABLE "oturum" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"personel_id" text NOT NULL,
	"olusturma" timestamp with time zone NOT NULL,
	"son_gorulme" timestamp with time zone NOT NULL,
	"bitis" timestamp with time zone NOT NULL,
	"ip" text,
	"ua" text
);
--> statement-breakpoint
CREATE TABLE "personel" (
	"id" text PRIMARY KEY NOT NULL,
	"ad" text NOT NULL,
	"soyad" text NOT NULL,
	"eposta" text NOT NULL,
	"telefon" text DEFAULT '' NOT NULL,
	"rol" text NOT NULL,
	"renk" text DEFAULT 'blue' NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personel_kimlik" (
	"personel_id" text PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"guncelleme" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oturum" ADD CONSTRAINT "oturum_personel_id_personel_id_fk" FOREIGN KEY ("personel_id") REFERENCES "public"."personel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personel_kimlik" ADD CONSTRAINT "personel_kimlik_personel_id_personel_id_fk" FOREIGN KEY ("personel_id") REFERENCES "public"."personel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aktivite_mukellef_zaman_idx" ON "aktivite" USING btree ("mukellef_id","zaman" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "aktivite_hedef_idx" ON "aktivite" USING btree ("hedef_id");--> statement-breakpoint
CREATE INDEX "aktivite_zaman_idx" ON "aktivite" USING btree ("zaman" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bildirim_alici_zaman_idx" ON "bildirim" USING btree ("alici_id","zaman" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "bildirim_anahtar_uq" ON "bildirim" USING btree ("anahtar") WHERE "bildirim"."anahtar" is not null;--> statement-breakpoint
CREATE INDEX "oturum_personel_idx" ON "oturum" USING btree ("personel_id");--> statement-breakpoint
CREATE INDEX "oturum_bitis_idx" ON "oturum" USING btree ("bitis");--> statement-breakpoint
CREATE UNIQUE INDEX "personel_eposta_uq" ON "personel" USING btree (lower("eposta"));