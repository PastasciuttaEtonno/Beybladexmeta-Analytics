import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, doublePrecision, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  displayName: text("display_name").notNull(),
  photoURL: text("photo_url"),
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
