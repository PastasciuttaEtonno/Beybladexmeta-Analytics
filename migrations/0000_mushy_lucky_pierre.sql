CREATE TABLE "assist_blade_stats" (
	"assist_blade" text PRIMARY KEY NOT NULL,
	"primi_posti" integer DEFAULT 0 NOT NULL,
	"secondi_posti" integer DEFAULT 0 NOT NULL,
	"terzi_posti" integer DEFAULT 0 NOT NULL,
	"punteggio_totale" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bit_stats" (
	"bit" text PRIMARY KEY NOT NULL,
	"primi_posti" integer DEFAULT 0 NOT NULL,
	"secondi_posti" integer DEFAULT 0 NOT NULL,
	"terzi_posti" integer DEFAULT 0 NOT NULL,
	"punteggio_totale" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blade_stats" (
	"blade" text PRIMARY KEY NOT NULL,
	"primi_posti" integer DEFAULT 0 NOT NULL,
	"secondi_posti" integer DEFAULT 0 NOT NULL,
	"terzi_posti" integer DEFAULT 0 NOT NULL,
	"punteggio_totale" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combo_stats" (
	"blade" text NOT NULL,
	"assist_blade" text NOT NULL,
	"ratchet" text NOT NULL,
	"bit" text NOT NULL,
	"lock_chip" text NOT NULL,
	"primi_posti" integer DEFAULT 0 NOT NULL,
	"secondi_posti" integer DEFAULT 0 NOT NULL,
	"terzi_posti" integer DEFAULT 0 NOT NULL,
	"punteggio_totale" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "combo_stats_blade_assist_blade_ratchet_bit_lock_chip_pk" PRIMARY KEY("blade","assist_blade","ratchet","bit","lock_chip")
);
--> statement-breakpoint
CREATE TABLE "favorite_combos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"blade" text NOT NULL,
	"assist_blade" text NOT NULL,
	"ratchet" text NOT NULL,
	"bit" text NOT NULL,
	"lock_chip" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorite_deck_combos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deck_id" varchar NOT NULL,
	"combo_number" integer NOT NULL,
	"blade" text NOT NULL,
	"assist_blade" text NOT NULL,
	"ratchet" text NOT NULL,
	"bit" text NOT NULL,
	"lock_chip" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorite_decks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lock_chip_stats" (
	"lock_chip" text PRIMARY KEY NOT NULL,
	"primi_posti" integer DEFAULT 0 NOT NULL,
	"secondi_posti" integer DEFAULT 0 NOT NULL,
	"terzi_posti" integer DEFAULT 0 NOT NULL,
	"punteggio_totale" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" text NOT NULL,
	"email" text,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"success" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratchet_stats" (
	"ratchet" text PRIMARY KEY NOT NULL,
	"primi_posti" integer DEFAULT 0 NOT NULL,
	"secondi_posti" integer DEFAULT 0 NOT NULL,
	"terzi_posti" integer DEFAULT 0 NOT NULL,
	"punteggio_totale" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"display_name" text NOT NULL,
	"photo_url" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "favorite_combos" ADD CONSTRAINT "favorite_combos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_deck_combos" ADD CONSTRAINT "favorite_deck_combos_deck_id_favorite_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."favorite_decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_decks" ADD CONSTRAINT "favorite_decks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "login_attempts_attempted_at_idx" ON "login_attempts" USING btree ("attempted_at");