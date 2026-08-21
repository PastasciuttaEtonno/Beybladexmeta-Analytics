#!/usr/bin/env tsx

/**
 * Seed Sample Tournament Data
 * Adds sample tournament results for testing
 */

import { db } from "../src/db";
import {
  comboStats,
  bladeStats,
  assistBladeStats,
  ratchetStats,
  bitStats,
  lockChipStats,
} from "@shared/schema";
import { sql } from "drizzle-orm";

const sampleCombos = [
  // First place combos
  {
    blade: "CobaltDragoon",
    assistBlade: "None",
    ratchet: "5-60",
    bit: "Elevate",
    lockChip: "None",
    placement: 1,
  },
  {
    blade: "TyrannoBeats",
    assistBlade: "None",
    ratchet: "3-60",
    bit: "Point",
    lockChip: "None",
    placement: 1,
  },
  {
    blade: "LeonClaw",
    assistBlade: "None",
    ratchet: "9-60",
    bit: "Taper",
    lockChip: "None",
    placement: 1,
  },

  // Second place combos
  {
    blade: "Aero",
    assistBlade: "Shark",
    ratchet: "4-60",
    bit: "Ball",
    lockChip: "LeonClaw",
    placement: 2,
  },
  {
    blade: "Arc",
    assistBlade: "Glide",
    ratchet: "3-70",
    bit: "Needle",
    lockChip: "Phoenix",
    placement: 2,
  },
  {
    blade: "HellsScythe",
    assistBlade: "None",
    ratchet: "5-70",
    bit: "HighNeedle",
    lockChip: "None",
    placement: 2,
  },

  // Third place combos
  {
    blade: "PhoenixWing",
    assistBlade: "None",
    ratchet: "9-70",
    bit: "Rush",
    lockChip: "None",
    placement: 3,
  },
  {
    blade: "WizardArrow",
    assistBlade: "None",
    ratchet: "4-70",
    bit: "Flat",
    lockChip: "None",
    placement: 3,
  },
  {
    blade: "KnightShield",
    assistBlade: "None",
    ratchet: "3-80",
    bit: "Orb",
    lockChip: "None",
    placement: 3,
  },
];

async function seedSampleData() {
  try {
    console.log("\n🌱 Seeding Sample Tournament Data\n");
    console.log("=".repeat(60));

    let tournamentsAdded = 0;

    // Simulate 5 tournaments
    for (let tournament = 1; tournament <= 5; tournament++) {
      console.log(`\n📊 Adding Tournament ${tournament}...`);

      for (const combo of sampleCombos) {
        const points =
          combo.placement === 1 ? 3 : combo.placement === 2 ? 2 : 1;

        // Update combo stats
        await db
          .insert(comboStats)
          .values({
            blade: combo.blade,
            assistBlade: combo.assistBlade,
            ratchet: combo.ratchet,
            bit: combo.bit,
            lockChip: combo.lockChip,
            primiPosti: combo.placement === 1 ? 1 : 0,
            secondiPosti: combo.placement === 2 ? 1 : 0,
            terziPosti: combo.placement === 3 ? 1 : 0,
            punteggioTotale: points,
          })
          .onConflictDoUpdate({
            target: [
              comboStats.blade,
              comboStats.assistBlade,
              comboStats.ratchet,
              comboStats.bit,
              comboStats.lockChip,
            ],
            set: {
              primiPosti: sql`${comboStats.primiPosti} + ${combo.placement === 1 ? 1 : 0}`,
              secondiPosti: sql`${comboStats.secondiPosti} + ${combo.placement === 2 ? 1 : 0}`,
              terziPosti: sql`${comboStats.terziPosti} + ${combo.placement === 3 ? 1 : 0}`,
              punteggioTotale: sql`${comboStats.punteggioTotale} + ${points}`,
            },
          });

        // Update individual component stats
        await db
          .insert(bladeStats)
          .values({
            blade: combo.blade,
            primiPosti: combo.placement === 1 ? 1 : 0,
            secondiPosti: combo.placement === 2 ? 1 : 0,
            terziPosti: combo.placement === 3 ? 1 : 0,
            punteggioTotale: points,
          })
          .onConflictDoUpdate({
            target: [bladeStats.blade],
            set: {
              primiPosti: sql`${bladeStats.primiPosti} + ${combo.placement === 1 ? 1 : 0}`,
              secondiPosti: sql`${bladeStats.secondiPosti} + ${combo.placement === 2 ? 1 : 0}`,
              terziPosti: sql`${bladeStats.terziPosti} + ${combo.placement === 3 ? 1 : 0}`,
              punteggioTotale: sql`${bladeStats.punteggioTotale} + ${points}`,
            },
          });

        if (combo.assistBlade !== "None") {
          await db
            .insert(assistBladeStats)
            .values({
              assistBlade: combo.assistBlade,
              primiPosti: combo.placement === 1 ? 1 : 0,
              secondiPosti: combo.placement === 2 ? 1 : 0,
              terziPosti: combo.placement === 3 ? 1 : 0,
              punteggioTotale: points,
            })
            .onConflictDoUpdate({
              target: [assistBladeStats.assistBlade],
              set: {
                primiPosti: sql`${assistBladeStats.primiPosti} + ${combo.placement === 1 ? 1 : 0}`,
                secondiPosti: sql`${assistBladeStats.secondiPosti} + ${combo.placement === 2 ? 1 : 0}`,
                terziPosti: sql`${assistBladeStats.terziPosti} + ${combo.placement === 3 ? 1 : 0}`,
                punteggioTotale: sql`${assistBladeStats.punteggioTotale} + ${points}`,
              },
            });
        }

        await db
          .insert(ratchetStats)
          .values({
            ratchet: combo.ratchet,
            primiPosti: combo.placement === 1 ? 1 : 0,
            secondiPosti: combo.placement === 2 ? 1 : 0,
            terziPosti: combo.placement === 3 ? 1 : 0,
            punteggioTotale: points,
          })
          .onConflictDoUpdate({
            target: [ratchetStats.ratchet],
            set: {
              primiPosti: sql`${ratchetStats.primiPosti} + ${combo.placement === 1 ? 1 : 0}`,
              secondiPosti: sql`${ratchetStats.secondiPosti} + ${combo.placement === 2 ? 1 : 0}`,
              terziPosti: sql`${ratchetStats.terziPosti} + ${combo.placement === 3 ? 1 : 0}`,
              punteggioTotale: sql`${ratchetStats.punteggioTotale} + ${points}`,
            },
          });

        await db
          .insert(bitStats)
          .values({
            bit: combo.bit,
            primiPosti: combo.placement === 1 ? 1 : 0,
            secondiPosti: combo.placement === 2 ? 1 : 0,
            terziPosti: combo.placement === 3 ? 1 : 0,
            punteggioTotale: points,
          })
          .onConflictDoUpdate({
            target: [bitStats.bit],
            set: {
              primiPosti: sql`${bitStats.primiPosti} + ${combo.placement === 1 ? 1 : 0}`,
              secondiPosti: sql`${bitStats.secondiPosti} + ${combo.placement === 2 ? 1 : 0}`,
              terziPosti: sql`${bitStats.terziPosti} + ${combo.placement === 3 ? 1 : 0}`,
              punteggioTotale: sql`${bitStats.punteggioTotale} + ${points}`,
            },
          });

        if (combo.lockChip !== "None") {
          await db
            .insert(lockChipStats)
            .values({
              lockChip: combo.lockChip,
              primiPosti: combo.placement === 1 ? 1 : 0,
              secondiPosti: combo.placement === 2 ? 1 : 0,
              terziPosti: combo.placement === 3 ? 1 : 0,
              punteggioTotale: points,
            })
            .onConflictDoUpdate({
              target: [lockChipStats.lockChip],
              set: {
                primiPosti: sql`${lockChipStats.primiPosti} + ${combo.placement === 1 ? 1 : 0}`,
                secondiPosti: sql`${lockChipStats.secondiPosti} + ${combo.placement === 2 ? 1 : 0}`,
                terziPosti: sql`${lockChipStats.terziPosti} + ${combo.placement === 3 ? 1 : 0}`,
                punteggioTotale: sql`${lockChipStats.punteggioTotale} + ${points}`,
              },
            });
        }
      }

      tournamentsAdded++;
      console.log(`  ✅ Tournament ${tournament} added`);
    }

    console.log("\n" + "=".repeat(60));
    console.log(`\n✅ Successfully seeded ${tournamentsAdded} tournaments!`);
    console.log("\n📊 Sample data includes:");
    console.log(`  - ${sampleCombos.length} unique combos`);
    console.log(`  - ${tournamentsAdded * sampleCombos.length} total entries`);
    console.log("\n🎯 Check the Analytics page to see the leaderboard!\n");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding sample data:", error);
    process.exit(1);
  }
}

seedSampleData();
