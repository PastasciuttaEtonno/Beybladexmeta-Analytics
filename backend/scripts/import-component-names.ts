#!/usr/bin/env tsx
import "dotenv/config";
import { createReadStream } from "fs";
import { resolve } from "path";
import { parse } from "csv-parse";
import { db } from "../src/db";
import { sql } from "drizzle-orm";

type CsvRow = Record<string, string>;

async function readCsv(absFilePath: string): Promise<CsvRow[]> {
  const rows: CsvRow[] = [];
  await new Promise<void>((resolvePromise, reject) => {
    const parser = parse({ columns: true, skip_empty_lines: true, trim: true });
    parser.on("readable", () => {
      let record: any;
      while ((record = parser.read()) !== null) {
        rows.push(record as CsvRow);
      }
    });
    parser.on("error", reject);
    parser.on("end", () => resolvePromise());
    createReadStream(absFilePath).pipe(parser);
  });
  return rows;
}

async function insertNames(table: string, keyCol: string, names: string[]) {
  if (names.length === 0) return;
  await db.transaction(async (tx) => {
    for (const name of names) {
      await tx.execute(sql`
        INSERT INTO ${sql.raw(table)} (${sql.raw(keyCol)}) VALUES (${name})
        ON CONFLICT (${sql.raw(keyCol)}) DO NOTHING;
      `);
    }
  });
}

async function main() {
  const baseDir = resolve(process.cwd(), "database_data");

  const files: { path: string; table: string; key: string; headerKey: string }[] = [
    { path: resolve(baseDir, "assist_blade_stats.csv"), table: "assist_blade_stats", key: "assist_blade", headerKey: "assist_blade" },
    { path: resolve(baseDir, "bit_stats.csv"), table: "bit_stats", key: "bit", headerKey: "bit" },
    { path: resolve(baseDir, "blade_stats.csv"), table: "blade_stats", key: "blade", headerKey: "blade" },
    { path: resolve(baseDir, "lock_chip_stats.csv"), table: "lock_chip_stats", key: "lock_chip", headerKey: "lock_chip" },
    { path: resolve(baseDir, "ratchet_stats.csv"), table: "ratchet_stats", key: "ratchet", headerKey: "ratchet" },
  ];

  for (const f of files) {
    const rows = await readCsv(f.path);
    const names = rows.map(r => String(r[f.headerKey]).replace(/^"|"$/g, "").trim()).filter(Boolean);
    await insertNames(f.table, f.key, names);
    console.log(`✅ Inserted ${names.length} names into ${f.table}`);
  }

  console.log("🎉 Component names import completed.");
}

main().catch((e) => {
  console.error("❌ Import failed:", (e as any)?.message || e);
  process.exit(1);
});