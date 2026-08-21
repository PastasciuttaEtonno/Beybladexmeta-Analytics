import type { Express } from "express";
import { db } from "../db";
import {
  favoriteCombos, favoriteDecks, favoriteDeckCombos,
  addFavoriteComboSchema, addFavoriteDeckSchema, addFavoriteDeckComboSchema,
  bladeStats, assistBladeStats, ratchetStats, bitStats, lockChipStats,
} from "@shared/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { requireAuth } from "./middleware";

export function registerFavoritesRoutes(app: Express): void {
  app.get('/api/favorites/combos', requireAuth, async (req, res) => {
    try {
      const combos = await db.select()
        .from(favoriteCombos)
        .where(eq(favoriteCombos.userId, req.session.userId!));
      res.json({ combos });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch favorite combos' });
    }
  });

  app.post('/api/favorites/combos', requireAuth, async (req, res) => {
    try {
      const comboData = addFavoriteComboSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });

      const MAX_COMBOS = 20;
      const [existingCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(favoriteCombos)
        .where(eq(favoriteCombos.userId, comboData.userId));

      if (Number(existingCount?.count || 0) >= MAX_COMBOS) {
        return res.status(400).json({ error: `You can only save up to ${MAX_COMBOS} combos. Delete a combo to add a new one.` });
      }

      const [[bladeExists], [assistExists], [ratchetExists], [bitExists], [lockChipExists]] = await Promise.all([
        db.select({ count: sql`count(*)` }).from(bladeStats).where(eq(bladeStats.blade, comboData.blade)),
        comboData.assistBlade === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(assistBladeStats).where(eq(assistBladeStats.assistBlade, comboData.assistBlade)),
        db.select({ count: sql`count(*)` }).from(ratchetStats).where(eq(ratchetStats.ratchet, comboData.ratchet)),
        db.select({ count: sql`count(*)` }).from(bitStats).where(eq(bitStats.bit, comboData.bit)),
        comboData.lockChip === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(lockChipStats).where(eq(lockChipStats.lockChip, comboData.lockChip)),
      ]);

      if (!Number(bladeExists?.count) || !Number(assistExists?.count) || !Number(ratchetExists?.count) || !Number(bitExists?.count) || !Number(lockChipExists?.count)) {
        return res.status(400).json({ error: 'Invalid combo components' });
      }

      const [newCombo] = await db.insert(favoriteCombos)
        .values(comboData)
        .returning();

      res.json({ combo: newCombo });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  app.delete('/api/favorites/combos/:id', requireAuth, async (req, res) => {
    try {
      await db.delete(favoriteCombos)
        .where(
          and(
            eq(favoriteCombos.id, req.params.id),
            eq(favoriteCombos.userId, req.session.userId!)
          )
        );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete favorite combo' });
    }
  });

  app.get('/api/favorites/decks', requireAuth, async (req, res) => {
    try {
      const decks = await db.select()
        .from(favoriteDecks)
        .where(eq(favoriteDecks.userId, req.session.userId!));

      const decksWithCombos = await Promise.all(
        decks.map(async (deck) => {
          const combos = await db.select()
            .from(favoriteDeckCombos)
            .where(eq(favoriteDeckCombos.deckId, deck.id))
            .orderBy(asc(favoriteDeckCombos.comboNumber));
          return { ...deck, combos };
        })
      );

      res.json({ decks: decksWithCombos });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch favorite decks' });
    }
  });

  app.post('/api/favorites/decks', requireAuth, async (req, res) => {
    try {
      const { name, combos } = req.body;

      if (!name || !combos || combos.length !== 3) {
        return res.status(400).json({ error: 'Deck must have a name and exactly 3 combos' });
      }

      const MAX_DECKS = 20;
      const [existingCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(favoriteDecks)
        .where(eq(favoriteDecks.userId, req.session.userId!));

      if (Number(existingCount?.count || 0) >= MAX_DECKS) {
        return res.status(400).json({ error: `You can only save up to ${MAX_DECKS} decks. Delete a deck to add a new one.` });
      }

      const allParts: string[] = [];
      for (const combo of combos) {
        if (!combo.blade || !combo.assistBlade || !combo.ratchet || !combo.bit || !combo.lockChip) {
          return res.status(400).json({ error: 'All combo components must be filled' });
        }
        allParts.push(combo.blade, combo.ratchet, combo.bit);
        if (combo.assistBlade !== "None") allParts.push(combo.assistBlade);
        if (combo.lockChip !== "None") allParts.push(combo.lockChip);
      }

      const uniqueParts = new Set(allParts);
      if (uniqueParts.size !== allParts.length) {
        return res.status(400).json({ error: 'All parts must be different across all combos in the deck (except None for Assist Blade and Lock Chip)' });
      }

      const deckData = addFavoriteDeckSchema.parse({
        name,
        userId: req.session.userId,
      });

      const [newDeck] = await db.insert(favoriteDecks)
        .values(deckData)
        .returning();

      const combosToInsert = combos.map((combo: any, index: number) => ({
        deckId: newDeck.id,
        comboNumber: index + 1,
        blade: String(combo.blade ?? '').trim(),
        assistBlade: String(combo.assistBlade ?? '').trim(),
        ratchet: String(combo.ratchet ?? '').trim(),
        bit: String(combo.bit ?? '').trim(),
        lockChip: String(combo.lockChip ?? '').trim(),
      }));

      for (const c of combosToInsert) {
        addFavoriteDeckComboSchema.parse(c);
        const [[bladeExists], [assistExists], [ratchetExists], [bitExists], [lockChipExists]] = await Promise.all([
          db.select({ count: sql`count(*)` }).from(bladeStats).where(eq(bladeStats.blade, c.blade)),
          c.assistBlade === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(assistBladeStats).where(eq(assistBladeStats.assistBlade, c.assistBlade)),
          db.select({ count: sql`count(*)` }).from(ratchetStats).where(eq(ratchetStats.ratchet, c.ratchet)),
          db.select({ count: sql`count(*)` }).from(bitStats).where(eq(bitStats.bit, c.bit)),
          c.lockChip === 'None' ? Promise.resolve([{ count: 1 }]) : db.select({ count: sql`count(*)` }).from(lockChipStats).where(eq(lockChipStats.lockChip, c.lockChip)),
        ]);
        if (!Number(bladeExists?.count) || !Number(assistExists?.count) || !Number(ratchetExists?.count) || !Number(bitExists?.count) || !Number(lockChipExists?.count)) {
          return res.status(400).json({ error: 'Invalid deck combo components' });
        }
      }

      const insertedCombos = await db.insert(favoriteDeckCombos)
        .values(combosToInsert)
        .returning();

      res.json({ deck: { ...newDeck, combos: insertedCombos } });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  app.delete('/api/favorites/decks/:id', requireAuth, async (req, res) => {
    try {
      await db.delete(favoriteDecks)
        .where(
          and(
            eq(favoriteDecks.id, req.params.id),
            eq(favoriteDecks.userId, req.session.userId!)
          )
        );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete favorite deck' });
    }
  });
}
