import { db } from "./db";
import { sql } from "drizzle-orm";

// Aggregated stats tables
import { comboStats, bladeStats, assistBladeStats, ratchetStats, bitStats, lockChipStats } from "@shared/schema";

export interface ExternalComboResult {
  blade: string;
  assistBlade: string;
  ratchet: string;
  bit: string;
  lockChip: string;
  placement: number; // 1, 2, 3, etc.
  totalParticipants: number;
}

// Modello punti: 1°=10, 2°=7, 3°=5, moltiplicati per numero partecipanti
export const calculatePoints = (placement: number, totalParticipants: number): number => {
  let basePoints = 0;
  if (placement === 1) basePoints = 10;
  else if (placement === 2) basePoints = 7;
  else if (placement === 3) basePoints = 5;
  else return 0; // Solo Top 3 ottengono punti
  return basePoints * totalParticipants;
};

// Esegue l'UPSERT atomico su 6 tabelle per una singola combo
export const processExternalCombo = async (result: ExternalComboResult) => {
  const points = calculatePoints(result.placement, result.totalParticipants);
  if (!points) return; // Non processare se nessun punto

  const primiPosti = result.placement === 1 ? 1 : 0;
  const secondiPosti = result.placement === 2 ? 1 : 0;
  const terziPosti = result.placement === 3 ? 1 : 0;

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, primi_posti, secondi_posti, terzi_posti, punteggio_totale, data_creazione)
      VALUES (${result.blade}, ${result.assistBlade}, ${result.ratchet}, ${result.bit}, ${result.lockChip}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points}, NOW())
      ON CONFLICT (blade, assist_blade, ratchet, bit, lock_chip)
      DO UPDATE SET
        primi_posti = combo_stats.primi_posti + ${primiPosti},
        secondi_posti = combo_stats.secondi_posti + ${secondiPosti},
        terzi_posti = combo_stats.terzi_posti + ${terziPosti},
        punteggio_totale = combo_stats.punteggio_totale + ${points}
    `);

    await tx.execute(sql`
      INSERT INTO blade_stats (blade, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
      VALUES (${result.blade}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
      ON CONFLICT (blade)
      DO UPDATE SET
        primi_posti = blade_stats.primi_posti + ${primiPosti},
        secondi_posti = blade_stats.secondi_posti + ${secondiPosti},
        terzi_posti = blade_stats.terzi_posti + ${terziPosti},
        punteggio_totale = blade_stats.punteggio_totale + ${points}
    `);

    await tx.execute(sql`
      INSERT INTO assist_blade_stats (assist_blade, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
      VALUES (${result.assistBlade}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
      ON CONFLICT (assist_blade)
      DO UPDATE SET
        primi_posti = assist_blade_stats.primi_posti + ${primiPosti},
        secondi_posti = assist_blade_stats.secondi_posti + ${secondiPosti},
        terzi_posti = assist_blade_stats.terzi_posti + ${terziPosti},
        punteggio_totale = assist_blade_stats.punteggio_totale + ${points}
    `);

    await tx.execute(sql`
      INSERT INTO ratchet_stats (ratchet, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
      VALUES (${result.ratchet}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
      ON CONFLICT (ratchet)
      DO UPDATE SET
        primi_posti = ratchet_stats.primi_posti + ${primiPosti},
        secondi_posti = ratchet_stats.secondi_posti + ${secondiPosti},
        terzi_posti = ratchet_stats.terzi_posti + ${terziPosti},
        punteggio_totale = ratchet_stats.punteggio_totale + ${points}
    `);

    await tx.execute(sql`
      INSERT INTO bit_stats (bit, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
      VALUES (${result.bit}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
      ON CONFLICT (bit)
      DO UPDATE SET
        primi_posti = bit_stats.primi_posti + ${primiPosti},
        secondi_posti = bit_stats.secondi_posti + ${secondiPosti},
        terzi_posti = bit_stats.terzi_posti + ${terziPosti},
        punteggio_totale = bit_stats.punteggio_totale + ${points}
    `);

    await tx.execute(sql`
      INSERT INTO lock_chip_stats (lock_chip, primi_posti, secondi_posti, terzi_posti, punteggio_totale)
      VALUES (${result.lockChip}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${points})
      ON CONFLICT (lock_chip)
      DO UPDATE SET
        primi_posti = lock_chip_stats.primi_posti + ${primiPosti},
        secondi_posti = lock_chip_stats.secondi_posti + ${secondiPosti},
        terzi_posti = lock_chip_stats.terzi_posti + ${terziPosti},
        punteggio_totale = lock_chip_stats.punteggio_totale + ${points}
    `);
  });
};