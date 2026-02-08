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
  season: string;
  placement: number; // 1, 2, 3, etc.
  totalParticipants: number;
}

// Modello punti: 1°=10, 2°=7, 3°=5, moltiplicati per numero partecipanti
export const calculatePoints = (placement: number, totalParticipants: number): number => {
  let basePoints = 0;
  if (placement === 1) basePoints = 10;
  else if (placement === 2) basePoints = 7;
  else if (placement === 2) basePoints = 7;
  else if (placement === 3) basePoints = 5;
  else if (placement === 4) basePoints = 3;
  else return 0; // Solo Top 4 ottengono punti
  return basePoints * totalParticipants;
};

// Helper function to get placement counts
const getPlacementCounts = (placement: number) => {
  const primiPosti = placement === 1 ? 1 : 0;
  const secondiPosti = placement === 2 ? 1 : 0;
  const terziPosti = placement === 3 ? 1 : 0;
  const quartiPosti = placement === 4 ? 1 : 0;
  return { primiPosti, secondiPosti, terziPosti, quartiPosti };
};

// Esegue l'UPSERT atomico su 6 tabelle per una singola combo
export const processExternalCombo = async (result: ExternalComboResult) => {
  const points = calculatePoints(result.placement, result.totalParticipants);
  if (!points) return; // Non processare se nessun punto

  const { primiPosti, secondiPosti, terziPosti, quartiPosti } = getPlacementCounts(result.placement);

  await db.transaction(async (tx: any) => {
    await tx.execute(sql`
      INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, season, primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale, data_creazione)
      VALUES (${result.blade}, ${result.assistBlade}, ${result.ratchet}, ${result.bit}, ${result.lockChip}, ${result.season}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${quartiPosti}, ${points}, NOW())
      ON CONFLICT (blade, assist_blade, ratchet, bit, lock_chip, season)
      DO UPDATE SET
        primi_posti = combo_stats.primi_posti + ${primiPosti},
        secondi_posti = combo_stats.secondi_posti + ${secondiPosti},
        terzi_posti = combo_stats.terzi_posti + ${terziPosti},
        quarti_posti = combo_stats.quarti_posti + ${quartiPosti},
        punteggio_totale = combo_stats.punteggio_totale + ${points}
    `);

    await tx.execute(sql`
      INSERT INTO blade_stats (blade, season, primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale)
      VALUES (${result.blade}, ${result.season}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${quartiPosti}, ${points})
      ON CONFLICT (blade, season)
      DO UPDATE SET
        primi_posti = blade_stats.primi_posti + ${primiPosti},
        secondi_posti = blade_stats.secondi_posti + ${secondiPosti},
        terzi_posti = blade_stats.terzi_posti + ${terziPosti},
        quarti_posti = blade_stats.quarti_posti + ${quartiPosti},
        punteggio_totale = blade_stats.punteggio_totale + ${points}
    `);

    await tx.execute(sql`
      INSERT INTO assist_blade_stats (assist_blade, season, primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale)
      VALUES (${result.assistBlade}, ${result.season}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${quartiPosti}, ${points})
      ON CONFLICT (assist_blade, season)
      DO UPDATE SET
        primi_posti = assist_blade_stats.primi_posti + ${primiPosti},
        secondi_posti = assist_blade_stats.secondi_posti + ${secondiPosti},
        terzi_posti = assist_blade_stats.terzi_posti + ${terziPosti},
        quarti_posti = assist_blade_stats.quarti_posti + ${quartiPosti},
        punteggio_totale = assist_blade_stats.punteggio_totale + ${points}
    `);

    await tx.execute(sql`
      INSERT INTO ratchet_stats (ratchet, season, primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale)
      VALUES (${result.ratchet}, ${result.season}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${quartiPosti}, ${points})
      ON CONFLICT (ratchet, season)
      DO UPDATE SET
        primi_posti = ratchet_stats.primi_posti + ${primiPosti},
        secondi_posti = ratchet_stats.secondi_posti + ${secondiPosti},
        terzi_posti = ratchet_stats.terzi_posti + ${terziPosti},
        quarti_posti = ratchet_stats.quarti_posti + ${quartiPosti},
        punteggio_totale = ratchet_stats.punteggio_totale + ${points}
    `);

    await tx.execute(sql`
      INSERT INTO bit_stats (bit, season, primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale)
      VALUES (${result.bit}, ${result.season}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${quartiPosti}, ${points})
      ON CONFLICT (bit, season)
      DO UPDATE SET
        primi_posti = bit_stats.primi_posti + ${primiPosti},
        secondi_posti = bit_stats.secondi_posti + ${secondiPosti},
        terzi_posti = bit_stats.terzi_posti + ${terziPosti},
        quarti_posti = bit_stats.quarti_posti + ${quartiPosti},
        punteggio_totale = bit_stats.punteggio_totale + ${points}
    `);

    await tx.execute(sql`
      INSERT INTO lock_chip_stats (lock_chip, season, primi_posti, secondi_posti, terzi_posti, quarti_posti, punteggio_totale)
      VALUES (${result.lockChip}, ${result.season}, ${primiPosti}, ${secondiPosti}, ${terziPosti}, ${quartiPosti}, ${points})
      ON CONFLICT (lock_chip, season)
      DO UPDATE SET
        primi_posti = lock_chip_stats.primi_posti + ${primiPosti},
        secondi_posti = lock_chip_stats.secondi_posti + ${secondiPosti},
        terzi_posti = lock_chip_stats.terzi_posti + ${terziPosti},
        quarti_posti = lock_chip_stats.quarti_posti + ${quartiPosti},
        punteggio_totale = lock_chip_stats.punteggio_totale + ${points}
    `);
  });
};

export const revertExternalCombo = async (result: ExternalComboResult) => {
  const points = calculatePoints(result.placement, result.totalParticipants);
  if (!points) return;

  const primiPosti = result.placement === 1 ? 1 : 0;
  const secondiPosti = result.placement === 2 ? 1 : 0;
  const terziPosti = result.placement === 3 ? 1 : 0;
  const quartiPosti = result.placement === 4 ? 1 : 0;

  await db.transaction(async (tx: any) => {
    await tx.execute(sql`
      UPDATE combo_stats
      SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
          secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
          terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
          quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
          punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
      WHERE blade = ${result.blade}
        AND assist_blade = ${result.assistBlade}
        AND ratchet = ${result.ratchet}
        AND bit = ${result.bit}
        AND lock_chip = ${result.lockChip}
        AND season = ${result.season}
    `);

    await tx.execute(sql`
      UPDATE blade_stats
      SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
          secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
          terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
          quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
          punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
      WHERE blade = ${result.blade}
        AND season = ${result.season}
    `);

    await tx.execute(sql`
      UPDATE assist_blade_stats
      SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
          secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
          terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
          quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
          punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
      WHERE assist_blade = ${result.assistBlade}
        AND season = ${result.season}
    `);

    await tx.execute(sql`
      UPDATE ratchet_stats
      SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
          secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
          terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
          quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
          punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
      WHERE ratchet = ${result.ratchet}
        AND season = ${result.season}
    `);

    await tx.execute(sql`
      UPDATE bit_stats
      SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
          secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
          terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
          quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
          punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
      WHERE bit = ${result.bit}
        AND season = ${result.season}
    `);

    await tx.execute(sql`
      UPDATE lock_chip_stats
      SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
          secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
          terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
          quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
          punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
      WHERE lock_chip = ${result.lockChip}
        AND season = ${result.season}
    `);
  });
};

export const revertExternalComboTx = async (tx: any, result: ExternalComboResult) => {
  const points = calculatePoints(result.placement, result.totalParticipants);
  if (!points) return;

  const primiPosti = result.placement === 1 ? 1 : 0;
  const secondiPosti = result.placement === 2 ? 1 : 0;
  const terziPosti = result.placement === 3 ? 1 : 0;
  const quartiPosti = result.placement === 4 ? 1 : 0;

  await tx.execute(sql`
    UPDATE combo_stats
    SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
        secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
        terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
        quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
        punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
    WHERE blade = ${result.blade}
      AND assist_blade = ${result.assistBlade}
      AND ratchet = ${result.ratchet}
      AND bit = ${result.bit}
      AND lock_chip = ${result.lockChip}
      AND season = ${result.season}
  `);

  await tx.execute(sql`
    UPDATE blade_stats
    SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
        secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
        terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
        quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
        punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
    WHERE blade = ${result.blade}
      AND season = ${result.season}
  `);

  await tx.execute(sql`
    UPDATE assist_blade_stats
    SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
        secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
        terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
        quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
        punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
    WHERE assist_blade = ${result.assistBlade}
      AND season = ${result.season}
  `);

  await tx.execute(sql`
    UPDATE ratchet_stats
    SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
        secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
        terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
        quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
        punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
    WHERE ratchet = ${result.ratchet}
      AND season = ${result.season}
  `);

  await tx.execute(sql`
    UPDATE bit_stats
    SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
        secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
        terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
        quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
        punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
    WHERE bit = ${result.bit}
      AND season = ${result.season}
  `);

  await tx.execute(sql`
    UPDATE lock_chip_stats
    SET primi_posti = GREATEST(primi_posti - ${primiPosti}, 0),
        secondi_posti = GREATEST(secondi_posti - ${secondiPosti}, 0),
        terzi_posti = GREATEST(terzi_posti - ${terziPosti}, 0),
        quarti_posti = GREATEST(quarti_posti - ${quartiPosti}, 0),
        punteggio_totale = GREATEST(punteggio_totale - ${points}, 0)
    WHERE lock_chip = ${result.lockChip}
      AND season = ${result.season}
  `);
};
