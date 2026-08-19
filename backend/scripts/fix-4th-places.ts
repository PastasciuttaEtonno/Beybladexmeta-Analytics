import 'dotenv/config';
import { db } from '../src/db';
import { sql } from 'drizzle-orm';
import { calculatePoints } from '../src/scoreExternalCombo';

// Helper types
type ComboKey = string;
interface Combo4thData {
    count: number;
    points: number;
    blade: string;
    assistBlade: string;
    ratchet: string;
    bit: string;
    lockChip: string;
    season: string;
}

// Generate unique key for map
const getComboKey = (c: any) => `${c.blade}|${c.assistBlade}|${c.ratchet}|${c.bit}|${c.lockChip}|${c.season}`;

async function fix4thPlaces() {
    console.log('STARTING SCRIPT...');

    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL is not defined in .env');
        process.exit(1);
    }

    console.log('🔧 Starting 4th Place Stats Fix...\n');

    try {
        // Basic connection test
        try {
            await db.execute(sql`SELECT 1`);
            console.log('✅ DB Connection check passed.');
        } catch (e: any) {
            console.error('❌ DB Connection failed:', e.message);
            process.exit(1);
        }

        const map = new Map<ComboKey, Combo4thData>();

        // Helper to update map
        const updateMap = (c: any, points: number) => {
            const key = getComboKey(c);
            const existing = map.get(key) || {
                count: 0,
                points: 0,
                blade: c.blade,
                assistBlade: c.assistBlade,
                ratchet: c.ratchet,
                bit: c.bit,
                lockChip: c.lockChip,
                season: c.season
            };
            existing.count++;
            existing.points += points;
            map.set(key, existing);
        };

        // 1. Fetch CM 4th places
        console.log('📊 Fetching ChallengerMode 4th places...');
        const cmRes = await db.execute(sql`
      SELECT 
        blade, assist_blade as "assistBlade", ratchet, bit, lock_chip as "lockChip", 
        data_torneo, numero_partecipanti, 'Season 2026' as season
      FROM cm_match_results
      WHERE piazzamento = 4
    `);

        for (const row of cmRes.rows as any[]) {
            const season = 'Season 2026';
            const points = calculatePoints(4, row.numero_partecipanti);
            updateMap({ ...row, season }, points);
        }
        console.log(`   Found ${cmRes.rows.length} records.`);

        // 2. Fetch Challonge 4th places (Reported by users)
        console.log('📊 Fetching Challonge 4th places (Reported)...');
        const chRes = await db.execute(sql`
      SELECT 
        crc.blade, crc.assist_blade as "assistBlade", crc.ratchet, crc.bit, crc.lock_chip as "lockChip", 
        crc.season, crc.tournament_id,
        (cmr.data->>'participants_count')::int as p_count_1,
        (cmr.data->>'total_players')::int as p_count_2,
        (cmr.data->'tournament'->>'participants_count')::int as p_count_3
      FROM challonge_reported_combos crc
      LEFT JOIN challonge_match_results cmr ON crc.tournament_id = cmr.tournament_id
      WHERE crc.rank = 4
    `);

        for (const row of chRes.rows as any[]) {
            const participants = row.p_count_1 || row.p_count_2 || row.p_count_3 || 0;
            if (participants === 0) {
                console.warn(`   ⚠️ No participants count for tournament ${row.tournament_id}, skipping points calc.`);
                continue;
            }
            const points = calculatePoints(4, participants);
            updateMap(row, points);
        }
        console.log(`   Found ${chRes.rows.length} records.`);

        // 3. Fetch External Player Combos (Ghost/Challonge) 4th places
        console.log('📊 Fetching External Player Combos (Ghost/Challonge) 4th places...');
        const extRes = await db.execute(sql`
        SELECT 
            blade, assist_blade as "assistBlade", ratchet, bit, lock_chip as "lockChip",
            season, total_participants as "participants", placement
        FROM external_player_combos
        WHERE placement = 4
    `);

        for (const row of extRes.rows as any[]) {
            if (!row.participants || row.participants === 0) {
                // Try to find participants from tournament info? 
                // For now skip or warn.
                console.warn(`   ⚠️ No participants count for external combo, skipping points calc.`);
                continue;
            }
            const points = calculatePoints(4, row.participants);
            updateMap(row, points);
        }
        console.log(`   Found ${extRes.rows.length} records.`);

        console.log(`\n📦 Total unique combos with 4th places: ${map.size}`);

        // 4. Update DB
        let updated = 0;
        let skipped_nonzero = 0;

        for (const [key, data] of map.entries()) {
            // Check current stats
            const currentRes = await db.execute(sql`
        SELECT quarti_posti, punteggio_totale 
        FROM combo_stats
        WHERE blade = ${data.blade} 
          AND assist_blade = ${data.assistBlade}
          AND ratchet = ${data.ratchet}
          AND bit = ${data.bit}
          AND lock_chip = ${data.lockChip}
          AND season = ${data.season}
      `);

            if (currentRes.rows.length === 0) {
                console.log(`   ➕ Inserting new combo stats for: ${key}`);

                await db.execute(sql`
          INSERT INTO combo_stats (blade, assist_blade, ratchet, bit, lock_chip, season, quarti_posti, punteggio_totale)
          VALUES (${data.blade}, ${data.assistBlade}, ${data.ratchet}, ${data.bit}, ${data.lockChip}, ${data.season}, ${data.count}, ${data.points})
        `);

                // Update component stats (Upsert)
                const upsertComp = async (tableStr: string, colStr: string, val: string) => {
                    await db.execute(sql`
                INSERT INTO ${sql.raw(tableStr)} (${sql.raw(colStr)}, season, quarti_posti, punteggio_totale)
                VALUES (${val}, ${data.season}, ${data.count}, ${data.points})
                ON CONFLICT (${sql.raw(colStr)}, season) 
                DO UPDATE SET 
                    quarti_posti = ${sql.raw(tableStr)}.quarti_posti + ${data.count},
                    punteggio_totale = ${sql.raw(tableStr)}.punteggio_totale + ${data.points}
            `);
                }

                await upsertComp('blade_stats', 'blade', data.blade);
                await upsertComp('assist_blade_stats', 'assist_blade', data.assistBlade);
                await upsertComp('ratchet_stats', 'ratchet', data.ratchet);
                await upsertComp('bit_stats', 'bit', data.bit);
                await upsertComp('lock_chip_stats', 'lock_chip', data.lockChip);

                updated++;
                continue;
            }

            const current = currentRes.rows[0] as any;

            if (current.quarti_posti === 0) {
                // Safe to update using parameterized queries
                await db.execute(sql`
          UPDATE combo_stats
          SET quarti_posti = ${data.count},
              punteggio_totale = punteggio_totale + ${data.points}
          WHERE blade = ${data.blade} 
            AND assist_blade = ${data.assistBlade}
            AND ratchet = ${data.ratchet}
            AND bit = ${data.bit}
            AND lock_chip = ${data.lockChip}
            AND season = ${data.season}
        `);

                // Update component stats
                const upsertComp = async (tableStr: string, colStr: string, val: string) => {
                    await db.execute(sql`
                INSERT INTO ${sql.raw(tableStr)} (${sql.raw(colStr)}, season, quarti_posti, punteggio_totale)
                VALUES (${val}, ${data.season}, ${data.count}, ${data.points})
                ON CONFLICT (${sql.raw(colStr)}, season) 
                DO UPDATE SET 
                    quarti_posti = ${sql.raw(tableStr)}.quarti_posti + ${data.count},
                    punteggio_totale = ${sql.raw(tableStr)}.punteggio_totale + ${data.points}
            `);
                }

                await upsertComp('blade_stats', 'blade', data.blade);
                await upsertComp('assist_blade_stats', 'assist_blade', data.assistBlade);
                await upsertComp('ratchet_stats', 'ratchet', data.ratchet);
                await upsertComp('bit_stats', 'bit', data.bit);
                await upsertComp('lock_chip_stats', 'lock_chip', data.lockChip);

                updated++;
            } else {
                // Already has data
                skipped_nonzero++;
            }
        }

        console.log(`\n✅ Fix complete!`);
        console.log(`   - Updated: ${updated}`);
        console.log(`   - Skipped (already has non-zero stats): ${skipped_nonzero}`);

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Error executing script:', error);
        process.exit(1);
    }
}

fix4thPlaces();
