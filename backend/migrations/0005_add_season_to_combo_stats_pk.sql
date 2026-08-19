-- Migration: Add season to combo_stats primary key
-- This fixes the ON CONFLICT error when inserting Challonge combos

-- Drop the old primary key constraint
ALTER TABLE combo_stats DROP CONSTRAINT IF EXISTS combo_stats_pkey;

-- Add the new primary key with season included
ALTER TABLE combo_stats ADD CONSTRAINT combo_stats_pkey 
  PRIMARY KEY (blade, assist_blade, ratchet, bit, lock_chip, season);
