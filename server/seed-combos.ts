import { db } from './db';
import { comboStats } from '@shared/schema';

async function seedCombos() {
  console.log('Seeding combo stats...');

  const sampleCombos = [
    {
      blade: 'Phoenix Wing',
      assistBlade: 'Blaze',
      ratchet: '9-60',
      bit: 'High Needle',
      lockChip: 'Phoenix',
      primiPosti: 15,
      secondiPosti: 8,
      terziPosti: 3,
      punteggioTotale: 2450,
    },
    {
      blade: 'Dran Buster',
      assistBlade: 'Shield',
      ratchet: '5-70',
      bit: 'Unite',
      lockChip: 'Dran',
      primiPosti: 12,
      secondiPosti: 10,
      terziPosti: 5,
      punteggioTotale: 2180,
    },
    {
      blade: 'Wizard Arrow',
      assistBlade: 'Arrow',
      ratchet: '4-80',
      bit: 'Hexa',
      lockChip: 'Wizard',
      primiPosti: 10,
      secondiPosti: 12,
      terziPosti: 8,
      punteggioTotale: 2050,
    },
    {
      blade: 'Leon Crest',
      assistBlade: 'Claw',
      ratchet: '3-60',
      bit: 'Flat',
      lockChip: 'Leon',
      primiPosti: 8,
      secondiPosti: 7,
      terziPosti: 10,
      punteggioTotale: 1820,
    },
    {
      blade: 'Hells Scythe',
      assistBlade: 'Scythe',
      ratchet: '5-60',
      bit: 'Point',
      lockChip: 'Hells',
      primiPosti: 7,
      secondiPosti: 9,
      terziPosti: 6,
      punteggioTotale: 1650,
    },
    {
      blade: 'Knight Shield',
      assistBlade: 'Guard',
      ratchet: '9-80',
      bit: 'Ball',
      lockChip: 'Knight',
      primiPosti: 5,
      secondiPosti: 11,
      terziPosti: 9,
      punteggioTotale: 1560,
    },
    {
      blade: 'Cobalt Drake',
      assistBlade: 'Spike',
      ratchet: '4-60',
      bit: 'Rush',
      lockChip: 'Cobalt',
      primiPosti: 6,
      secondiPosti: 5,
      terziPosti: 12,
      punteggioTotale: 1420,
    },
    {
      blade: 'Shark Edge',
      assistBlade: 'Bite',
      ratchet: '3-70',
      bit: 'Low',
      lockChip: 'Shark',
      primiPosti: 4,
      secondiPosti: 8,
      terziPosti: 7,
      punteggioTotale: 1280,
    },
    {
      blade: 'Silver Wolf',
      assistBlade: 'Fang',
      ratchet: '5-80',
      bit: 'Gear Flat',
      lockChip: 'Wolf',
      primiPosti: 3,
      secondiPosti: 6,
      terziPosti: 8,
      punteggioTotale: 1150,
    },
    {
      blade: 'Tyranno Beat',
      assistBlade: 'Horn',
      ratchet: '9-70',
      bit: 'Orb',
      lockChip: 'Tyranno',
      primiPosti: 2,
      secondiPosti: 4,
      terziPosti: 5,
      punteggioTotale: 890,
    },
  ];

  for (const combo of sampleCombos) {
    await db.insert(comboStats).values(combo).onConflictDoNothing();
  }

  console.log('✅ Sample combo stats seeded successfully!');
  console.log(`Added ${sampleCombos.length} combinations to the leaderboard`);
}

seedCombos().catch(console.error);
