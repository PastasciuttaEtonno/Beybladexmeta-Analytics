import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { User } from "@shared/schema";

declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function getClientIp(req: Request): string {
  return req.socket.remoteAddress || 'unknown';
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    console.log(`[Auth] Unauthorized access to ${req.method} ${req.path} - No Session/UserId. Cookie present: ${!!req.headers.cookie}`);
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    console.log(`[Admin] Unauthorized access to ${req.method} ${req.path} - No Session/UserId`);
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isAdmin) {
      console.log(`[Admin] Forbidden access to ${req.method} ${req.path} - User ${req.session.userId} is not admin`);
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to verify admin status' });
  }
}
