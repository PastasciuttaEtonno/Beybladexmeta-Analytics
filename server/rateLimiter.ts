import { db } from "./db";
import { loginAttempts } from "@shared/schema";
import { sql, and, gte } from "drizzle-orm";

interface RateLimiterConfig {
  maxAttempts: number;
  windowMinutes: number;
  blockDurationMinutes: number;
}

export class LoginRateLimiter {
  private config: RateLimiterConfig;

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = {
      maxAttempts: config?.maxAttempts ?? 5,
      windowMinutes: config?.windowMinutes ?? 15,
      blockDurationMinutes: config?.blockDurationMinutes ?? 15,
    };

    this.startCleanupInterval();
  }

  private startCleanupInterval() {
    setInterval(async () => {
      try {
        const cutoffTime = new Date(Date.now() - (24 * 60 * 60 * 1000));
        await db.delete(loginAttempts).where(
          sql`${loginAttempts.attemptedAt} < ${cutoffTime}`
        );
      } catch (error) {
        console.error('[RateLimiter] Failed to clean up old login attempts:', error);
      }
    }, 60 * 60 * 1000);
  }

  async isBlocked(ip: string, email?: string): Promise<{ blocked: boolean; remainingTime?: number }> {
    const windowStart = new Date(Date.now() - (this.config.windowMinutes * 60 * 1000));

    try {
      const ipAttempts = await db.select()
        .from(loginAttempts)
        .where(and(
          sql`${loginAttempts.ipAddress} = ${ip}`,
          sql`${loginAttempts.success} = false`,
          gte(loginAttempts.attemptedAt, windowStart)
        ))
        .orderBy(sql`${loginAttempts.attemptedAt} DESC`);

      if (ipAttempts.length >= this.config.maxAttempts) {
        const lastAttempt = ipAttempts[0].attemptedAt;
        const blockUntil = new Date(lastAttempt.getTime() + (this.config.blockDurationMinutes * 60 * 1000));
        const now = new Date();
        
        if (now < blockUntil) {
          return {
            blocked: true,
            remainingTime: Math.ceil((blockUntil.getTime() - now.getTime()) / 1000),
          };
        }
      }

      if (email) {
        const normalizedEmail = email.toLowerCase();
        const emailAttempts = await db.select()
          .from(loginAttempts)
          .where(and(
            sql`${loginAttempts.email} = ${normalizedEmail}`,
            sql`${loginAttempts.success} = false`,
            gte(loginAttempts.attemptedAt, windowStart)
          ))
          .orderBy(sql`${loginAttempts.attemptedAt} DESC`);

        if (emailAttempts.length >= this.config.maxAttempts) {
          const lastAttempt = emailAttempts[0].attemptedAt;
          const blockUntil = new Date(lastAttempt.getTime() + (this.config.blockDurationMinutes * 60 * 1000));
          const now = new Date();
          
          if (now < blockUntil) {
            return {
              blocked: true,
              remainingTime: Math.ceil((blockUntil.getTime() - now.getTime()) / 1000),
            };
          }
        }
      }

      return { blocked: false };
    } catch (error) {
      console.error('[RateLimiter] Error checking block status:', error);
      return { blocked: false };
    }
  }

  async recordFailedAttempt(ip: string, email: string) {
    try {
      const normalizedEmail = email.toLowerCase();
      await db.insert(loginAttempts).values({
        ipAddress: ip,
        email: normalizedEmail,
        success: false,
      });

      const windowStart = new Date(Date.now() - (this.config.windowMinutes * 60 * 1000));
      const ipAttempts = await db.select()
        .from(loginAttempts)
        .where(and(
          sql`${loginAttempts.ipAddress} = ${ip}`,
          sql`${loginAttempts.success} = false`,
          gte(loginAttempts.attemptedAt, windowStart)
        ));

      if (ipAttempts.length >= this.config.maxAttempts) {
        console.warn(`[Security] IP ${ip} blocked after ${ipAttempts.length} failed login attempts`);
      }

      const emailAttempts = await db.select()
        .from(loginAttempts)
        .where(and(
          sql`${loginAttempts.email} = ${normalizedEmail}`,
          sql`${loginAttempts.success} = false`,
          gte(loginAttempts.attemptedAt, windowStart)
        ));

      if (emailAttempts.length >= this.config.maxAttempts) {
        console.warn(`[Security] Email ${normalizedEmail} blocked after ${emailAttempts.length} failed login attempts`);
      }
    } catch (error) {
      console.error('[RateLimiter] Failed to record failed attempt:', error);
    }
  }

  async recordSuccessfulLogin(ip: string, email: string) {
    try {
      const normalizedEmail = email.toLowerCase();
      await db.insert(loginAttempts).values({
        ipAddress: ip,
        email: normalizedEmail,
        success: true,
      });

      const windowStart = new Date(Date.now() - (this.config.windowMinutes * 60 * 1000));
      await db.delete(loginAttempts).where(and(
        sql`${loginAttempts.success} = false`,
        sql`(${loginAttempts.ipAddress} = ${ip} OR ${loginAttempts.email} = ${normalizedEmail})`,
        gte(loginAttempts.attemptedAt, windowStart)
      ));
    } catch (error) {
      console.error('[RateLimiter] Failed to record successful login:', error);
    }
  }

  async getRemainingAttempts(ip: string, email?: string): Promise<number> {
    const windowStart = new Date(Date.now() - (this.config.windowMinutes * 60 * 1000));

    try {
      const ipAttempts = await db.select()
        .from(loginAttempts)
        .where(and(
          sql`${loginAttempts.ipAddress} = ${ip}`,
          sql`${loginAttempts.success} = false`,
          gte(loginAttempts.attemptedAt, windowStart)
        ));

      let minRemaining = this.config.maxAttempts - ipAttempts.length;

      if (email) {
        const normalizedEmail = email.toLowerCase();
        const emailAttempts = await db.select()
          .from(loginAttempts)
          .where(and(
            sql`${loginAttempts.email} = ${normalizedEmail}`,
            sql`${loginAttempts.success} = false`,
            gte(loginAttempts.attemptedAt, windowStart)
          ));

        minRemaining = Math.min(minRemaining, this.config.maxAttempts - emailAttempts.length);
      }

      return Math.max(0, minRemaining);
    } catch (error) {
      console.error('[RateLimiter] Error getting remaining attempts:', error);
      return this.config.maxAttempts;
    }
  }
}

export const loginRateLimiter = new LoginRateLimiter({
  maxAttempts: 5,
  windowMinutes: 5,
  blockDurationMinutes: 5,
});
