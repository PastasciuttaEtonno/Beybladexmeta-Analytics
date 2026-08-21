
import { db } from "../../src/db";
import { challongeMatchResults, challongePlayers } from "../../src/shared/schema";
import { sql, eq } from "drizzle-orm";

// Mocking the function logic locally to verify it works as expected with the DB
async function syncGhostPlayersFromData(data: any) {
    let count = 0;
    if (Array.isArray(data.standings)) {
        console.log(`[Test] Syncing ghost players from data: ${data.standings.length} standings found`);
        for (const p of data.standings) {
            const part = p.participant || p;
            const name = part.name || part.username || part.display_name || 'Unknown';
            const pid = part.id ? String(part.id) : name;
            const avatar = part.avatar_url || part.icon || null;

            if (pid && name && pid !== 'undefined') {
                console.log(`[Test] Upserting player: ${name} (ID: ${pid})`);
                await db.insert(challongePlayers).values({
                    id: pid,
                    nickname: name,
                    avatar: avatar,
                    updatedAt: new Date(),
                }).onConflictDoUpdate({
                    target: challongePlayers.id,
                    set: {
                        nickname: sql`excluded.nickname`,
                        avatar: sql`COALESCE(excluded.avatar, challonge_players.avatar)`,
                        updatedAt: new Date(),
                    }
                });
                count++;
            }
        }
    }
    return count;
}

async function verify() {
    try {
        const tournamentId = 'otply5yd';
        const rows = await db.execute(sql`SELECT data FROM challonge_match_results WHERE tournament_id = ${tournamentId} LIMIT 1`);
        if (rows.rows.length === 0) {
            console.error("Tournament not found");
            process.exit(1);
        }
        const data = rows.rows[0].data as any;
        const count = await syncGhostPlayersFromData(data);
        console.log(`Sincronizzati ${count} giocatori.`);

        // Check if they are actually in the DB
        const firstStanding = data.standings[0];
        const firstName = firstStanding.name || firstStanding.username;
        if (firstName) {
            const player = await db.select().from(challongePlayers).where(eq(challongePlayers.nickname, firstName)).limit(1);
            if (player.length > 0) {
                console.log("SUCCESS: Player found in challonge_players:", JSON.stringify(player[0], null, 2));
            } else {
                console.error("FAILURE: Player not found in challonge_players");
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verify();
