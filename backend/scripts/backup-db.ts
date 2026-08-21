#!/usr/bin/env tsx
import "dotenv/config";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

async function run() {
  const url = process.env.DATABASE_URL || "";
  if (!url) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }
  const dir = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `backup-${ts}.dump`);
  const args = ["--format=custom", "--file", file, url];
  console.log("Starting backup:", file);
  const p = spawn("pg_dump", args, { stdio: "inherit" });
  p.on("error", (e) => {
    console.error("pg_dump failed", e?.message || e);
    process.exit(1);
  });
  p.on("exit", (code) => {
    if (code === 0) {
      console.log("Backup completed:", file);
      process.exit(0);
    } else {
      console.error("Backup failed with code", code);
      process.exit(code ?? 1);
    }
  });
}

run();