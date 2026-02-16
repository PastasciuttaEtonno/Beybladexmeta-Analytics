#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import * as readline from "readline";

async function createViews() {
  try {
    console.log("\n🛠️ Creazione Architettura Classifica a due livelli...");

    // 1. Drop existing
    await db.execute(sql`DROP VIEW IF EXISTS public.player_leaderboard`);
    await db.execute(sql`DROP MATERIALIZED VIEW IF EXISTS public.player_platform_stats`);

    // Ottimizzazione per Alias Case-Insensitive (Functional Index)
    console.log("🛠️ Ottimizzazione: Creazione indice funzionale su LOWER(alias)...");
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_user_aliases_lower_alias 
      ON public.user_aliases (LOWER(alias));
    `);

    // 2. Livello 1: player_platform_stats (Materialized View)
    console.log("🛠️ Creazione Livello 1: player_platform_stats (Materialized View)...");
    await db.execute(sql`
      CREATE MATERIALIZED VIEW public.player_platform_stats AS
      WITH cm_source AS (
        SELECT 
          p.id as player_id,
          p.nickname,
          'challengermode'::text as platform,
          p.avatar, -- Fallback to CM avatar if user not found (though CM avatar is usually null now if not synced)
          COALESCE(u.photo_url, p.avatar) as resolved_avatar,
          SUM(m.punti_guadagnati)::float as total_points,
          COUNT(DISTINCT m.tournament_id)::int as tournaments_played,
          COUNT(DISTINCT CASE WHEN m.piazzamento = 1 THEN m.tournament_id END)::int as tournaments_won,
          COUNT(DISTINCT CASE WHEN m.piazzamento <= 3 THEN m.tournament_id END)::int as top3_finishes
        FROM public.cm_match_results m
        JOIN public.cm_players p ON m.player_id = p.id
        LEFT JOIN public.users u ON u.challenger_id = p.id
        GROUP BY p.id, p.nickname, p.avatar, u.photo_url
      ),
      challonge_raw AS (
        SELECT
          COALESCE(s->'participant'->>'name', s->>'name') as raw_name,
          COALESCE(s->'participant'->>'id', s->>'id', s->>'name') as challonge_player_id,
          COALESCE(s->'participant'->>'user_id', s->>'user_id') as challonge_user_id,
          (s->>'rank')::int as rank,
          COALESCE(
            (c.data->>'participants_count')::int, 
            (c.data->>'total_players')::int, 
            jsonb_array_length(c.data->'standings')
          ) as total_participants,
          c.tournament_id,
          COALESCE(s->'participant'->>'avatar_url', s->>'avatar_url') as avatar
        FROM public.challonge_match_results c,
        jsonb_array_elements(c.data->'standings') as s
      ),
      challonge_scored AS (
        SELECT 
          raw_name,
          challonge_player_id,
          challonge_user_id,
          avatar,
          tournament_id,
          rank,
          CASE 
            WHEN total_participants >= 49 AND total_participants <= 64 THEN
              CASE 
                WHEN rank = 1 THEN 400
                WHEN rank = 2 THEN 280
                WHEN rank = 3 THEN 160
                WHEN rank = 4 THEN 120
                WHEN rank BETWEEN 5 AND 8 THEN 90
                WHEN rank BETWEEN 9 AND 12 THEN 65
                WHEN rank BETWEEN 13 AND 16 THEN 50
                WHEN rank BETWEEN 17 AND 24 THEN 40
                WHEN rank BETWEEN 25 AND 32 THEN 30
                WHEN rank BETWEEN 33 AND 48 THEN 15
                WHEN rank BETWEEN 49 AND 64 THEN 10
                ELSE 0
              END
            WHEN total_participants >= 33 AND total_participants <= 48 THEN
              CASE 
                WHEN rank = 1 THEN 350
                WHEN rank = 2 THEN 240
                WHEN rank = 3 THEN 140
                WHEN rank = 4 THEN 110
                WHEN rank BETWEEN 5 AND 8 THEN 80
                WHEN rank BETWEEN 9 AND 12 THEN 55
                WHEN rank BETWEEN 13 AND 16 THEN 40
                WHEN rank BETWEEN 17 AND 24 THEN 30
                WHEN rank BETWEEN 25 AND 32 THEN 15
                WHEN rank BETWEEN 33 AND 48 THEN 10
                ELSE 0
              END
            WHEN total_participants >= 25 AND total_participants <= 32 THEN
              CASE 
                WHEN rank = 1 THEN 300
                WHEN rank = 2 THEN 200
                WHEN rank = 3 THEN 120
                WHEN rank = 4 THEN 90
                WHEN rank BETWEEN 5 AND 8 THEN 70
                WHEN rank BETWEEN 9 AND 12 THEN 45
                WHEN rank BETWEEN 13 AND 16 THEN 30
                WHEN rank BETWEEN 17 AND 24 THEN 15
                WHEN rank BETWEEN 25 AND 32 THEN 10
                ELSE 0
              END
            WHEN total_participants >= 17 AND total_participants <= 24 THEN
              CASE 
                WHEN rank = 1 THEN 250
                WHEN rank = 2 THEN 160
                WHEN rank = 3 THEN 100
                WHEN rank = 4 THEN 80
                WHEN rank BETWEEN 5 AND 8 THEN 60
                WHEN rank BETWEEN 9 AND 12 THEN 30
                WHEN rank BETWEEN 13 AND 16 THEN 15
                WHEN rank BETWEEN 17 AND 24 THEN 10
                ELSE 0
              END
            WHEN total_participants >= 13 AND total_participants <= 16 THEN
              CASE 
                WHEN rank = 1 THEN 200
                WHEN rank = 2 THEN 120
                WHEN rank = 3 THEN 80
                WHEN rank = 4 THEN 60
                WHEN rank BETWEEN 5 AND 8 THEN 30
                WHEN rank BETWEEN 9 AND 12 THEN 15
                WHEN rank BETWEEN 13 AND 16 THEN 10
                ELSE 0
              END
            WHEN total_participants >= 8 AND total_participants <= 12 THEN
              CASE 
                WHEN rank = 1 THEN 150
                WHEN rank = 2 THEN 80
                WHEN rank = 3 THEN 60
                WHEN rank = 4 THEN 40
                WHEN rank BETWEEN 5 AND 8 THEN 20
                WHEN rank BETWEEN 9 AND 12 THEN 10
                ELSE 0
              END
            WHEN total_participants >= 6 AND total_participants <= 7 THEN
              CASE 
                WHEN rank = 1 THEN 100
                WHEN rank = 2 THEN 70
                WHEN rank = 3 THEN 50
                WHEN rank = 4 THEN 30
                WHEN rank BETWEEN 5 AND 7 THEN 10
                ELSE 0
              END
            ELSE 0
          END as points
        FROM challonge_raw
      ),
      challonge_resolved AS (
        SELECT 
          COALESCE(p.id, u.id, u_direct.id, u_name.id, LOWER(TRIM(cs.raw_name))) as final_player_id,
          COALESCE(p.nickname, u.display_name, u_direct.display_name, u_name.display_name, cs.raw_name) as final_nickname,
          'challonge'::text as platform,
          COALESCE(u_direct.photo_url, u_name.photo_url, u.photo_url, cp_auth.avatar, p.avatar, cs.avatar) as avatar,
          cs.points,
          cs.tournament_id,
          cs.rank
        FROM challonge_scored cs
        LEFT JOIN public.user_aliases ua ON LOWER(TRIM(ua.alias)) = LOWER(TRIM(cs.raw_name)) AND ua.is_verified = true
        LEFT JOIN public.users u ON ua.user_id = u.id
        LEFT JOIN public.users u_direct ON u_direct.challonge_id = cs.challonge_user_id
        LEFT JOIN public.users u_name ON LOWER(u_name.challonge_username) = LOWER(TRIM(cs.raw_name))
        LEFT JOIN public.cm_players p ON u.challenger_id = p.id
        LEFT JOIN public.challonge_players cp_auth ON u.challonge_id = cp_auth.id
      ),
      challonge_stats AS (
        SELECT 
          final_player_id as player_id,
          final_nickname as nickname,
          platform,
          MAX(avatar) as avatar,
          SUM(points)::float as total_points,
          COUNT(DISTINCT tournament_id)::int as tournaments_played,
          COUNT(DISTINCT CASE WHEN rank = 1 THEN tournament_id END)::int as tournaments_won,
          COUNT(DISTINCT CASE WHEN rank <= 3 THEN tournament_id END)::int as top3_finishes
        FROM challonge_resolved
        WHERE final_nickname IS NOT NULL
        GROUP BY final_player_id, final_nickname, platform
      ),
      cm_reformatted AS (
          SELECT 
            player_id,
            nickname,
            platform,
            resolved_avatar as avatar,
            total_points,
            tournaments_played,
            tournaments_won,
            top3_finishes
          FROM cm_source
       )
      SELECT * FROM cm_reformatted
      UNION ALL
      SELECT * FROM challonge_stats
      WITH DATA
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX player_platform_stats_idx 
      ON public.player_platform_stats (nickname, platform)
    `);

    // 3. Livello 2: player_leaderboard (Standard View)
    console.log("🛠️ Creazione Livello 2: player_leaderboard (Standard View)...");
    await db.execute(sql`
      CREATE VIEW public.player_leaderboard AS
      SELECT 
        nickname,
        MAX(player_id) as player_id,
        COALESCE(
          MAX(CASE WHEN platform = 'challengermode' THEN avatar END),
          MAX(avatar)
        ) as avatar,
        SUM(total_points)::float as total_points,
        SUM(tournaments_played)::int as tournaments_played,
        SUM(tournaments_won)::int as tournaments_won,
        SUM(top3_finishes)::int as top3_finishes
      FROM public.player_platform_stats
      GROUP BY nickname
      ORDER BY total_points DESC
    `);

    console.log("✅ Architettura Classifica creata con successo!");
  } catch (error) {
    console.error("❌ Errore creazione viste:", (error as any)?.message || error);
    process.exitCode = 1;
  }
}

async function refreshMaterializedView() {
  try {
    console.log("\n🔄 Refresh CONCURRENTLY di player_platform_stats...");
    try {
      await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY public.player_platform_stats`);
      console.log("✅ Refresh CONCURRENTLY riuscito");
    } catch (e) {
      console.warn("⚠️ Refresh CONCURRENTLY fallito, provo refresh normale:", (e as any)?.message || e);
      await db.execute(sql`REFRESH MATERIALIZED VIEW public.player_platform_stats`);
      console.log("✅ Refresh normale riuscito");
    }
  } catch (error) {
    console.error("❌ Errore refresh vista:", (error as any)?.message || error);
    process.exitCode = 1;
  }
}

async function run() {
  if (process.argv.includes('--create')) {
    await createViews();
    process.exit(process.exitCode || 0);
  }
  if (process.argv.includes('--refresh')) {
    await refreshMaterializedView();
    process.exit(process.exitCode || 0);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log("\n=== Leaderboard Architecture Tool ===");
  console.log("1) Crea/ricrea le viste (L1 Materializzata + L2 Standard)");
  console.log("2) Esegui REFRESH della vista L1");
  console.log("3) Esci\n");
  rl.question("Seleziona un'opzione (1/2/3): ", async (answer) => {
    rl.close();
    const opt = String(answer || "").trim();
    if (opt === "1") {
      await createViews();
    } else if (opt === "2") {
      await refreshMaterializedView();
    } else {
      console.log("Uscita.");
    }
    process.exit(0);
  });
}

run();
