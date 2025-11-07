import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { hashPassword, verifyPassword } from "./auth";
import { loginSchema, updateProfileSchema } from "@shared/schema";
import { db } from "./db";
import { comboStats, favoriteCombos, favoriteDecks, favoriteDeckCombos, insertFavoriteComboSchema, insertFavoriteDeckSchema } from "@shared/schema";
import { desc, asc, or, ilike, sql, eq, and } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";

// Extend express session type
declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

// Middleware to check if user is authenticated
function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Login endpoint
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const isValid = await verifyPassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      req.session.userId = user.id;
      
      // Don't send password hash to client
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.json({ success: true });
    });
  });

  // Get current user
  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user' });
    }
  });

  // Update profile
  app.patch('/api/auth/profile', requireAuth, async (req, res) => {
    try {
      const updates = updateProfileSchema.parse(req.body);
      
      const user = await storage.updateUserProfile(req.session.userId!, updates);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  // Get top combos leaderboard
  app.get('/api/stats/combos', requireAuth, async (req, res) => {
    try {
      const limitParam = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const limit = Math.max(1, Math.min(limitParam, 100));
      
      const search = req.query.search as string | undefined;
      const sortByParam = (req.query.sortBy as string) || 'score';
      const sortOrder = (req.query.sortOrder as string) || 'desc';

      const validSortFields = ['score', 'first', 'second', 'third'];
      const sortBy = validSortFields.includes(sortByParam) ? sortByParam : 'score';

      let query = db.select().from(comboStats);

      if (search && search.trim()) {
        const searchTerm = `%${search.trim()}%`;
        query = query.where(
          or(
            ilike(comboStats.blade, searchTerm),
            ilike(comboStats.assistBlade, searchTerm),
            ilike(comboStats.ratchet, searchTerm),
            ilike(comboStats.bit, searchTerm),
            ilike(comboStats.lockChip, searchTerm)
          )
        ) as any;
      }

      const sortColumn = {
        score: comboStats.punteggioTotale,
        first: comboStats.primiPosti,
        second: comboStats.secondiPosti,
        third: comboStats.terziPosti,
      }[sortBy];

      const orderFn = sortOrder === 'asc' ? asc : desc;
      const topCombos = await query.orderBy(orderFn(sortColumn!)).limit(limit);
      
      res.json({ combos: topCombos });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch combo stats' });
    }
  });

  // Get user's favorite combos
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

  // Add a favorite combo
  app.post('/api/favorites/combos', requireAuth, async (req, res) => {
    try {
      const comboData = insertFavoriteComboSchema.parse({
        ...req.body,
        userId: req.session.userId,
      });

      const [newCombo] = await db.insert(favoriteCombos)
        .values(comboData)
        .returning();
      
      res.json({ combo: newCombo });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  // Delete a favorite combo
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

  // Get user's favorite decks with combos
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

  // Add a favorite deck
  app.post('/api/favorites/decks', requireAuth, async (req, res) => {
    try {
      const { name, combos } = req.body;
      
      if (!name || !combos || combos.length !== 3) {
        return res.status(400).json({ error: 'Deck must have a name and exactly 3 combos' });
      }

      const deckData = insertFavoriteDeckSchema.parse({
        name,
        userId: req.session.userId,
      });

      const [newDeck] = await db.insert(favoriteDecks)
        .values(deckData)
        .returning();

      const combosToInsert = combos.map((combo: any, index: number) => ({
        deckId: newDeck.id,
        comboNumber: index + 1,
        blade: combo.blade,
        assistBlade: combo.assistBlade,
        ratchet: combo.ratchet,
        bit: combo.bit,
        lockChip: combo.lockChip,
      }));

      const insertedCombos = await db.insert(favoriteDeckCombos)
        .values(combosToInsert)
        .returning();
      
      res.json({ deck: { ...newDeck, combos: insertedCombos } });
    } catch (error) {
      res.status(400).json({ error: 'Invalid request' });
    }
  });

  // Delete a favorite deck
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

  // Get all unique components (for dropdowns)
  app.get('/api/components', requireAuth, async (req, res) => {
    try {
      const blades = await db.selectDistinct({ name: comboStats.blade }).from(comboStats);
      const assistBlades = await db.selectDistinct({ name: comboStats.assistBlade }).from(comboStats);
      const ratchets = await db.selectDistinct({ name: comboStats.ratchet }).from(comboStats);
      const bits = await db.selectDistinct({ name: comboStats.bit }).from(comboStats);
      const lockChips = await db.selectDistinct({ name: comboStats.lockChip }).from(comboStats);
      
      res.json({
        blades: blades.map(b => b.name).filter(n => n && n !== 'NONE' && n !== '-'),
        assistBlades: assistBlades.map(b => b.name).filter(n => n && n !== 'NONE' && n !== '-'),
        ratchets: ratchets.map(b => b.name).filter(n => n && n !== 'NONE' && n !== '-'),
        bits: bits.map(b => b.name).filter(n => n && n !== 'NONE' && n !== '-'),
        lockChips: lockChips.map(b => b.name).filter(n => n && n !== 'NONE' && n !== '-'),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch components' });
    }
  });

  // Serve public objects from storage (component images)
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res, 3600, true);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
