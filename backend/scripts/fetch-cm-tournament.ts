/**
 * fetch-cm-tournament.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive CLI runner for the Challengermode client.
 *
 * Usage:
 *   npx tsx scripts/fetch-cm-tournament.ts
 *
 * Steps:
 *   1. Enter a Challengermode tournament UUID
 *   2. Choose basic (no attendance) or full (with lineups/placements) fetch
 *   3. Data is printed as formatted JSON
 *   4. Optionally insert the tournament + all participants into the DB
 *      (writes to cm_players, cm_match_results, and external_api_cache)
 *
 * Required env var:  CHALLENGERMODE_REFRESH_KEY
 * Required env var:  DATABASE_URL  (for DB insert step)
 */

import * as readline from 'readline';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ─── .env loader ─────────────────────────────────────────────────────────────
try {
    const { config } = await import('dotenv');
    config({ path: path.resolve(process.cwd(), '.env') });
} catch {
    // dotenv is optional — env vars may already be set in the shell
}

// ─── Project imports ──────────────────────────────────────────────────────────
import { fetchTournamentById, fetchTournamentDetail } from '../src/lib/challengermode-client.js';
import type { ExternalTournamentDetail } from '../src/lib/challengermode-client.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
    return new Promise((resolve) => rl.question(question, (a) => resolve(a.trim())));
}

function parsePlacement(display: string | null | undefined): number | null {
    if (!display) return null;
    const m = display.match(/\d+/);
    if (m) return parseInt(m[0], 10);
    const map: Record<string, number> = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 };
    return map[display] ?? null;
}

/**
 * Derives the season label from a date using the same logic as the app.
 * Season 2026 starts Jan 1 2026, Season 2025 started Jan 1 2025, etc.
 */
function determineSeason(date: Date): string {
    const year = date.getFullYear();
    return `Season ${year}`;
}

// ─── Step 1: tournament ID ────────────────────────────────────────────────────

const tournamentId = await ask('Enter Challengermode tournament UUID: ');
if (!tournamentId) {
    console.error('❌  No ID provided. Exiting.');
    rl.close();
    process.exit(1);
}

// ─── Step 2: basic vs full ────────────────────────────────────────────────────

const modeInput = await ask(
    'Fetch mode — [b]asic (no attendance) or [f]ull (with lineups)? [b/f, default: f]: ',
);
const full = modeInput.toLowerCase() !== 'b';

console.log(`\nFetching tournament ${tournamentId} (${full ? 'full detail' : 'basic'})...\n`);

let result: any;
try {
    result = full
        ? await fetchTournamentDetail(tournamentId)
        : await fetchTournamentById(tournamentId);
} catch (err: any) {
    console.error('❌  Fetch error:', err?.message || String(err));
    rl.close();
    process.exit(1);
}

console.log('─── Tournament data ───────────────────────────────────────────────────────');
console.log(JSON.stringify(result, null, 2));
console.log('───────────────────────────────────────────────────────────────────────────\n');

// ─── Step 3: DB insert prompt ─────────────────────────────────────────────────

const insertChoice = await ask('Insert this tournament into the database? [y/N]: ');

if (insertChoice.toLowerCase() !== 'y') {
    console.log('Skipping DB insert. Done.');
    rl.close();
    process.exit(0);
}

// For the DB insert we always need the full detail (with attendance + lineups)
let detail: ExternalTournamentDetail = result;
if (!full) {
    console.log('\nFetching full detail for DB insert (needed to extract participants)...');
    try {
        detail = await fetchTournamentDetail(tournamentId);
    } catch (err: any) {
        console.error('❌  Could not fetch full detail:', err?.message || String(err));
        rl.close();
        process.exit(1);
    }
}

console.log('\nConnecting to database...');

// Lazy-load DB (keeps the script usable without a DB when just fetching)
const { db } = await import('../src/db.js');
const { cmPlayers, cmMatchResults, externalApiCache } = await import('@shared/schema');
const { eq, sql } = await import('drizzle-orm');

// ─── Derive tournament metadata ───────────────────────────────────────────────

const startedAtStr = detail?.schedule?.startedAt;
const tournamentDate: Date | null = (() => {
    if (!startedAtStr) return null;
    const dateOnly = String(startedAtStr).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return new Date(dateOnly);
    return null;
})();

const lineups = detail?.attendance?.signups?.lineups ?? [];
const totalParticipants = detail?.attendance?.signups?.userCount
    ?? detail?.attendance?.confirmedLineupCount
    ?? lineups.length;
const seasonVal = tournamentDate ? determineSeason(tournamentDate) : determineSeason(new Date());

console.log(`\nTournament metadata:`);
console.log(`  Name:         ${detail.name}`);
console.log(`  Date:         ${tournamentDate?.toISOString().slice(0, 10) ?? '(unknown)'}`);
console.log(`  Season:       ${seasonVal}`);
console.log(`  Participants: ${totalParticipants}`);
console.log(`  Lineups:      ${lineups.length}`);

// ─── Upsert external_api_cache ────────────────────────────────────────────────

const cacheKey = `cm:tournamentDetail:${tournamentId}`;
try {
    await db
        .insert(externalApiCache)
        .values({ cacheKey, data: detail as any })
        .onConflictDoUpdate({
            target: externalApiCache.cacheKey,
            set: { data: detail as any, createdAt: sql`now()` },
        });
    console.log(`\n✅  Cached tournament JSON in external_api_cache (key: ${cacheKey})`);
} catch (err: any) {
    console.warn('⚠️   Could not write external_api_cache:', err?.message || String(err));
}

// ─── Process each lineup ──────────────────────────────────────────────────────

let insertedPlayers = 0;
let insertedResults = 0;
let skippedNoPlacement = 0;

for (const lineup of lineups) {
    const placement = parsePlacement(lineup?.placement?.displayPlacement);
    const members = lineup?.members ?? [];

    for (const member of members) {
        const user = member?.user;
        const userId = user?.userId ? String(user.userId) : null;
        const username = user?.username ? String(user.username) : null;
        const avatar = user?.profilePicture?.url ? String(user.profilePicture.url) : null;

        if (!userId) continue;

        // 1. Upsert cm_players
        try {
            await db
                .insert(cmPlayers)
                .values({ id: userId, nickname: username ?? userId, avatar })
                .onConflictDoUpdate({
                    target: cmPlayers.id,
                    set: {
                        nickname: sql`excluded.nickname`,
                        avatar: sql`excluded.avatar`,
                        updatedAt: sql`now()`,
                    },
                });
            insertedPlayers++;
        } catch (err: any) {
            console.warn(`⚠️   cm_players upsert failed for ${userId}:`, err?.message || String(err));
        }

        // 2. Upsert cm_match_results (only for top-4; others get 0 points)
        if (!placement || !tournamentDate) {
            skippedNoPlacement++;
            continue;
        }

        // Points formula: same as app (baseScore × participants)
        const baseScore =
            placement === 1 ? 10
                : placement === 2 ? 7
                    : placement === 3 ? 5
                        : placement === 4 ? 3
                            : 0;
        const puntiGuadagnati = baseScore > 0 ? baseScore * (totalParticipants || 0) : 0;

        try {
            // cm_match_results has a PK on (tournamentId, playerId, comboNumber).
            // For a script import without combo data, we insert comboNumber=1 as a
            // placement-only record with blank combo fields (they can be filled via claim later).
            await db
                .insert(cmMatchResults)
                .values({
                    tournamentId,
                    playerId: userId,
                    comboNumber: 1,
                    blade: 'Unknown',
                    assistBlade: 'None',
                    ratchet: 'None',
                    bit: 'Unknown',
                    lockChip: 'None',
                    piazzamento: placement,
                    numeroPartecipanti: totalParticipants ?? 0,
                    dataTorneo: tournamentDate,
                    puntiGuadagnati,
                } as any)
                .onConflictDoUpdate({
                    target: [cmMatchResults.tournamentId, cmMatchResults.playerId, cmMatchResults.comboNumber] as any,
                    set: {
                        piazzamento: sql`excluded.piazzamento`,
                        numeroPartecipanti: sql`excluded.numero_partecipanti`,
                        dataTorneo: sql`excluded.data_torneo`,
                        puntiGuadagnati: sql`excluded.punti_guadagnati`,
                        updatedAt: sql`now()`,
                    },
                });
            insertedResults++;
        } catch (err: any) {
            console.warn(`⚠️   cm_match_results upsert failed for ${userId}:`, err?.message || String(err));
        }
    }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n─── Insert summary ────────────────────────────────────────────────────────');
console.log(`  Players upserted:           ${insertedPlayers}`);
console.log(`  Match results upserted:     ${insertedResults}`);
console.log(`  Skipped (no placement/date): ${skippedNoPlacement}`);
console.log('───────────────────────────────────────────────────────────────────────────');
console.log('\n✅  Done.');

rl.close();
