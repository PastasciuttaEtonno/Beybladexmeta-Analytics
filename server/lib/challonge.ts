
import axios from "axios";
import { db } from "../db";
import { challongeMatchResults } from "@shared/schema";
import { sql } from "drizzle-orm";

const CHALLONGE_API_KEY = process.env.CHALLONGE_API_KEY;
const CHALLONGE_BASE_url = "https://api.challonge.com/v1";

if (!CHALLONGE_API_KEY) {
    console.warn("CHALLONGE_API_KEY is not set. Challonge sync will fail.");
}

interface ChallongeTournament {
    id: number;
    name: string;
    url: string;
    state: string;
    started_at: string | null;
    completed_at: string | null;
    participants_count: number;
    [key: string]: any;
}

interface ChallongeParticipant {
    id: number;
    name: string | null;
    display_name: string | null;
    username: string | null;
    final_rank: number | null;
    [key: string]: any;
}

export async function syncChallongeTournaments() {
    if (!CHALLONGE_API_KEY) {
        throw new Error("Missing CHALLONGE_API_KEY");
    }

    console.log("[Challonge] Starting sync...");

    // 1. Fetch Tournaments
    // https://api.challonge.com/v1/documents/tournaments/index
    const tournamentsUrl = `${CHALLONGE_BASE_url}/tournaments.json`;

    // Note: 'subdomain' parameter is used for community/organization subdomains.
    // The user specified 'ibna'.
    const params = {
        api_key: CHALLONGE_API_KEY,
        state: 'ended',
        created_after: '2026-02-01',
        subdomain: 'ibna'
    };

    let tournaments: { tournament: ChallongeTournament }[] = [];

    try {
        const response = await axios.get(tournamentsUrl, { params });
        tournaments = response.data;
        console.log(`[Challonge] Found ${tournaments.length} tournaments.`);
    } catch (error: any) {
        console.error("[Challonge] Failed to fetch tournaments:", error?.message || error);
        throw error;
    }

    let syncedCount = 0;

    for (const t of tournaments) {
        const tournament = t.tournament;
        const tournamentId = String(tournament.id);
        const tournamentUrl = tournament.url; // url slug

        console.log(`[Challonge] Processing tournament: ${tournament.name} (${tournamentId})`);

        // 2. Fetch Participants
        // https://api.challonge.com/v1/documents/participants/index
        // GET /tournaments/{tournament_id}/participants.json
        const participantsUrl = `${CHALLONGE_BASE_url}/tournaments/${tournamentId}/participants.json`;
        let participants: { participant: ChallongeParticipant }[] = [];

        try {
            const pResponse = await axios.get(participantsUrl, {
                params: { api_key: CHALLONGE_API_KEY }
            });
            participants = pResponse.data;
        } catch (error: any) {
            console.error(`[Challonge] Failed to fetch participants for ${tournamentId}:`, error?.message);
            // Continue to next tournament or throw? 
            // User context implies we want to sync what we can. Let's log and continue but maybe not save incomplete data.
            // But upserting empty participants might be better than nothing if we want to track the tournament exists.
            // For scoring, we need participants. Let's skip saving if we can't get participants.
            continue;
        }

        // 3. Construct Payload
        // The "data" column expects a JSON object. We'll store exactly what we fetched to be safe/flexible.
        const payload = {
            tournament: tournament,
            participants: participants.map(p => p.participant)
        };

        // 4. Upsert to DB
        try {
            await db.insert(challongeMatchResults).values({
                tournamentId: tournamentId,
                data: payload,
                fetchedAt: new Date()
            }).onConflictDoUpdate({
                target: challongeMatchResults.tournamentId,
                set: {
                    data: sql`excluded.data`,
                    fetchedAt: sql`now()`
                }
            });
            syncedCount++;
        } catch (dbError: any) {
            console.error(`[Challonge] Failed to upsert tournament ${tournamentId}:`, dbError?.message);
        }
    }

    console.log(`[Challonge] Sync complete. Synced ${syncedCount} tournaments.`);
    return { synced: syncedCount, totalFound: tournaments.length };
}
