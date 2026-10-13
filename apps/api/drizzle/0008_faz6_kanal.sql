CREATE TABLE "bildirim_tercihi" (
	"personel_id" text PRIMARY KEY NOT NULL,
	"kanallar" jsonb NOT NULL,
	"telegram_chat_id" text
);
--> statement-breakpoint
CREATE TABLE "gonderim" (
	"id" text PRIMARY KEY NOT NULL,
	"kanal" text NOT NULL,
	"alici_tip" text NOT NULL,
	"alici_id" text NOT NULL,
	"alici_ad" text NOT NULL,
	"adres" text NOT NULL,
	"hedef_adres" text,
	"konu" text NOT NULL,
	"ozet" text NOT NULL,
	"metin" text,
	"sablon" text,
	"parametreler" jsonb,
	"ek_arsiv_dosya_id" text,
	"durum" text NOT NULL,
	"hata_mesaji" text,
	"kaynak" text NOT NULL,
	"kaynak_id" text,
	"gonderen_id" text,
	"deneme_sayisi" integer DEFAULT 0 NOT NULL,
	"sonraki_deneme" timestamp with time zone,
	"saglayici_id" text,
	"anahtar" text,
	"zaman" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kanal_ayari" (
	"tip" text PRIMARY KEY NOT NULL,
	"aktif" boolean NOT NULL,
	"durum" text NOT NULL,
	"ayar" jsonb NOT NULL,
	"gizli" text,
	"gizli_ipucu" text,
	"son_test" timestamp with time zone,
	"hata_mesaji" text,
	"guncelleyen_id" text,
	"guncelleme_tarihi" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bildirim_tercihi" ADD CONSTRAINT "bildirim_tercihi_personel_id_personel_id_fk" FOREIGN KEY ("personel_id") REFERENCES "public"."personel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gonderim_zaman_idx" ON "gonderim" USING btree ("zaman" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "gonderim_kuyruk_idx" ON "gonderim" USING btree ("sonraki_deneme") WHERE "gonderim"."durum" = 'KUYRUKTA';--> statement-breakpoint
CREATE INDEX "gonderim_saglayici_idx" ON "gonderim" USING btree ("saglayici_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gonderim_anahtar_uq" ON "gonderim" USING btree ("anahtar") WHERE "gonderim"."anahtar" is not null;