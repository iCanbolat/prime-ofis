CREATE TABLE "kamu_dogrulama" (
	"id" text PRIMARY KEY NOT NULL,
	"mukellef_id" text NOT NULL,
	"kurum" text NOT NULL,
	"oturum_id" text NOT NULL,
	"gorsel_data_url" text NOT NULL,
	"son_gecerlilik" timestamp with time zone NOT NULL,
	"bekleyen_adimlar" jsonb NOT NULL,
	"olusturma_tarihi" timestamp with time zone NOT NULL,
	CONSTRAINT "kamu_dogrulama_mukellef_kurum_uniq" UNIQUE("mukellef_id","kurum")
);
--> statement-breakpoint
CREATE TABLE "tebligat" (
	"id" text PRIMARY KEY NOT NULL,
	"mukellef_id" text NOT NULL,
	"vkn" text NOT NULL,
	"kurum" text NOT NULL,
	"tur" text NOT NULL,
	"konu" text NOT NULL,
	"belge_no" text,
	"ulasma_tarihi" timestamp with time zone NOT NULL,
	"sure_gun" integer,
	"durum" text NOT NULL,
	"atanan_id" text,
	"gorev_id" text,
	"arsiv_dosya_id" text,
	"not" text,
	"kaynak" text NOT NULL,
	"gib_belge_id" text,
	"olusturma_tarihi" timestamp with time zone NOT NULL,
	CONSTRAINT "tebligat_gib_belge_uniq" UNIQUE("mukellef_id","gib_belge_id")
);
--> statement-breakpoint
CREATE TABLE "tebligat_erisim" (
	"id" text PRIMARY KEY NOT NULL,
	"mukellef_id" text NOT NULL,
	"kullanici_kodu" text NOT NULL,
	"sifre_enc" text NOT NULL,
	"sifre_ipucu" text NOT NULL,
	"durum" text NOT NULL,
	"hata_mesaji" text,
	"son_tarama" timestamp with time zone,
	"kasa_kaynagi" jsonb,
	"tanimlayan_id" text NOT NULL,
	"tanimlama_tarihi" timestamp with time zone NOT NULL,
	CONSTRAINT "tebligat_erisim_mukellefId_unique" UNIQUE("mukellef_id")
);
--> statement-breakpoint
CREATE TABLE "tebligat_tarama" (
	"id" text PRIMARY KEY NOT NULL,
	"baslangic" timestamp with time zone NOT NULL,
	"bitis" timestamp with time zone NOT NULL,
	"taranan" integer NOT NULL,
	"hatali" integer NOT NULL,
	"yeni" integer NOT NULL,
	"dogrulama" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kamu_dogrulama" ADD CONSTRAINT "kamu_dogrulama_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tebligat" ADD CONSTRAINT "tebligat_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tebligat" ADD CONSTRAINT "tebligat_gorev_id_gorev_id_fk" FOREIGN KEY ("gorev_id") REFERENCES "public"."gorev"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tebligat" ADD CONSTRAINT "tebligat_arsiv_dosya_id_arsiv_dosya_id_fk" FOREIGN KEY ("arsiv_dosya_id") REFERENCES "public"."arsiv_dosya"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tebligat_erisim" ADD CONSTRAINT "tebligat_erisim_mukellef_id_mukellef_id_fk" FOREIGN KEY ("mukellef_id") REFERENCES "public"."mukellef"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tebligat_mukellef_ulasma_idx" ON "tebligat" USING btree ("mukellef_id","ulasma_tarihi");