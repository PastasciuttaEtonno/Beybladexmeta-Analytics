import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, doublePrecision, primaryKey, boolean, timestamp, index, date, jsonb, pgView, serial, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ----------------------------------------------------------------------
// 1. AUTH & SESSIONI
// ----------------------------------------------------------------------

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  photoURL: text("photo_url"),
  isAdmin: boolean("is_admin").notNull().default(false),
  is_verified: boolean("is_verified").notNull().default(false),
  verification_token: text("verification_token"),
  verification_token_expires_at: timestamp("verification_token_expires_at", { withTimezone: true }),
  challengerId: text("challenger_id").unique(),
  challengermodeUsername: text("challengermode_username"),
  challongeId: text("challonge_id").unique(),
  challongeUsername: text("challonge_username"),
}, (table) => {
  return {
    emailIdx: index("users_email_idx").on(table.email),
    tokenIdx: index("users_token_idx").on(table.verification_token),
  };
});

export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
}, (table) => ({
  expireIdx: index("session_expire_idx").on(table.expire),
}));

// ----------------------------------------------------------------------
// 2. ANAGRAFICA CLUB
// ----------------------------------------------------------------------

export const clubs = pgTable("clubs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  region: text("region"),
  city: text("city"),
  logo: text("logo"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClubSchema = createInsertSchema(clubs);

// ----------------------------------------------------------------------
// 3. STATISTICHE DI GIOCO (COMPONENTI)
// ----------------------------------------------------------------------

export const comboStats = pgTable("combo_stats", {
  blade: text("blade").notNull(),
  assistBlade: text("assist_blade").notNull(),
  ratchet: text("ratchet").notNull(),
  bit: text("bit").notNull(),
  lockChip: text("lock_chip").notNull(),
  season: text("season").notNull(),
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  quartiPosti: integer("quarti_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
  dataCreazione: timestamp("data_creazione", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  pk: primaryKey({ name: "combo_stats_pkey", columns: [table.blade, table.assistBlade, table.ratchet, table.bit, table.lockChip, table.season] })
}));

export const bladeStats = pgTable("blade_stats", {
  blade: text("blade").notNull(),
  season: text("season").notNull(),
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  quartiPosti: integer("quarti_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.blade, table.season] })
}));

// MODIFICATA: Aggiunta season e Primary Key composta
export const assistBladeStats = pgTable("assist_blade_stats", {
  assistBlade: text("assist_blade").notNull(),
  season: text("season").notNull(), // <--- Aggiunta
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  quartiPosti: integer("quarti_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.assistBlade, table.season] }) // <--- PK Composta
}));

export const ratchetStats = pgTable("ratchet_stats", {
  ratchet: text("ratchet").notNull(),
  season: text("season").notNull(),
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  quartiPosti: integer("quarti_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.ratchet, table.season] })
}));

export const bitStats = pgTable("bit_stats", {
  bit: text("bit").notNull(),
  season: text("season").notNull(),
  isRatchetLess: boolean("is_ratchet_less").notNull().default(false),
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  quartiPosti: integer("quarti_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.bit, table.season] })
}));

// MODIFICATA: Aggiunta season e Primary Key composta
export const lockChipStats = pgTable("lock_chip_stats", {
  lockChip: text("lock_chip").notNull(),
  season: text("season").notNull(), // <--- Aggiunta
  primiPosti: integer("primi_posti").notNull().default(0),
  secondiPosti: integer("secondi_posti").notNull().default(0),
  terziPosti: integer("terzi_posti").notNull().default(0),
  quartiPosti: integer("quarti_posti").notNull().default(0),
  punteggioTotale: doublePrecision("punteggio_totale").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.lockChip, table.season] }) // <--- PK Composta
}));

// ----------------------------------------------------------------------
// 4. PREFERITI
// ----------------------------------------------------------------------

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

// ----------------------------------------------------------------------
// 5. ZOD SCHEMAS & TYPES
// ----------------------------------------------------------------------

export const insertUserSchema = createInsertSchema(users).omit({ id: true });

export const loginSchema = z.object({
  email: z.string().email().max(320).transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8).max(128).transform((s) => s.trim()),
});

export const registerSchema = z.object({
  email: z.string().email().max(320).transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8).max(128).transform((s) => s.trim())
    .superRefine((val, ctx) => {
      if (!/[a-z]/.test(val)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Include at least one lowercase letter" });
      if (!/[A-Z]/.test(val)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Include at least one uppercase letter" });
      if (!/[0-9]/.test(val)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Include at least one number" });
      if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/?`~]/.test(val)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Include at least one special character" });
    }),
  displayName: z.string().min(1).max(100).transform((s) => s.replace(/\s+/g, " ").trim()),
  captchaToken: z.string().min(10).max(4000).transform((s) => s.trim()),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).transform((s) => s.replace(/\s+/g, " ").trim()).optional(),
  photoURL: z.string().max(500).transform((s) => s.trim()).optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

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
    "Piemonte", "Valle d'Aosta", "Lombardia", "Trentino-Alto Adige", "Veneto",
    "Friuli-Venezia Giulia", "Liguria", "Emilia-Romagna", "Toscana", "Umbria",
    "Marche", "Lazio", "Abruzzo", "Molise", "Campania", "Puglia", "Basilicata",
    "Calabria", "Sicilia", "Sardegna",
  ]),
  firstPlaceCombos: z.array(tournamentComboSchema).length(3),
  secondPlaceCombos: z.array(tournamentComboSchema).length(3),
  thirdPlaceCombos: z.array(tournamentComboSchema).length(3),
});

export type TournamentCombo = z.infer<typeof tournamentComboSchema>;
export type TournamentResult = z.infer<typeof tournamentResultSchema>;

export const externalTournamentResultSchema = z.object({
  nomeTorneo: z.string().min(1).max(100).transform((s) => s.trim()),
  dataTorneo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  descrizione: z.string().max(500).transform((s) => s.trim()).optional(),
  participants: z.number().int().min(6).max(200),
  regione: z.enum([
    "Piemonte", "Valle d'Aosta", "Lombardia", "Trentino-Alto Adige", "Veneto",
    "Friuli-Venezia Giulia", "Liguria", "Emilia-Romagna", "Toscana", "Umbria",
    "Marche", "Lazio", "Abruzzo", "Molise", "Campania", "Puglia", "Basilicata",
    "Calabria", "Sicilia", "Sardegna",
  ]),
  tournamentId: z.string().min(1).max(64).transform((s) => s.trim()),
  firstPlacePlayerId: z.string().min(1).max(128).transform((s) => s.trim()),
  secondPlacePlayerId: z.string().min(1).max(128).transform((s) => s.trim()),
  thirdPlacePlayerId: z.string().min(1).max(128).transform((s) => s.trim()),
  fourthPlacePlayerId: z.string().min(1).max(128).transform((s) => s.trim()).optional(),
});

export type ExternalTournamentResult = z.infer<typeof externalTournamentResultSchema>;

// ----------------------------------------------------------------------
// 6. INTEGRAZIONE CHALLENGERMODE & CHALLONGE
// ----------------------------------------------------------------------

export const cmPlayers = pgTable("cm_players", {
  id: varchar("id").primaryKey(),
  nickname: text("nickname").notNull(),
  avatar: text("avatar"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const challongePlayers = pgTable("challonge_players", {
  id: varchar("id").primaryKey(),
  nickname: text("nickname").notNull(),
  avatar: text("avatar"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

// Tabella per i risultati dei match di ChallengerMode
export const cmMatchResults = pgTable("cm_match_results", {
  tournamentId: varchar("tournament_id").notNull(),
  playerId: varchar("player_id").notNull().references(() => cmPlayers.id, { onDelete: 'cascade' }),
  comboNumber: integer("combo_number").notNull(),
  blade: text("blade").notNull(),
  assistBlade: text("assist_blade").notNull(),
  ratchet: text("ratchet").notNull(),
  bit: text("bit").notNull(),
  lockChip: text("lock_chip").notNull(),
  piazzamento: integer("piazzamento").notNull(),
  numeroPartecipanti: integer("numero_partecipanti").notNull(),
  dataTorneo: date("data_torneo").notNull(),
  puntiGuadagnati: doublePrecision("punti_guadagnati").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  pk: primaryKey({ columns: [table.tournamentId, table.playerId, table.comboNumber] }),
  tournamentIdx: index("cm_match_results_tournament_idx").on(table.tournamentId),
  playerIdx: index("cm_match_results_player_idx").on(table.playerId),
}));

// Tabella per i dati grezzi di Challonge
export const userAliases = pgTable("user_aliases", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // Intentionally text to match users.id (which is uuid string but sometimes cast) - check users table definition
  alias: text("alias").notNull(),
  platform: text("platform").notNull().default("challonge"),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("user_aliases_user_id_idx").on(table.userId),
  aliasIdx: index("user_aliases_alias_idx").on(table.alias),
  lowerAliasIdx: index("idx_user_aliases_lower_alias").on(sql`LOWER(${table.alias})`),
}));

export const insertUserAliasSchema = createInsertSchema(userAliases);

export const challongeMatchResults = pgTable("challonge_match_results", {
  id: serial("id").primaryKey(),
  tournamentId: text("tournament_id").notNull().unique(),
  data: jsonb("data").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow(),
});



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

export const externalApiCache = pgTable("external_api_cache", {
  cacheKey: text("cache_key").primaryKey(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export type ExternalApiCache = typeof externalApiCache.$inferSelect;
export type InsertExternalApiCache = typeof externalApiCache.$inferInsert;

export const externalPlayerCombos = pgTable("external_player_combos", {
  tournamentId: varchar("tournament_id").notNull(),
  playerId: varchar("player_id").notNull().references(() => cmPlayers.id, { onDelete: 'cascade' }),
  comboNumber: integer("combo_number").notNull(),
  blade: text("blade").notNull(),
  assistBlade: text("assist_blade").notNull(),
  ratchet: text("ratchet").notNull(),
  bit: text("bit").notNull(),
  lockChip: text("lock_chip").notNull(),
  placement: integer("placement"),
  totalParticipants: integer("total_participants"),
  tournamentDate: date("tournament_date"),
  season: text("season"),
  platform: text("platform").notNull().default('challengermode'),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  pk: primaryKey({ columns: [table.tournamentId, table.playerId, table.comboNumber] }),
  tournamentIdx: index("external_player_combos_tournament_idx").on(table.tournamentId),
  playerIdx: index("external_player_combos_player_idx").on(table.playerId),
  comboIdx: index("external_player_combos_combo_idx").on(table.blade, table.ratchet, table.bit),
}));

export const upsertTournamentPlayerCombosSchema = z.object({
  tournamentId: z.string().min(1).max(64).transform((s) => s.trim()),
  playerId: z.string().min(1).max(128).transform((s) => s.trim()),
  combos: z.array(tournamentComboSchema).min(1).max(3),
  platform: z.string().optional().default('challengermode').transform((s) => s?.trim() || 'challengermode'),
});

export type CmPlayer = typeof cmPlayers.$inferSelect;
export type InsertCmPlayer = typeof cmPlayers.$inferInsert;

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  email: text("email").notNull(),
  action: text("action").notNull(),
  tournamentId: varchar("tournament_id"),
  playerId: varchar("player_id"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (table) => ({
  actionIdx: index("admin_audit_action_idx").on(table.action),
  tournamentIdx: index("admin_audit_tournament_idx").on(table.tournamentId),
}));

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type ExternalPlayerCombo = typeof externalPlayerCombos.$inferSelect;
export type InsertExternalPlayerCombo = typeof externalPlayerCombos.$inferInsert;
export type UpsertTournamentPlayerCombos = z.infer<typeof upsertTournamentPlayerCombosSchema>;
export type CmMatchResult = typeof cmMatchResults.$inferSelect;
export type InsertCmMatchResult = typeof cmMatchResults.$inferInsert;

export type ChallongePlayer = typeof challongePlayers.$inferSelect;
export type InsertChallongePlayer = typeof challongePlayers.$inferInsert;



export type UserAlias = typeof userAliases.$inferSelect;
export type InsertUserAlias = typeof userAliases.$inferInsert;

// ----------------------------------------------------------------------
// 7. RELATIONS
// ----------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  challengerProfile: one(cmPlayers, {
    fields: [users.challengerId],
    references: [cmPlayers.id],
  }),
  challongeProfile: one(challongePlayers, {
    fields: [users.challongeId],
    references: [challongePlayers.id],
  }),
  aliases: many(userAliases),
}));

export const cmPlayersRelations = relations(cmPlayers, ({ one }) => ({
  user: one(users, {
    fields: [cmPlayers.id],
    references: [users.challengerId],
  }),
}));

export const challongePlayersRelations = relations(challongePlayers, ({ one }) => ({
  user: one(users, {
    fields: [challongePlayers.id],
    references: [users.challongeId],
  }),
}));

// ----------------------------------------------------------------------
// 8. VISTE SQL E LEADERBOARD
// ----------------------------------------------------------------------

export const unifiedMetaView = pgView("unified_meta_view", {
  uniqueId: text("unique_id").notNull(),
  blade: text("blade"),
  assistBlade: text("assist_blade"),
  ratchet: text("ratchet"),
  bit: text("bit"),
  lockChip: text("lock_chip"),
  rank: integer("rank"),
  date: timestamp("date"),
  participantCount: integer("participant_count"),
  platform: text("platform"),
  season: text("season"),
}).existing();

// Materialized view: Platform-separated player stats
export const playerPlatformStats = pgView("player_platform_stats", {
  nickname: text("nickname").notNull(),
  playerId: text("player_id"),
  platform: text("platform").notNull(),
  avatar: text("avatar"),
  totalPoints: doublePrecision("total_points").notNull(),
  tournamentsPlayed: integer("tournaments_played").notNull(),
  wins: integer("tournaments_won").notNull(),
  top3Finishes: integer("top3_finishes").notNull(),
}).existing();

// Standard view: Aggregated player leaderboard (sums across platforms)
export const playerLeaderboardView = pgView("player_leaderboard", {
  nickname: text("nickname").notNull(),
  playerId: text("player_id"),
  avatar: text("avatar"),
  totalPoints: doublePrecision("total_points").notNull(),
  tournamentsPlayed: integer("tournaments_played").notNull(),
  wins: integer("tournaments_won").notNull(),
  top3Finishes: integer("top3_finishes").notNull(),
}).existing();

export const topComponentSnapshot = pgView("top_component_snapshot", {
  componentType: text("component_type").notNull(),
  name: text("name").notNull(),
  primiPosti: integer("primi_posti").notNull(),
  secondiPosti: integer("secondi_posti").notNull(),
  terziPosti: integer("terzi_posti").notNull(),
  punteggioTotale: doublePrecision("punteggio_totale").notNull(),
  season: text("season").notNull(),
}).existing();

// VISTA JSON TORNEI (Metadati + Regione + Piattaforma)
export const tournamentsView = pgView("tournaments_view", {
  id: text("id").notNull(),
  name: text("name"),
  date: date("date"),
  organizerName: text("organizer_name"),
  region: text("region"),
  city: text("city"),
  platform: text("platform"),
}).existing();

// ----------------------------------------------------------------------
// 9. CHALLONGE REPORTED COMBOS
// ----------------------------------------------------------------------

export const challongeReportedCombos = pgTable("challonge_reported_combos", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  tournamentId: text("tournament_id").notNull(),
  tournamentName: text("tournament_name"), // Nome del torneo
  comboNumber: integer("combo_number").notNull(),

  // Struttura Full
  blade: text("blade").notNull(),
  assistBlade: text("assist_blade"), // Opzionale nel DB, gestito da UI
  ratchet: text("ratchet").notNull(),
  bit: text("bit").notNull(),
  lockChip: text("lock_chip"),       // Opzionale nel DB

  rank: integer("rank").notNull(),
  season: text("season"), // Stagione calcolata dalla data del torneo
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueIdx: uniqueIndex("unique_user_tournament_combo_num_idx").on(table.userId, table.tournamentId, table.comboNumber),
}));

// Mantieni le relazioni come prima
export const challongeReportedCombosRelations = relations(challongeReportedCombos, ({ one }) => ({
  user: one(users, {
    fields: [challongeReportedCombos.userId],
    references: [users.id],
  }),
}));
// ----------------------------------------------------------------------
// 10. STATISTICHE REGIONALI (Leaderboard)
// ----------------------------------------------------------------------

export const playerRegionalStats = pgTable("player_regional_stats", {
  playerId: text("player_id").notNull(),
  playerName: text("player_name").notNull(),
  region: text("region").notNull(),
  season: text("season").default("Season 2026").notNull(),
  platform: text("platform").default("challengermode").notNull(),
  points: integer("points").default(0).notNull(),
  tournamentsPlayed: integer("tournaments_played").default(0).notNull(),
  wins: integer("wins").default(0).notNull(),
  top4: integer("top4").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.playerId, table.region, table.season, table.platform] }),
}));