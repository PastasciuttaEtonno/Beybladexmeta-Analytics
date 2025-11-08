// Load .env only in non-production environments; production should use real env vars
if (process.env.NODE_ENV !== 'production') {
  try {
    await import('dotenv/config');
  } catch {
    // dotenv is optional in development; ignore if not installed
  }
}
import * as schema from "@shared/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL must be set");
}

const isNeon = /neon\.tech/.test(url) || /sslmode=require/.test(url);

let db: any;
if (isNeon) {
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  db = drizzle(sql, { schema });
} else {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url });
  db = drizzle(pool, { schema });
}

export { db };
