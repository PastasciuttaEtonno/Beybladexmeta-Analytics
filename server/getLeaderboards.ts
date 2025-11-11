const GET_LEADERBOARDS_QUERY = `
  query TournamentsForGame($gameSlug: String!, $after: ISO8601DateTime!) {
    tournamentsForGame(
      input: {
        gameSlug: $gameSlug
        tournamentFilter: {
          completedTournamentSelector: { tournamentsAfter: $after }
        }
      }
    ) {
      id
      name
      state
      schedule {
        startedAt
      }
      attendance {
        signups {
          lineups {
            placement {
              displayPlacement
            }
            members {
              user {
                userId
                username
              }
            }
          }
        }
      }
    }
  }
`;

import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "./db";
import { cmTournaments, cmLeaderboard } from "../shared/schema";
import { getCMToken } from "./challengermode";

const CHALLENGERMODE_API_URL = "https://api.challengermode.com/graphql";

async function fetchTournamentsFromChallengermode(gameSlug: string, after: string) {
  const token = await getCMToken();
  const response = await fetch(CHALLENGERMODE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: GET_LEADERBOARDS_QUERY,
      variables: {
        gameSlug,
        after,
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      // Handle rate limiting with exponential backoff
      const retryAfter = response.headers.get("Retry-After");
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchTournamentsFromChallengermode(gameSlug, after);
    }
    throw new Error(`Challengermode API request failed: ${response.statusText}`);
  }

  const { data } = await response.json();
  return data.tournamentsForGame;
}

export async function getLeaderboards(gameSlug: string, forceRefresh = false) {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let tournaments;

  if (!forceRefresh) {
    // Try to fetch from cache first
    tournaments = await db
      .select()
      .from(cmTournaments)
      .where(
        and(
          eq(cmTournaments.gameSlug, gameSlug),
          gt(cmTournaments.completedAt, twentyFourHoursAgo)
        )
      );

    if (tournaments.length > 0) {
      const tournamentIds = tournaments.map((t) => t.id);
      const leaderboardEntries = await db
        .select()
        .from(cmLeaderboard)
        .where(inArray(cmLeaderboard.tournamentId, tournamentIds));

      return { tournaments, leaderboard: leaderboardEntries };
    }
  }

  // If not in cache or forceRefresh is true, fetch from API
  const after = twentyFourHoursAgo.toISOString();
  const newTournaments = await fetchTournamentsFromChallengermode(
    gameSlug,
    after
  );

  const insertedTournaments: (typeof cmTournaments.$inferSelect)[] = [];
  const insertedLeaderboard: (typeof cmLeaderboard.$inferSelect)[] = [];

  if (newTournaments && newTournaments.length > 0) {
    await db.transaction(async (tx) => {
      for (const tournament of newTournaments) {
        const [insertedTournament] = await tx
          .insert(cmTournaments)
          .values({
            id: tournament.id,
            name: tournament.name,
            gameSlug: gameSlug,
            completedAt: new Date(tournament.schedule.startedAt),
          })
          .onConflictDoNothing()
          .returning();

        if (insertedTournament) {
          insertedTournaments.push(insertedTournament);
        }

        if (tournament.attendance && tournament.attendance.signups) {
          for (const signup of tournament.attendance.signups) {
            if (signup.lineups) {
              for (const lineup of signup.lineups) {
                if (lineup.members) {
                  for (const member of lineup.members) {
                    const [insertedEntry] = await tx
                      .insert(cmLeaderboard)
                      .values({
                        tournamentId: tournament.id,
                        userId: member.user.userId,
                        username: member.user.username,
                        placement: lineup.placement.displayPlacement,
                      })
                      .onConflictDoNothing()
                      .returning();
                    if (insertedEntry) {
                      insertedLeaderboard.push(insertedEntry);
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
  }

  return { tournaments: insertedTournaments, leaderboard: insertedLeaderboard };
}