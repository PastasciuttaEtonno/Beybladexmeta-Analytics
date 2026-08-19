#!/usr/bin/env tsx
import "dotenv/config";
import { createReadStream, existsSync } from "fs";
import { resolve } from "path";
import { parse } from "csv-parse";
import { Pool } from "pg";
import bcrypt from "bcrypt";

const DATA_DIR = resolve(process.cwd(), "database_data");

type CsvRow = Record<string, string>;

function toInt(v: string | undefined): number {
  if (!v) return 0;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
}

function toFloat(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v);
  return Number.isNaN(n) ? 0 : n;
}

function toBool(v: string | undefined): boolean {
  return (v || "").toLowerCase() === "true";
}

function toNullable(v: string | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

async function readCsv(fileName: string): Promise<CsvRow[]> {
  const filePath = resolve(DATA_DIR, fileName);
  if (!existsSync(filePath)) {
    console.warn(`⚠️  CSV not found, skipping: ${filePath}`);
    return [];
  }
  const rows: CsvRow[] = [];
  await new Promise<void>((resolvePromise, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, trim: true });
    parser.on("readable", () => {
      let record;
      // eslint-disable-next-line no-cond-assign
      while ((record = parser.read()) !== null) {
        rows.push(record as CsvRow);
      }
    });
    parser.on("error", reject);
    parser.on("end", () => resolvePromise());
    createReadStream(filePath).pipe(parser);
  });
  return rows;
}

async function importUsers(pool: Pool) {
  const rows = await readCsv("users.csv");
  if (rows.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      const rawPassword = r.password || "password123";
      const hashed = await bcrypt.hash(rawPassword, 10);
      await client.query(
        `INSERT INTO users (id, email, password_hash, display_name, photo_url, is_admin)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash,
           display_name = EXCLUDED.display_name,
           photo_url = EXCLUDED.photo_url,
           is_admin = EXCLUDED.is_admin`,
        [
          r.id,
          r.email,
          hashed,
          r.display_name,
          toNullable(r.photo_url),
          toBool(r.is_admin),
        ],
      );
    }
    await client.query("COMMIT");
    console.log(`✅ Imported users: ${rows.length}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ Users import failed:", (e as any)?.message || e);
    throw e;
  } finally {
    client.release();
  }
}

async function importComboStats(pool: Pool) {
  const rows = await readCsv("combo_stats.csv");
  if (rows.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      await client.query(
        `INSERT INTO combo_stats (
           blade, assist_blade, ratchet, bit, lock_chip,
           primi_posti, secondi_posti, terzi_posti, punteggio_totale
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (blade, assist_blade, ratchet, bit, lock_chip) DO UPDATE SET
           primi_posti = EXCLUDED.primi_posti,
           secondi_posti = EXCLUDED.secondi_posti,
           terzi_posti = EXCLUDED.terzi_posti,
           punteggio_totale = EXCLUDED.punteggio_totale`,
        [
          r.blade,
          r.assist_blade,
          r.ratchet,
          r.bit,
          r.lock_chip,
          toInt(r.primi_posti),
          toInt(r.secondi_posti),
          toInt(r.terzi_posti),
          toFloat(r.punteggio_totale),
        ],
      );
    }
    await client.query("COMMIT");
    console.log(`✅ Imported combo_stats: ${rows.length}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ combo_stats import failed:", (e as any)?.message || e);
    throw e;
  } finally {
    client.release();
  }
}

async function importSimpleStats(pool: Pool, file: string, table: string, keyCol: string) {
  const rows = await readCsv(file);
  if (rows.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      await client.query(
        `INSERT INTO ${table} (${keyCol}, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (${keyCol}) DO UPDATE SET
           primi_posti = EXCLUDED.primi_posti,
           secondi_posti = EXCLUDED.secondi_posti,
           terzi_posti = EXCLUDED.terzi_posti,
           punteggio_totale = EXCLUDED.punteggio_totale`,
        [
          r[keyCol],
          toInt(r.primi_posti),
          toInt(r.secondi_posti),
          toInt(r.terzi_posti),
          toFloat(r.punteggio_totale),
        ],
      );
    }
    await client.query("COMMIT");
    console.log(`✅ Imported ${table}: ${rows.length}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`❌ ${table} import failed:`, (e as any)?.message || e);
    throw e;
  } finally {
    client.release();
  }
}

async function importFavorites(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // favorite_combos
    const combos = await readCsv("favorite_combos.csv");
    for (const r of combos) {
      await client.query(
        `INSERT INTO favorite_combos (id, user_id, blade, assist_blade, ratchet, bit, lock_chip)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           blade = EXCLUDED.blade,
           assist_blade = EXCLUDED.assist_blade,
           ratchet = EXCLUDED.ratchet,
           bit = EXCLUDED.bit,
           lock_chip = EXCLUDED.lock_chip`,
        [r.id, r.user_id, r.blade, r.assist_blade, r.ratchet, r.bit, r.lock_chip],
      );
    }

    // favorite_decks
    const decks = await readCsv("favorite_decks.csv");
    for (const r of decks) {
      await client.query(
        `INSERT INTO favorite_decks (id, user_id, name)
         VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           name = EXCLUDED.name`,
        [r.id, r.user_id, r.name],
      );
    }

    // favorite_deck_combos
    const deckCombos = await readCsv("favorite_deck_combos.csv");
    for (const r of deckCombos) {
      await client.query(
        `INSERT INTO favorite_deck_combos (id, deck_id, combo_number, blade, assist_blade, ratchet, bit, lock_chip)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           deck_id = EXCLUDED.deck_id,
           combo_number = EXCLUDED.combo_number,
           blade = EXCLUDED.blade,
           assist_blade = EXCLUDED.assist_blade,
           ratchet = EXCLUDED.ratchet,
           bit = EXCLUDED.bit,
           lock_chip = EXCLUDED.lock_chip`,
        [r.id, r.deck_id, toInt(r.combo_number), r.blade, r.assist_blade, r.ratchet, r.bit, r.lock_chip],
      );
    }

    await client.query("COMMIT");
    console.log(`✅ Imported favorites: combos=${combos.length}, decks=${decks.length}, deck_combos=${deckCombos.length}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ favorites import failed:", (e as any)?.message || e);
    throw e;
  } finally {
    client.release();
  }
}

async function importLoginAttempts(pool: Pool) {
  const rows = await readCsv("login_attempts.csv");
  if (rows.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const r of rows) {
      const attemptedAtRaw = r.attempted_at?.replace(/^"+|"+$/g, "");
      const attemptedAt = attemptedAtRaw ? new Date(attemptedAtRaw) : new Date();
      await client.query(
        `INSERT INTO login_attempts (id, ip_address, email, attempted_at, success)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET
           ip_address = EXCLUDED.ip_address,
           email = EXCLUDED.email,
           attempted_at = EXCLUDED.attempted_at,
           success = EXCLUDED.success`,
        [r.id, r.ip_address, toNullable(r.email), attemptedAt, toBool(r.success)],
      );
    }
    await client.query("COMMIT");
    console.log(`✅ Imported login_attempts: ${rows.length}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ login_attempts import failed:", (e as any)?.message || e);
    throw e;
  } finally {
    client.release();
  }
}

async function importSessions(pool: Pool) {
  const rows = await readCsv("session.csv");
  if (rows.length === 0) return;
  const client = await pool.connect();
  try {
    // Check table exists
    const exists = await client.query(`SELECT to_regclass('public.session') AS t`);
    if (!exists.rows[0]?.t) {
      console.warn("⚠️  Skipping session import: table 'session' does not exist yet. Start the server once to create it.");
      return;
    }
    await client.query("BEGIN");
    for (const r of rows) {
      let sessStr = r.sess;
      // Normalize nested quotes
      if (sessStr?.startsWith("\"") && sessStr?.endsWith("\"")) {
        sessStr = sessStr.slice(1, -1);
      }
      // If it's a JSON string, ensure valid JSON
      let sessJson: string = sessStr || "{}";
      try {
        const obj = JSON.parse(sessStr || "{}");
        sessJson = JSON.stringify(obj);
      } catch {
        // keep original
      }

      let expireRaw = r.expire;
      if (expireRaw?.startsWith("\"") && expireRaw?.endsWith("\"")) {
        expireRaw = expireRaw.slice(1, -1);
      }
      const expire = expireRaw ? new Date(expireRaw) : new Date(Date.now() + 7 * 24 * 3600 * 1000);

      await client.query(
        `INSERT INTO session (sid, sess, expire)
         VALUES ($1, $2::json, $3)
         ON CONFLICT (sid) DO UPDATE SET
           sess = EXCLUDED.sess,
           expire = EXCLUDED.expire`,
        [r.sid, sessJson, expire],
      );
    }
    await client.query("COMMIT");
    console.log(`✅ Imported session rows: ${rows.length}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("❌ session import failed:", (e as any)?.message || e);
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set");
  const pool = new Pool({ connectionString: url });

  try {
    console.log("🚀 Starting CSV import from:", DATA_DIR);

    await importUsers(pool);
    await importComboStats(pool);
    await importSimpleStats(pool, "blade_stats.csv", "blade_stats", "blade");
    await importSimpleStats(pool, "assist_blade_stats.csv", "assist_blade_stats", "assist_blade");
    await importSimpleStats(pool, "ratchet_stats.csv", "ratchet_stats", "ratchet");
    await importSimpleStats(pool, "bit_stats.csv", "bit_stats", "bit");
    await importSimpleStats(pool, "lock_chip_stats.csv", "lock_chip_stats", "lock_chip");

    await importFavorites(pool);
    await importLoginAttempts(pool);
    await importSessions(pool);

    console.log("🎉 Import completed successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ Import failed:", (e as any)?.message || e);
  process.exit(1);
});