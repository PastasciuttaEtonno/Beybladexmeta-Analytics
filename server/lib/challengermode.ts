import { z } from "zod";

const OAUTH_URL = "https://challengermode.com/oauth/token";
const GRAPHQL_URL = "https://publicapi.challengermode.com/graphql";

type TokenCache = { token: string; expiresAt: number } | null;
let appTokenCache: TokenCache = null;

function nowMs() { return Date.now(); }

function isValid(cache: TokenCache): boolean {
  if (!cache) return false;
  return cache.expiresAt - 30000 > nowMs();
}

export async function getAppAccessToken(): Promise<string> {
  if (isValid(appTokenCache)) return appTokenCache!.token;
  const clientId = process.env.CM_CLIENT_ID;
  const clientSecret = process.env.CM_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Missing CM_CLIENT_ID or CM_CLIENT_SECRET");
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
  const res = await fetch(OAUTH_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`OAuth token error ${res.status}`);
  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  const token: string = json?.access_token || json?.token || "";
  const expiresIn: number = typeof json?.expires_in === "number" ? json.expires_in : 600;
  if (!token) throw new Error("Missing access_token in response");
  appTokenCache = { token, expiresAt: nowMs() + expiresIn * 1000 };
  return token;
}

const PlacementSchema = z.object({ displayPlacement: z.string().nullable().optional() });
const MemberSchema = z.object({ user: z.object({ userId: z.string().nullable().optional() }).nullable().optional() });
const LineupSchema = z.object({ placement: PlacementSchema.nullable().optional(), members: z.array(MemberSchema).nullable().optional() });
const AttendanceSchema = z.object({ signups: z.object({ lineups: z.array(LineupSchema).nullable().optional(), userCount: z.number().nullable().optional(), lineupCount: z.number().nullable().optional() }).nullable().optional() }).nullable().optional();
const TournamentDetailSchema = z.object({ attendance: AttendanceSchema, schedule: z.object({ startedAt: z.string().nullable().optional() }).nullable().optional() });

function parsePlacement(display: string | null | undefined): number | null {
  if (!display) return null;
  const m = display.match(/\d+/);
  if (m) return parseInt(m[0], 10);
  const map: Record<string, number> = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
  return map[display] ?? null;
}

export async function checkTournamentPlacement(tournamentId: string, userId: string): Promise<boolean> {
  const token = await getAppAccessToken();
  const query = `query Tournament($tournamentId: UUID!) {\n  tournament(tournamentId: $tournamentId) {\n    attendance {\n      signups {\n        lineups {\n          placement { displayPlacement }\n          members { user { userId } }\n        }\n      }\n    }\n  }\n}`;
  const body = { query, variables: { tournamentId } };
  const res = await fetch(GRAPHQL_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`GraphQL error ${res.status}`);
  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  const node = json?.data?.tournament;
  const parsed = TournamentDetailSchema.safeParse(node);
  if (!parsed.success) return false;
  const lineups = parsed.data.attendance?.signups?.lineups || [];
  for (const l of lineups || []) {
    const placement = parsePlacement(l.placement?.displayPlacement ?? null);
    if (placement && placement >= 1 && placement <= 4) {
      const members = l.members || [];
      const found = members.some(m => (m.user?.userId || "") === userId);
      if (found) return true;
    }
  }
  return false;
}

