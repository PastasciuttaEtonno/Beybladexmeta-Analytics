import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, doublePrecision, primaryKey, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  photoURL: text("photo_url"),
  isAdmin: boolean("is_admin").notNull().default(false),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).optional(),
  photoURL: z.string().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginInput = z.infer<typeof loginSchema>;
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

export const insertFavoriteComboSchema = createInsertSchema(favoriteCombos).omit({ id: true });
export const insertFavoriteDeckSchema = createInsertSchema(favoriteDecks).omit({ id: true });
export const insertFavoriteDeckComboSchema = createInsertSchema(favoriteDeckCombos).omit({ id: true });

export type InsertFavoriteCombo = z.infer<typeof insertFavoriteComboSchema>;
export type FavoriteCombo = typeof favoriteCombos.$inferSelect;
export type InsertFavoriteDeck = z.infer<typeof insertFavoriteDeckSchema>;
export type FavoriteDeck = typeof favoriteDecks.$inferSelect;
export type InsertFavoriteDeckCombo = z.infer<typeof insertFavoriteDeckComboSchema>;
export type FavoriteDeckCombo = typeof favoriteDeckCombos.$inferSelect;

export const tournamentComboSchema = z.object({
  blade: z.string().min(1),
  assistBlade: z.string().min(1),
  ratchet: z.string().min(1),
  bit: z.string().min(1),
  lockChip: z.string().min(1),
});

export const tournamentResultSchema = z.object({
  participants: z.number().int().min(1),
  firstPlaceCombos: z.array(tournamentComboSchema).length(3),
  secondPlaceCombos: z.array(tournamentComboSchema).length(3),
  thirdPlaceCombos: z.array(tournamentComboSchema).length(3),
});

export type TournamentCombo = z.infer<typeof tournamentComboSchema>;
export type TournamentResult = z.infer<typeof tournamentResultSchema>;
