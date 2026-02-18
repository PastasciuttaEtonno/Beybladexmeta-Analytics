-- Migration: Add missing primary keys to ratchet_stats and bit_stats
-- These tables need composite primary keys with season for ON CONFLICT to work

-- Add primary key to ratchet_stats
ALTER TABLE ratchet_stats ADD CONSTRAINT ratchet_stats_pkey 
  PRIMARY KEY (ratchet, season);

-- Add primary key to bit_stats
ALTER TABLE bit_stats ADD CONSTRAINT bit_stats_pkey 
  PRIMARY KEY (bit, season);
