# Database Management Scripts

Quick reference for all available database and setup scripts.

## Available Scripts

### 1. Database Migration

```bash
# Generate a new migration
# Replace <migration_name> with a descriptive name
npx drizzle-kit generate --name <migration_name>

# Apply migrations
tsx scripts/migrate.ts
```

### 2. Database Status Check

Shows all tables, row counts, and database size:

```bash
tsx scripts/db-status.ts
```

**Output:**
- List of all tables with row counts
- Total database size
- Number of admin users

### 3. Database Reset (⚠️ Destructive)

Drops all tables and recreates them from scratch:

```bash
tsx scripts/db-reset.ts
```

**WARNING:** This permanently deletes all data! Use only in development.

After reset, run:
```bash
tsx scripts/migrate.ts
```

### 4. Seed Sample Tournament Data

Adds sample tournament results for testing:

```bash
tsx scripts/seed-sample-data.ts
```

**What it adds:**
- 5 simulated tournaments
- 9 unique combos (3 per placement)
- Data across all 6 stats tables (combo + 5 component tables)
- Realistic scores and placements

Perfect for testing the Analytics leaderboard and Home dashboard!

### 5. Create Admin User

Interactive CLI to create an admin account:

```bash
tsx server/create-user.ts
```

**Prompts for:**
- Username
- Password
- Display name

Admin users can access the Tournament section to submit results.

### 6. Other Scripts

- `backup-db.ts`: Backs up the database.
- `create-session-table.ts`: Creates the session table.
- `create-top-component-view.ts`: Creates a materialized view for top components.
- `db-add-tournaments.ts`: Adds tournaments to the database.
- `db-clear.ts`: Clears data from most tables.
- `db-create.ts`: Creates the database.
- `db-migrate.ts`: Applies database migrations.
- `db-test-conn.ts`: Tests the database connection.
- `db-test-target.ts`: Tests the database target.
- `import-component-names.ts`: Imports component names.
- `import-csv.ts`: Imports data from a CSV file.
- `player-leaderboard-view.ts`: Creates a view for the player leaderboard.
- `refresh-view.ts`: Refreshes a materialized view.
- `reset-stats-and-combos.ts`: Resets stats and combos.

---

## Typical Development Workflow

### Initial Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your database credentials

# 3. Apply database migrations
tsx scripts/migrate.ts

# 4. Create admin user
tsx server/create-user.ts

# 5. (Optional) Add sample data
tsx scripts/seed-sample-data.ts

# 6. Start development server
npm run dev
```

### Making Database Changes

```bash
# 1. Edit shared/schema.ts

# 2. Generate a new migration
npx drizzle-kit generate --name <migration_name>

# 3. Apply the migration
tsx scripts/migrate.ts

# 4. Check status
tsx scripts/db-status.ts

# 5. Restart dev server (if running)
# Server auto-restarts on Replit
```

### Resetting Development Database

```bash
# 1. Reset database
tsx scripts/db-reset.ts

# 2. Re-apply migrations
tsx scripts/migrate.ts

# 3. Add sample data
tsx scripts/seed-sample-data.ts

# 4. Create admin user
tsx server/create-user.ts
```

---

## Script Details

### `scripts/db-status.ts`

**Purpose:** Check database health and contents

**Example Output:**
```
📊 Database Status
============================================================

📋 Tables and Row Counts:

  users                                  2 rows
  combo_stats                          150 rows
  blade_stats                           25 rows
  assist_blade_stats                     8 rows
  ratchet_stats                         12 rows
  bit_stats                             18 rows
  lock_chip_stats                        6 rows
  favorite_combos                        5 rows
  favorite_decks                         2 rows
  favorite_deck_combos                   6 rows
  login_rate_limits                      3 rows
  session                                1 rows

============================================================

💾 Database Size: 8192 kB

👑 Admin Users: 1
```

---

### `scripts/db-reset.ts`

**Purpose:** Nuclear option - wipe everything and start fresh

**Interactive Confirmation:**
```
⚠️  DATABASE RESET SCRIPT ⚠️

This will DROP ALL TABLES and recreate them from scratch.
All data will be PERMANENTLY DELETED!

Type "RESET" to confirm (or anything else to cancel):
```

**What it does:**
1. Asks for confirmation (must type "RESET")
2. Drops all tables in correct order (respects foreign keys)
3. Instructs you to run `npm run db:push`

**When to use:**
- Starting completely fresh
- Schema is in a broken state
- Migration issues

**When NOT to use:**
- Production database (obviously!)
- You have important data you want to keep
- Minor schema changes (use `npm run db:push` instead)

---

### `scripts/seed-sample-data.ts`

**Purpose:** Populate database with realistic tournament data

**What it creates:**
- **5 tournaments** with full results
- **9 unique combos:**
  - 3 first-place combos (3 points each)
  - 3 second-place combos (2 points each)
  - 3 third-place combos (1 point each)

**Sample Combos:**

*First Place:*
- CobaltDragoon + None + 5-60 + Elevate + None
- TyrannoBeats + None + 3-60 + Point + None
- LeonClaw + None + 9-60 + Taper + None

*Second Place:*
- Aero + Shark + 4-60 + Ball + LeonClaw
- Arc + Glide + 3-70 + Needle + Phoenix
- HellsScythe + None + 5-70 + HighNeedle + None

*Third Place:*
- PhoenixWing + None + 9-70 + Rush + None
- WizardArrow + None + 4-70 + Flat + None
- KnightShield + None + 3-80 + Orb + None

**After seeding:**
- Analytics page shows leaderboard
- Home dashboard displays top components
- Realistic score distribution

---

### `server/create-user.ts`

**Purpose:** Create admin or regular users

**Interactive Prompts:**

```
=== Create New User ===

Username: admin
Password: ********
Display name: Administrator
Should this user be an admin? (y/n): y

✅ User created successfully!
```

**Features:**
- Password validation
- Automatic bcrypt hashing
- Admin flag option
- UUID-based user IDs

---
### `scripts/refresh-view.ts`

**Purpose:** Refresh the materialized view `top_component_snapshot`.

**Usage:**
```bash
npx tsx scripts/refresh-view.ts
```

**Notes:** Attempts `CONCURRENTLY`, falls back to regular refresh.

---

### `scripts/db-clear.ts`

**Purpose:** Truncate data across public tables while excluding essential ones.

**Usage:**
```bash
npx tsx scripts/db-clear.ts
```

**Behavior:**
- Excludes: `session`, `users`, `cm_players`
- Truncates: stats tables, favorites, player combos, `external_api_cache`, etc.
- Resets identities and cascades for referential integrity.

**When to use:**
- Clear server-side cache quickly (`external_api_cache`)
- Wipe test data during development without dropping schema

---

## Troubleshooting

### "Cannot find module" errors

Make sure you're running scripts with `tsx`:
```bash
tsx scripts/db-status.ts
```

Not:
```bash
node scripts/db-status.ts  # ❌ Won't work
```

### Database connection errors

1. Check `.env` file exists with correct credentials
2. Verify PostgreSQL is running:
   ```bash
   pg_isready
   ```
3. Test connection:
   ```bash
   psql $DATABASE_URL -c "SELECT 1;"
   ```

### "Table already exists" errors

Use force push:
```bash
npm run db:push --force
```

Or reset and recreate:
```bash
tsx scripts/db-reset.ts
npm run db:push
```

### No admin users after reset

After resetting, you need to create a new admin:
```bash
tsx server/create-user.ts
```

---

## Adding Scripts to package.json

If you have permission to edit `package.json`, add these to the `scripts` section:

```json
{
  "scripts": {
    "db:status": "tsx scripts/db-status.ts",
    "db:reset": "tsx scripts/db-reset.ts",
    "db:seed": "tsx scripts/seed-sample-data.ts",
    "create-admin": "tsx server/create-user.ts"
  }
}
```

Then you can run them as:
```bash
npm run db:status
npm run db:reset
npm run db:seed
npm run create-admin
```

---

## Best Practices

1. **Never edit production databases** with these scripts
2. **Always backup** before running destructive operations
3. **Use `db:push`** for schema changes, not manual SQL
4. **Check status regularly** with `db-status.ts`
5. **Seed sample data** for testing and development
6. **Create admin users** via CLI, not direct SQL
7. **Use `db-clear.ts`** to clear cached/external data without schema changes

---

## Quick Commands

```bash
# Full reset workflow
tsx scripts/db-reset.ts && npm run db:push && tsx scripts/seed-sample-data.ts && tsx server/create-user.ts

# Check everything
tsx scripts/db-status.ts

# Fresh start
tsx scripts/db-reset.ts
npm run db:push
tsx server/create-user.ts
npm run dev
```

```bash
# Refresh materialized view and clear cache/data
npx tsx scripts/refresh-view.ts
npx tsx scripts/db-clear.ts
```
