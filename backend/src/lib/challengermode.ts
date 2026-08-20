import { fetchTournamentDetail } from "../challengermode";

/**
 * Verifies that a Challengermode account really finished in the top four of a
 * tournament. This is the gate that stops one player registering combos in
 * another player's name: the account must be linked, and the linked id has to
 * appear in a top-four lineup.
 *
 * It used to ask for its own token at challengermode.com/oauth/token with the
 * client_credentials grant. That endpoint answers
 *
 *     { "error": "unsupported_grant_type" }
 *
 * so the request never produced a token and every claim failed with
 * "OAuth token error 400" — the gate rejected everyone, including legitimate
 * winners. It now reuses fetchTournamentDetail, which already authenticates
 * with the refresh key, already returns the lineups and their placements, and
 * caches its answers in external_api_cache.
 */

function parsePlacement(display: string | null | undefined): number | null {
  if (!display) return null;
  const digits = String(display).match(/\d+/);
  if (digits) return parseInt(digits[0], 10);
  const words: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
  return words[String(display)] ?? null;
}

export async function checkTournamentPlacement(tournamentId: string, userId: string): Promise<boolean> {
  const detail = await fetchTournamentDetail(tournamentId);
  const lineups = detail?.attendance?.signups?.lineups || [];

  for (const lineup of lineups) {
    // Shared placements are written as ranges ("3 - 4"); the first number is
    // the best position that lineup reached.
    const placement = parsePlacement(lineup?.placement?.displayPlacement ?? null);
    if (!placement || placement < 1 || placement > 4) continue;

    const members = lineup?.members || [];
    if (members.some((m: any) => (m?.user?.userId || "") === userId)) return true;
  }

  return false;
}
