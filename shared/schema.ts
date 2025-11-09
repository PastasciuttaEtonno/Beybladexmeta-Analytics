import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, doublePrecision, primaryKey, boolean, timestamp, index, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  // --- Colonne esistenti ---
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),

  // 1. MODIFICATA: Rinominata da 'password'
  password_hash: text("password_hash").notNull(),

  displayName: text("display_name").notNull(),
  photoURL: text("photo_url"),
  isAdmin: boolean("is_admin").notNull().default(false),

  // 2. AGGIUNTE: Nuove colonne per la verifica
  is_verified: boolean("is_verified").notNull().default(false),
  verification_token: text("verification_token"),
  verification_token_expires_at: timestamp("verification_token_expires_at", {
    withTimezone: true,
  }),
}, (table) => {
  // 3. AGGIUNTI: Indici per le performance
  return {
    // L'indice su 'email' è già gestito da .unique()
    // ma aggiungerlo qui si allinea agli indici creati manualmente.
    emailIdx: index("users_email_idx").on(table.email),
    tokenIdx: index("users_token_idx").on(table.verification_token),
  };
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

export const loginSchema = z.object({
  email: z.string()
    .email()
    .max(320)
    .transform((s) => s.trim().toLowerCase()),
  password: z.string()
    .min(8)
    .max(128)
    .transform((s) => s.trim()),
});

export const registerSchema = z.object({
  email: z.string()
    .email()
    .max(320)
    .transform((s) => s.trim().toLowerCase()),
  password: z.string()
    .min(8)
    .max(128)
    .transform((s) => s.trim())
    .superRefine((val, ctx) => {
      if (!/[a-z]/.test(val)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Include at least one lowercase letter" });
      }
      if (!/[A-Z]/.test(val)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Include at least one uppercase letter" });
      }
      if (!/[0-9]/.test(val)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Include at least one number" });
      }
      if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?`~]/.test(val)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Include at least one special character" });
      }
    }),
  displayName: z.string()
    .min(1)
    .max(100)
    .transform((s) => s.replace(/\s+/g, " ").trim()),
  captchaToken: z.string().min(10).max(4000).transform((s) => s.trim()),
});

export const updateProfileSchema = z.object({
  displayName: z.string()
    .min(1)
    .max(100)
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .optional(),
  photoURL: z.string().max(500).transform((s) => s.trim()).optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const comboStats = pgTable("combo_stats", {
  blade: text("blade").notNull(),
  assistBlade: text("assist_blade").notNull(),
  ratchet: text("ratchet").notNull(),
  bit: text("bit").notNull(),
  lockChip: text("lock_chip").notNull(),
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.blade, table.assistBlade, table.ratchet, table.bit, table.lockChip] })
}));

export const bladeStats = pgTable("blade_stats", {
  blade: text("blade").primaryKey(),
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
});

export const assistBladeStats = pgTable("assist_blade_stats", {
  assistBlade: text("assist_blade").primaryKey(),
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
});

export const ratchetStats = pgTable("ratchet_stats", {
  ratchet: text("ratchet").primaryKey(),
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
});

export const bitStats = pgTable("bit_stats", {
  bit: text("bit").primaryKey(),
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
});

export const lockChipStats = pgTable("lock_chip_stats", {
  lockChip: text("lock_chip").primaryKey(),
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
});

export const insertComboStatsSchema = createInsertSchema(comboStats);
export const insertBladeStatsSchema = createInsertSchema(bladeStats);
export const insertAssistBladeStatsSchema = createInsertSchema(assistBladeStats);
export const insertRatchetStatsSchema = createInsertSchema(ratchetStats);
export const insertBitStatsSchema = createInsertSchema(bitStats);
export const insertLockChipStatsSchema = createInsertSchema(lockChipStats);

export type InsertComboStats = z.infer<typeof insertComboStatsSchema>;
export type ComboStats = typeof comboStats.$inferSelect;
export type InsertBladeStats = z.infer<typeof insertBladeStatsSchema>;
export type BladeStats = typeof bladeStats.$inferSelect;
export type InsertAssistBladeStats = z.infer<typeof insertAssistBladeStatsSchema>;
export type AssistBladeStats = typeof assistBladeStats.$inferSelect;
export type InsertRatchetStats = z.infer<typeof insertRatchetStatsSchema>;
export type RatchetStats = typeof ratchetStats.$inferSelect;
export type InsertBitStats = z.infer<typeof insertBitStatsSchema>;
export type BitStats = typeof bitStats.$inferSelect;
export type InsertLockChipStats = z.infer<typeof insertLockChipStatsSchema>;
export type LockChipStats = typeof lockChipStats.$inferSelect;

export const favoriteCombos = pgTable("favorite_combos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  blade: text("blade").notNull(),
  assistBlade: text("assist_blade").notNull(),
  ratchet: text("ratchet").notNull(),
  bit: text("bit").notNull(),
  lockChip: text("lock_chip").notNull(),
});

export const favoriteDecks = pgTable("favorite_decks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
});

export const favoriteDeckCombos = pgTable("favorite_deck_combos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deckId: varchar("deck_id").notNull().references(() => favoriteDecks.id, { onDelete: 'cascade' }),
  comboNumber: integer("combo_number").notNull(),
  blade: text("blade").notNull(),
  assistBlade: text("assist_blade").notNull(),
  ratchet: text("ratchet").notNull(),
  bit: text("bit").notNull(),
  lockChip: text("lock_chip").notNull(),
});

// Safer input schemas with trimming and sane limits
export const addFavoriteComboSchema = z.object({
  userId: z.string().min(1).max(64).transform((s) => s.trim()),
  blade: z.string().min(1).max(100).transform((s) => s.trim()),
  assistBlade: z.string().min(1).max(100).transform((s) => s.trim()),
  ratchet: z.string().min(1).max(100).transform((s) => s.trim()),
  bit: z.string().min(1).max(100).transform((s) => s.trim()),
  lockChip: z.string().min(1).max(100).transform((s) => s.trim()),
});

export const addFavoriteDeckSchema = z.object({
  userId: z.string().min(1).max(64).transform((s) => s.trim()),
  name: z.string().min(1).max(100).transform((s) => s.trim()),
});

export const addFavoriteDeckComboSchema = z.object({
  deckId: z.string().min(1).max(64).transform((s) => s.trim()),
  comboNumber: z.number().int().min(1).max(3),
  blade: z.string().min(1).max(100).transform((s) => s.trim()),
  assistBlade: z.string().min(1).max(100).transform((s) => s.trim()),
  ratchet: z.string().min(1).max(100).transform((s) => s.trim()),
  bit: z.string().min(1).max(100).transform((s) => s.trim()),
  lockChip: z.string().min(1).max(100).transform((s) => s.trim()),
});

export type InsertFavoriteCombo = z.infer<typeof addFavoriteComboSchema>;
export type FavoriteCombo = typeof favoriteCombos.$inferSelect;
export type InsertFavoriteDeck = z.infer<typeof addFavoriteDeckSchema>;
export type FavoriteDeck = typeof favoriteDecks.$inferSelect;
export type InsertFavoriteDeckCombo = z.infer<typeof addFavoriteDeckComboSchema>;
export type FavoriteDeckCombo = typeof favoriteDeckCombos.$inferSelect;

export const tournamentComboSchema = z.object({
  blade: z.string().min(1).max(100).transform((s) => s.trim()),
  assistBlade: z.string().min(1).max(100).transform((s) => s.trim()),
  ratchet: z.string().min(1).max(100).transform((s) => s.trim()),
  bit: z.string().min(1).max(100).transform((s) => s.trim()),
  lockChip: z.string().min(1).max(100).transform((s) => s.trim()),
});

export const tournamentResultSchema = z.object({
  nomeTorneo: z.string().min(1).max(100).transform((s) => s.trim()),
  dataTorneo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descrizione: z.string().max(500).transform((s) => s.trim()).optional(),
  participants: z.number().int().min(6).max(200),
  regione: z.enum([
    "Piemonte",
    "Valle d'Aosta",
    "Lombardia",
    "Trentino-Alto Adige",
    "Veneto",
    "Friuli-Venezia Giulia",
    "Liguria",
    "Emilia-Romagna",
    "Toscana",
    "Umbria",
    "Marche",
    "Lazio",
    "Abruzzo",
    "Molise",
    "Campania",
    "Puglia",
    "Basilicata",
    "Calabria",
    "Sicilia",
    "Sardegna",
  ]),
  firstPlaceCombos: z.array(tournamentComboSchema).length(3),
  secondPlaceCombos: z.array(tournamentComboSchema).length(3),
  thirdPlaceCombos: z.array(tournamentComboSchema).length(3),
});

export type TournamentCombo = z.infer<typeof tournamentComboSchema>;
export type TournamentResult = z.infer<typeof tournamentResultSchema>;

// Tornei (tournaments) table
export const tornei = pgTable("tornei", {
  torneoId: varchar("torneo_id").primaryKey().default(sql`gen_random_uuid()`),
  nomeTorneo: text("nome_torneo").notNull(),
  dataTorneo: date("data_torneo").notNull(),
  numeroPartecipanti: integer("numero_partecipanti").notNull(),
  descrizione: text("descrizione"),
  regione: text("regione").notNull(),
  dataInserimento: timestamp("data_inserimento", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  dataIdx: index("idx_tornei_data").on(table.dataTorneo),
}));

export type Torneo = typeof tornei.$inferSelect;
export type InsertTorneo = typeof tornei.$inferInsert;

// Risultati torneo (tournament results history)
export const risultatiTorneo = pgTable("risultati_torneo", {
  risultatoId: varchar("risultato_id").primaryKey().default(sql`gen_random_uuid()`),
  torneoId: varchar("torneo_id").notNull().references(() => tornei.torneoId, { onDelete: 'cascade' }),
  piazzamento: integer("piazzamento").notNull(),
  blade: text("blade").notNull(),
  assistBlade: text("assist_blade").notNull(),
  ratchet: text("ratchet").notNull(),
  bit: text("bit").notNull(),
  lockChip: text("lock_chip").notNull(),
  puntiGuadagnati: doublePrecision("punti_guadagnati").notNull(),
});

export type RisultatoTorneo = typeof risultatiTorneo.$inferSelect;
export type InsertRisultatoTorneo = typeof risultatiTorneo.$inferInsert;

export const loginAttempts = pgTable("login_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ipAddress: text("ip_address").notNull(),
  email: text("email"),
  attemptedAt: timestamp("attempted_at").notNull().defaultNow(),
  success: boolean("success").notNull().default(false),
}, (table) => ({
  ipIdx: index("login_attempts_ip_idx").on(table.ipAddress),
  emailIdx: index("login_attempts_email_idx").on(table.email),
  attemptedAtIdx: index("login_attempts_attempted_at_idx").on(table.attemptedAt),
}));

export const insertLoginAttemptSchema = createInsertSchema(loginAttempts).omit({ id: true });
export type InsertLoginAttempt = z.infer<typeof insertLoginAttemptSchema>;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
