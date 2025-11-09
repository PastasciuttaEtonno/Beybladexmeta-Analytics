-- Create required extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- Create tornei table (tournaments)
CREATE TABLE IF NOT EXISTS public.tornei (
  torneo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_torneo TEXT NOT NULL,
  data_torneo DATE NOT NULL,
  numero_partecipanti INTEGER NOT NULL,
  descrizione TEXT NULL,
  data_inserimento TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- Index on tournament date
CREATE INDEX IF NOT EXISTS idx_tornei_data ON public.tornei (data_torneo);
--> statement-breakpoint

-- Create risultati_torneo table (tournament results history)
CREATE TABLE IF NOT EXISTS public.risultati_torneo (
  risultato_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id UUID NOT NULL REFERENCES public.tornei(torneo_id) ON DELETE CASCADE,
  piazzamento INTEGER NOT NULL,
  blade TEXT NOT NULL,
  assist_blade TEXT NOT NULL,
  ratchet TEXT NOT NULL,
  bit TEXT NOT NULL,
  lock_chip TEXT NOT NULL,
  punti_guadagnati DOUBLE PRECISION NOT NULL
);
--> statement-breakpoint