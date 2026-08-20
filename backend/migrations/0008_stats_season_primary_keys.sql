-- Restores the composite primary keys the aggregate stats tables are supposed
-- to have: (component, season), not (component) alone.
--
-- Why this matters: scoreExternalCombo.ts records a result with
-- `INSERT ... ON CONFLICT (blade, season) DO UPDATE`, and Postgres requires a
-- unique constraint matching those exact columns. With a primary key on the
-- component alone — or, for ratchet_stats and bit_stats, none at all — that
-- statement raises "no unique or exclusion constraint matching the ON CONFLICT
-- specification". The whole transaction rolls back, so claiming a tournament
-- result fails and the aggregates are never updated.
--
-- The Drizzle schema has always declared these as composite keys; only the
-- database drifted. migrations/0006 covered ratchet_stats and bit_stats but was
-- never applied, and it did not address the other three.
--
-- Safe to apply: (component, season) is already unique in every table and
-- `season` is NOT NULL throughout, so no data has to move.

BEGIN;

-- These three have a primary key, but on the component alone, which makes it
-- impossible to store the same component in two different seasons.
ALTER TABLE blade_stats DROP CONSTRAINT IF EXISTS blade_stats_pkey;
ALTER TABLE blade_stats ADD CONSTRAINT blade_stats_pkey PRIMARY KEY (blade, season);

ALTER TABLE assist_blade_stats DROP CONSTRAINT IF EXISTS assist_blade_stats_pkey;
ALTER TABLE assist_blade_stats ADD CONSTRAINT assist_blade_stats_pkey PRIMARY KEY (assist_blade, season);

ALTER TABLE lock_chip_stats DROP CONSTRAINT IF EXISTS lock_chip_stats_pkey;
ALTER TABLE lock_chip_stats ADD CONSTRAINT lock_chip_stats_pkey PRIMARY KEY (lock_chip, season);

-- These two have no unique constraint at all (this part is migrations/0006,
-- which was never applied).
ALTER TABLE ratchet_stats DROP CONSTRAINT IF EXISTS ratchet_stats_pkey;
ALTER TABLE ratchet_stats ADD CONSTRAINT ratchet_stats_pkey PRIMARY KEY (ratchet, season);

ALTER TABLE bit_stats DROP CONSTRAINT IF EXISTS bit_stats_pkey;
ALTER TABLE bit_stats ADD CONSTRAINT bit_stats_pkey PRIMARY KEY ("bit", season);

COMMIT;
