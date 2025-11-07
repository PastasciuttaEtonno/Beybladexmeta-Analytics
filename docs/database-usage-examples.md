# Database Usage Examples

## Accessing the Database GUI

### Method 1: Replit Database Tool (Recommended)
1. Click the **"All tools"** icon (four squares) in the left sidebar
2. Select **"PostgreSQL database"** (elephant icon 🐘)
3. Go to **"My Data"** tab to:
   - View all tables visually in **Drizzle Studio**
   - Browse data in a spreadsheet-like interface
   - Run SQL queries in the **SQL runner**
   - Filter, sort, and export data

### Method 2: Command Line
```bash
# Connect to database using psql
psql $DATABASE_URL

# List all tables
\dt

# View table structure
\d combo_stats
```

## Code Examples

### Inserting Data

```typescript
import { db } from './server/db';
import { comboStats, bladeStats } from '@shared/schema';

// Insert a new combo result
await db.insert(comboStats).values({
  blade: 'Phoenix Wing',
  assistBlade: 'Blaze',
  ratchet: '9-60',
  bit: 'High Needle',
  lockChip: 'Phoenix',
  primiPosti: 1,  // Won 1st place
  secondiPosti: 0,
  terziPosti: 0,
  punteggioTotale: 100
});

// Update blade stats (aggregate)
await db.insert(bladeStats).values({
  blade: 'Phoenix Wing',
  primiPosti: 1,
  secondiPosti: 0,
  terziPosti: 0,
  punteggioTotale: 100
}).onConflictDoUpdate({
  target: bladeStats.blade,
  set: {
    primiPosti: sql`${bladeStats.primiPosti} + 1`,
    punteggioTotale: sql`${bladeStats.punteggioTotale} + 100`
  }
});
```

### Querying Data

```typescript
import { db } from './server/db';
import { comboStats, bladeStats } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';

// Get top 10 combos by total score
const topCombos = await db
  .select()
  .from(comboStats)
  .orderBy(desc(comboStats.punteggioTotale))
  .limit(10);

// Get stats for a specific blade
const phoenixStats = await db
  .select()
  .from(bladeStats)
  .where(eq(bladeStats.blade, 'Phoenix Wing'));

// Get all combos using a specific component
const combosWithPhoenix = await db
  .select()
  .from(comboStats)
  .where(eq(comboStats.blade, 'Phoenix Wing'))
  .orderBy(desc(comboStats.punteggioTotale));
```

### Updating Statistics

```typescript
import { db } from './server/db';
import { comboStats } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// Update an existing combo's stats
await db
  .update(comboStats)
  .set({
    primiPosti: sql`${comboStats.primiPosti} + 1`,
    punteggioTotale: sql`${comboStats.punteggioTotale} + 150`
  })
  .where(
    and(
      eq(comboStats.blade, 'Phoenix Wing'),
      eq(comboStats.assistBlade, 'Blaze'),
      eq(comboStats.ratchet, '9-60'),
      eq(comboStats.bit, 'High Needle'),
      eq(comboStats.lockChip, 'Phoenix')
    )
  );
```

## Database Tables Overview

### combo_stats
Stores performance data for each unique 5-part combination.
- **Primary Key**: Composite of all 5 components
- **Use Case**: Track which full combinations perform best in tournaments

### Component Stats Tables
Individual performance tracking for each component type:
- `blade_stats`
- `assist_blade_stats`
- `ratchet_stats`
- `bit_stats`
- `lock_chip_stats`

**Use Case**: See which individual parts are most successful across all combinations

## Running SQL Directly

You can use the SQL runner in the database GUI or the `execute_sql_tool`:

```sql
-- Get top 5 blades by 1st place finishes
SELECT blade, primi_posti, punteggio_totale 
FROM blade_stats 
ORDER BY primi_posti DESC 
LIMIT 5;

-- Find all combos with Phoenix Wing blade
SELECT * 
FROM combo_stats 
WHERE blade = 'Phoenix Wing'
ORDER BY punteggio_totale DESC;
```

## Best Practices

1. **Use Drizzle ORM** for all CRUD operations (type-safe)
2. **Pre-calculate aggregates** - Update component stats when updating combo stats
3. **Use transactions** for related updates (combo + component stats together)
4. **Query by score** for leaderboards (indexed for performance)
5. **View in GUI** for quick data inspection and debugging
