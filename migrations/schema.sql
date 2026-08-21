--
-- PostgreSQL database dump
--

\restrict 3y3qsuHGvpC6ab0IsCOnyIq1obuKK1nrH2j3oVA72SmEYuC8Xl251SQH6ckue6X

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id character varying NOT NULL,
    email text NOT NULL,
    action text NOT NULL,
    tournament_id character varying,
    player_id character varying,
    payload jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assist_blade_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assist_blade_stats (
    assist_blade text NOT NULL,
    primi_posti integer DEFAULT 0 NOT NULL,
    secondi_posti integer DEFAULT 0 NOT NULL,
    terzi_posti integer DEFAULT 0 NOT NULL,
    punteggio_totale double precision DEFAULT 0 NOT NULL,
    season text NOT NULL,
    quarti_posti integer DEFAULT 0 NOT NULL
);


--
-- Name: bit_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bit_stats (
    "bit" text NOT NULL,
    primi_posti integer DEFAULT 0 NOT NULL,
    secondi_posti integer DEFAULT 0 NOT NULL,
    terzi_posti integer DEFAULT 0 NOT NULL,
    punteggio_totale double precision DEFAULT 0 NOT NULL,
    is_ratchet_less boolean DEFAULT false NOT NULL,
    season text NOT NULL,
    quarti_posti integer DEFAULT 0 NOT NULL
);


--
-- Name: blade_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blade_stats (
    blade text NOT NULL,
    primi_posti integer DEFAULT 0 NOT NULL,
    secondi_posti integer DEFAULT 0 NOT NULL,
    terzi_posti integer DEFAULT 0 NOT NULL,
    punteggio_totale double precision DEFAULT 0 NOT NULL,
    season text NOT NULL,
    quarti_posti integer DEFAULT 0 NOT NULL
);


--
-- Name: challonge_match_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challonge_match_results (
    id integer NOT NULL,
    tournament_id text NOT NULL,
    data jsonb NOT NULL,
    fetched_at timestamp without time zone DEFAULT now()
);


--
-- Name: challonge_match_results_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.challonge_match_results_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: challonge_match_results_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.challonge_match_results_id_seq OWNED BY public.challonge_match_results.id;


--
-- Name: challonge_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challonge_players (
    id character varying NOT NULL,
    nickname text NOT NULL,
    avatar text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: challonge_reported_combos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challonge_reported_combos (
    id integer NOT NULL,
    user_id character varying NOT NULL,
    tournament_id text NOT NULL,
    tournament_name text,
    combo_number integer NOT NULL,
    blade text NOT NULL,
    assist_blade text,
    ratchet text NOT NULL,
    "bit" text NOT NULL,
    lock_chip text,
    rank integer NOT NULL,
    season text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: challonge_reported_combos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.challonge_reported_combos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: challonge_reported_combos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.challonge_reported_combos_id_seq OWNED BY public.challonge_reported_combos.id;


--
-- Name: clubs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clubs (
    id character varying NOT NULL,
    name text NOT NULL,
    region text,
    logo text,
    created_at timestamp without time zone DEFAULT now(),
    city text
);


--
-- Name: clubs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clubs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: clubs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.clubs_id_seq OWNED BY public.clubs.id;


--
-- Name: cm_match_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cm_match_results (
    tournament_id character varying NOT NULL,
    player_id character varying NOT NULL,
    combo_number integer NOT NULL,
    blade text NOT NULL,
    assist_blade text NOT NULL,
    ratchet text NOT NULL,
    "bit" text NOT NULL,
    lock_chip text NOT NULL,
    piazzamento integer NOT NULL,
    numero_partecipanti integer NOT NULL,
    data_torneo date NOT NULL,
    punti_guadagnati double precision NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cm_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cm_players (
    id character varying NOT NULL,
    nickname text NOT NULL,
    avatar text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: combo_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.combo_stats (
    blade text NOT NULL,
    assist_blade text NOT NULL,
    ratchet text NOT NULL,
    "bit" text NOT NULL,
    lock_chip text NOT NULL,
    primi_posti integer DEFAULT 0 NOT NULL,
    secondi_posti integer DEFAULT 0 NOT NULL,
    terzi_posti integer DEFAULT 0 NOT NULL,
    punteggio_totale double precision DEFAULT 0 NOT NULL,
    data_creazione timestamp with time zone DEFAULT now() NOT NULL,
    season text NOT NULL,
    quarti_posti integer DEFAULT 0 NOT NULL
);


--
-- Name: external_api_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_api_cache (
    cache_key text NOT NULL,
    data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: external_player_combos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_player_combos (
    tournament_id character varying NOT NULL,
    player_id character varying NOT NULL,
    combo_number integer NOT NULL,
    blade text NOT NULL,
    assist_blade text NOT NULL,
    ratchet text NOT NULL,
    "bit" text NOT NULL,
    lock_chip text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    placement integer,
    total_participants integer,
    tournament_date date,
    season text,
    platform text DEFAULT 'challengermode'::text NOT NULL
);


--
-- Name: favorite_combos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorite_combos (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    blade text NOT NULL,
    assist_blade text NOT NULL,
    ratchet text NOT NULL,
    "bit" text NOT NULL,
    lock_chip text NOT NULL
);


--
-- Name: favorite_deck_combos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorite_deck_combos (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    deck_id character varying NOT NULL,
    combo_number integer NOT NULL,
    blade text NOT NULL,
    assist_blade text NOT NULL,
    ratchet text NOT NULL,
    "bit" text NOT NULL,
    lock_chip text NOT NULL
);


--
-- Name: favorite_decks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorite_decks (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    user_id character varying NOT NULL,
    name text NOT NULL
);


--
-- Name: lock_chip_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lock_chip_stats (
    lock_chip text NOT NULL,
    primi_posti integer DEFAULT 0 NOT NULL,
    secondi_posti integer DEFAULT 0 NOT NULL,
    terzi_posti integer DEFAULT 0 NOT NULL,
    punteggio_totale double precision DEFAULT 0 NOT NULL,
    season text NOT NULL,
    quarti_posti integer DEFAULT 0 NOT NULL
);


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    ip_address text NOT NULL,
    email text,
    attempted_at timestamp without time zone DEFAULT now() NOT NULL,
    success boolean DEFAULT false NOT NULL
);


--
-- Name: user_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_aliases (
    id integer NOT NULL,
    user_id text NOT NULL,
    alias text NOT NULL,
    platform text DEFAULT 'challonge'::text NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    photo_url text,
    is_admin boolean DEFAULT false NOT NULL,
    is_verified boolean DEFAULT false NOT NULL,
    verification_token text,
    verification_token_expires_at timestamp with time zone,
    challenger_id text,
    challonge_id text,
    challengermode_username text,
    challonge_username text
);


--
-- Name: player_platform_stats; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.player_platform_stats AS
 WITH cm_source AS (
         SELECT p.id AS player_id,
            p.nickname,
            'challengermode'::text AS platform,
            COALESCE(u.photo_url, p.avatar) AS avatar,
            sum(m.punti_guadagnati) AS total_points,
            (count(DISTINCT m.tournament_id))::integer AS tournaments_played,
            (count(DISTINCT
                CASE
                    WHEN (m.piazzamento = 1) THEN m.tournament_id
                    ELSE NULL::character varying
                END))::integer AS tournaments_won,
            (count(DISTINCT
                CASE
                    WHEN (m.piazzamento <= 3) THEN m.tournament_id
                    ELSE NULL::character varying
                END))::integer AS top3_finishes,
            (count(DISTINCT
                CASE
                    WHEN (m.piazzamento <= 4) THEN m.tournament_id
                    ELSE NULL::character varying
                END))::integer AS top4_finishes
           FROM ((public.cm_match_results m
             JOIN public.cm_players p ON (((m.player_id)::text = (p.id)::text)))
             LEFT JOIN public.users u ON ((u.challenger_id = (p.id)::text)))
          WHERE (NOT ((m.tournament_id)::text IN ( SELECT challonge_match_results.tournament_id
                   FROM public.challonge_match_results)))
          GROUP BY p.id, p.nickname, p.avatar, u.photo_url
        ), challonge_raw AS (
         SELECT COALESCE(((s.value -> 'participant'::text) ->> 'name'::text), (s.value ->> 'name'::text)) AS raw_name,
            COALESCE(((s.value -> 'participant'::text) ->> 'id'::text), (s.value ->> 'id'::text), (s.value ->> 'name'::text)) AS challonge_player_id,
            COALESCE(((s.value -> 'participant'::text) ->> 'user_id'::text), (s.value ->> 'user_id'::text)) AS challonge_user_id,
            ((s.value ->> 'rank'::text))::integer AS rank,
            COALESCE(((c.data ->> 'participants_count'::text))::integer, ((c.data ->> 'total_players'::text))::integer, jsonb_array_length((c.data -> 'standings'::text))) AS total_participants,
            c.tournament_id,
            COALESCE(((s.value -> 'participant'::text) ->> 'avatar_url'::text), (s.value ->> 'avatar_url'::text)) AS avatar
           FROM public.challonge_match_results c,
            LATERAL jsonb_array_elements((c.data -> 'standings'::text)) s(value)
        ), challonge_scored AS (
         SELECT challonge_raw.raw_name,
            challonge_raw.challonge_player_id,
            challonge_raw.challonge_user_id,
            challonge_raw.avatar,
            challonge_raw.tournament_id,
            challonge_raw.rank,
                CASE
                    WHEN ((challonge_raw.total_participants >= 49) AND (challonge_raw.total_participants <= 64)) THEN
                    CASE
                        WHEN (challonge_raw.rank = 1) THEN 400
                        WHEN (challonge_raw.rank = 2) THEN 280
                        WHEN (challonge_raw.rank = 3) THEN 160
                        WHEN (challonge_raw.rank = 4) THEN 120
                        WHEN ((challonge_raw.rank >= 5) AND (challonge_raw.rank <= 8)) THEN 90
                        WHEN ((challonge_raw.rank >= 9) AND (challonge_raw.rank <= 12)) THEN 65
                        WHEN ((challonge_raw.rank >= 13) AND (challonge_raw.rank <= 16)) THEN 50
                        WHEN ((challonge_raw.rank >= 17) AND (challonge_raw.rank <= 24)) THEN 40
                        WHEN ((challonge_raw.rank >= 25) AND (challonge_raw.rank <= 32)) THEN 30
                        WHEN ((challonge_raw.rank >= 33) AND (challonge_raw.rank <= 48)) THEN 15
                        WHEN ((challonge_raw.rank >= 49) AND (challonge_raw.rank <= 64)) THEN 10
                        ELSE 0
                    END
                    WHEN ((challonge_raw.total_participants >= 33) AND (challonge_raw.total_participants <= 48)) THEN
                    CASE
                        WHEN (challonge_raw.rank = 1) THEN 350
                        WHEN (challonge_raw.rank = 2) THEN 240
                        WHEN (challonge_raw.rank = 3) THEN 140
                        WHEN (challonge_raw.rank = 4) THEN 110
                        WHEN ((challonge_raw.rank >= 5) AND (challonge_raw.rank <= 8)) THEN 80
                        WHEN ((challonge_raw.rank >= 9) AND (challonge_raw.rank <= 12)) THEN 55
                        WHEN ((challonge_raw.rank >= 13) AND (challonge_raw.rank <= 16)) THEN 40
                        WHEN ((challonge_raw.rank >= 17) AND (challonge_raw.rank <= 24)) THEN 30
                        WHEN ((challonge_raw.rank >= 25) AND (challonge_raw.rank <= 32)) THEN 15
                        WHEN ((challonge_raw.rank >= 33) AND (challonge_raw.rank <= 48)) THEN 10
                        ELSE 0
                    END
                    WHEN ((challonge_raw.total_participants >= 25) AND (challonge_raw.total_participants <= 32)) THEN
                    CASE
                        WHEN (challonge_raw.rank = 1) THEN 300
                        WHEN (challonge_raw.rank = 2) THEN 200
                        WHEN (challonge_raw.rank = 3) THEN 120
                        WHEN (challonge_raw.rank = 4) THEN 90
                        WHEN ((challonge_raw.rank >= 5) AND (challonge_raw.rank <= 8)) THEN 70
                        WHEN ((challonge_raw.rank >= 9) AND (challonge_raw.rank <= 12)) THEN 45
                        WHEN ((challonge_raw.rank >= 13) AND (challonge_raw.rank <= 16)) THEN 30
                        WHEN ((challonge_raw.rank >= 17) AND (challonge_raw.rank <= 24)) THEN 15
                        WHEN ((challonge_raw.rank >= 25) AND (challonge_raw.rank <= 32)) THEN 10
                        ELSE 0
                    END
                    WHEN ((challonge_raw.total_participants >= 17) AND (challonge_raw.total_participants <= 24)) THEN
                    CASE
                        WHEN (challonge_raw.rank = 1) THEN 250
                        WHEN (challonge_raw.rank = 2) THEN 160
                        WHEN (challonge_raw.rank = 3) THEN 100
                        WHEN (challonge_raw.rank = 4) THEN 80
                        WHEN ((challonge_raw.rank >= 5) AND (challonge_raw.rank <= 8)) THEN 60
                        WHEN ((challonge_raw.rank >= 9) AND (challonge_raw.rank <= 12)) THEN 30
                        WHEN ((challonge_raw.rank >= 13) AND (challonge_raw.rank <= 16)) THEN 15
                        WHEN ((challonge_raw.rank >= 17) AND (challonge_raw.rank <= 24)) THEN 10
                        ELSE 0
                    END
                    WHEN ((challonge_raw.total_participants >= 13) AND (challonge_raw.total_participants <= 16)) THEN
                    CASE
                        WHEN (challonge_raw.rank = 1) THEN 200
                        WHEN (challonge_raw.rank = 2) THEN 120
                        WHEN (challonge_raw.rank = 3) THEN 80
                        WHEN (challonge_raw.rank = 4) THEN 60
                        WHEN ((challonge_raw.rank >= 5) AND (challonge_raw.rank <= 8)) THEN 30
                        WHEN ((challonge_raw.rank >= 9) AND (challonge_raw.rank <= 12)) THEN 15
                        WHEN ((challonge_raw.rank >= 13) AND (challonge_raw.rank <= 16)) THEN 10
                        ELSE 0
                    END
                    WHEN ((challonge_raw.total_participants >= 8) AND (challonge_raw.total_participants <= 12)) THEN
                    CASE
                        WHEN (challonge_raw.rank = 1) THEN 150
                        WHEN (challonge_raw.rank = 2) THEN 80
                        WHEN (challonge_raw.rank = 3) THEN 60
                        WHEN (challonge_raw.rank = 4) THEN 40
                        WHEN ((challonge_raw.rank >= 5) AND (challonge_raw.rank <= 8)) THEN 20
                        WHEN ((challonge_raw.rank >= 9) AND (challonge_raw.rank <= 12)) THEN 10
                        ELSE 0
                    END
                    WHEN ((challonge_raw.total_participants >= 6) AND (challonge_raw.total_participants <= 7)) THEN
                    CASE
                        WHEN (challonge_raw.rank = 1) THEN 100
                        WHEN (challonge_raw.rank = 2) THEN 70
                        WHEN (challonge_raw.rank = 3) THEN 50
                        WHEN (challonge_raw.rank = 4) THEN 30
                        WHEN ((challonge_raw.rank >= 5) AND (challonge_raw.rank <= 7)) THEN 10
                        ELSE 0
                    END
                    ELSE 0
                END AS points
           FROM challonge_raw
        ), challonge_resolved AS (
         SELECT COALESCE(p.id, u.id, u_direct.id, u_name.id, (lower(TRIM(BOTH FROM cs.raw_name)))::character varying) AS final_player_id,
            COALESCE(p.nickname, u.display_name, u_direct.display_name, u_name.display_name, cs.raw_name) AS final_nickname,
            'challonge'::text AS platform,
            COALESCE(u_direct.photo_url, u_name.photo_url, u.photo_url, cp_auth.avatar, p.avatar, cs.avatar) AS avatar,
            cs.points,
            cs.tournament_id,
            cs.rank
           FROM ((((((challonge_scored cs
             LEFT JOIN public.user_aliases ua ON (((lower(TRIM(BOTH FROM ua.alias)) = lower(TRIM(BOTH FROM cs.raw_name))) AND (ua.is_verified = true))))
             LEFT JOIN public.users u ON ((ua.user_id = (u.id)::text)))
             LEFT JOIN public.users u_direct ON ((u_direct.challonge_id = cs.challonge_user_id)))
             LEFT JOIN public.users u_name ON ((lower(u_name.challonge_username) = lower(TRIM(BOTH FROM cs.raw_name)))))
             LEFT JOIN public.cm_players p ON (((u.challenger_id = (p.id)::text) OR (u_direct.challenger_id = (p.id)::text) OR (u_name.challenger_id = (p.id)::text))))
             LEFT JOIN public.challonge_players cp_auth ON (((u.challonge_id = (cp_auth.id)::text) OR (u_direct.challonge_id = (cp_auth.id)::text))))
        ), challonge_stats AS (
         SELECT challonge_resolved.final_player_id AS player_id,
            challonge_resolved.final_nickname AS nickname,
            challonge_resolved.platform,
            max(challonge_resolved.avatar) AS avatar,
            (sum(challonge_resolved.points))::double precision AS total_points,
            (count(DISTINCT challonge_resolved.tournament_id))::integer AS tournaments_played,
            (count(DISTINCT
                CASE
                    WHEN (challonge_resolved.rank = 1) THEN challonge_resolved.tournament_id
                    ELSE NULL::text
                END))::integer AS tournaments_won,
            (count(DISTINCT
                CASE
                    WHEN (challonge_resolved.rank <= 3) THEN challonge_resolved.tournament_id
                    ELSE NULL::text
                END))::integer AS top3_finishes,
            (count(DISTINCT
                CASE
                    WHEN (challonge_resolved.rank <= 4) THEN challonge_resolved.tournament_id
                    ELSE NULL::text
                END))::integer AS top4_finishes
           FROM challonge_resolved
          WHERE (challonge_resolved.final_nickname IS NOT NULL)
          GROUP BY challonge_resolved.final_player_id, challonge_resolved.final_nickname, challonge_resolved.platform
        )
 SELECT cm_source.player_id,
    cm_source.nickname,
    cm_source.platform,
    cm_source.avatar,
    cm_source.total_points,
    cm_source.tournaments_played,
    cm_source.tournaments_won,
    cm_source.top3_finishes,
    cm_source.top4_finishes
   FROM cm_source
UNION ALL
 SELECT challonge_stats.player_id,
    challonge_stats.nickname,
    challonge_stats.platform,
    challonge_stats.avatar,
    challonge_stats.total_points,
    challonge_stats.tournaments_played,
    challonge_stats.tournaments_won,
    challonge_stats.top3_finishes,
    challonge_stats.top4_finishes
   FROM challonge_stats
  WITH NO DATA;


--
-- Name: player_leaderboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.player_leaderboard AS
 SELECT nickname,
    max((player_id)::text) AS player_id,
    COALESCE(max(
        CASE
            WHEN (platform = 'challengermode'::text) THEN avatar
            ELSE NULL::text
        END), max(avatar)) AS avatar,
    sum(total_points) AS total_points,
    (sum(tournaments_played))::integer AS tournaments_played,
    (sum(tournaments_won))::integer AS tournaments_won,
    (sum(top3_finishes))::integer AS top3_finishes,
    (sum(top4_finishes))::integer AS top4_finishes
   FROM public.player_platform_stats
  GROUP BY nickname
  ORDER BY (sum(total_points)) DESC;


--
-- Name: player_regional_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_regional_stats (
    player_id text NOT NULL,
    player_name text NOT NULL,
    region text NOT NULL,
    season text DEFAULT 'Season 2026'::text NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    tournaments_played integer DEFAULT 0 NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    top4 integer DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT now(),
    platform text DEFAULT 'challengermode'::text NOT NULL
);


--
-- Name: ratchet_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ratchet_stats (
    ratchet text NOT NULL,
    primi_posti integer DEFAULT 0 NOT NULL,
    secondi_posti integer DEFAULT 0 NOT NULL,
    terzi_posti integer DEFAULT 0 NOT NULL,
    punteggio_totale double precision DEFAULT 0 NOT NULL,
    season text NOT NULL,
    quarti_posti integer DEFAULT 0 NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version text NOT NULL,
    name text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: top_component_snapshot; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.top_component_snapshot AS
 SELECT 'blade'::text AS component_type,
    blade_stats.blade AS name,
    blade_stats.season,
    blade_stats.primi_posti,
    blade_stats.secondi_posti,
    blade_stats.terzi_posti,
    blade_stats.punteggio_totale
   FROM public.blade_stats
UNION ALL
 SELECT 'assist-blade'::text AS component_type,
    assist_blade_stats.assist_blade AS name,
    assist_blade_stats.season,
    assist_blade_stats.primi_posti,
    assist_blade_stats.secondi_posti,
    assist_blade_stats.terzi_posti,
    assist_blade_stats.punteggio_totale
   FROM public.assist_blade_stats
UNION ALL
 SELECT 'ratchet'::text AS component_type,
    ratchet_stats.ratchet AS name,
    ratchet_stats.season,
    ratchet_stats.primi_posti,
    ratchet_stats.secondi_posti,
    ratchet_stats.terzi_posti,
    ratchet_stats.punteggio_totale
   FROM public.ratchet_stats
UNION ALL
 SELECT 'bit'::text AS component_type,
    bit_stats."bit" AS name,
    bit_stats.season,
    bit_stats.primi_posti,
    bit_stats.secondi_posti,
    bit_stats.terzi_posti,
    bit_stats.punteggio_totale
   FROM public.bit_stats
UNION ALL
 SELECT 'lock-chip'::text AS component_type,
    lock_chip_stats.lock_chip AS name,
    lock_chip_stats.season,
    lock_chip_stats.primi_posti,
    lock_chip_stats.secondi_posti,
    lock_chip_stats.terzi_posti,
    lock_chip_stats.punteggio_totale
   FROM public.lock_chip_stats
  WITH NO DATA;


--
-- Name: tournaments_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.tournaments_view AS
 SELECT (cache.data ->> 'id'::text) AS id,
    (cache.data ->> 'name'::text) AS name,
    (((cache.data -> 'schedule'::text) ->> 'startedAt'::text))::date AS date,
    ((((cache.data -> 'hosts'::text) -> 'spaces'::text) -> 0) ->> 'name'::text) AS organizer_name,
    clubs.region,
    clubs.city
   FROM (public.external_api_cache cache
     LEFT JOIN public.clubs ON ((clubs.name = ((((cache.data -> 'hosts'::text) -> 'spaces'::text) -> 0) ->> 'name'::text))))
  WHERE (cache.cache_key ~~ 'cm:tournamentDetail:%'::text);


--
-- Name: unified_meta_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.unified_meta_view AS
 SELECT (((((external_player_combos.tournament_id)::text || '_'::text) || (external_player_combos.player_id)::text) || '_'::text) || external_player_combos.combo_number) AS unique_id,
    external_player_combos.blade,
    external_player_combos.assist_blade,
    external_player_combos.ratchet,
    external_player_combos."bit",
    external_player_combos.lock_chip,
    external_player_combos.placement AS rank,
    (external_player_combos.tournament_date)::timestamp without time zone AS date,
    external_player_combos.total_participants AS participant_count,
    external_player_combos.platform,
    external_player_combos.season
   FROM public.external_player_combos
  WHERE (external_player_combos.placement <= 3)
UNION ALL
 SELECT ('ch_'::text || r.id) AS unique_id,
    r.blade,
    r.assist_blade,
    r.ratchet,
    r."bit",
    r.lock_chip,
    r.rank,
    ((m.data ->> 'start_date'::text))::timestamp without time zone AS date,
    COALESCE(((m.data ->> 'total_players'::text))::integer, 0) AS participant_count,
    'challonge'::text AS platform,
    r.season
   FROM (public.challonge_reported_combos r
     JOIN public.challonge_match_results m ON ((r.tournament_id = m.tournament_id)))
  WHERE (r.rank <= 3);


--
-- Name: user_aliases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_aliases_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_aliases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_aliases_id_seq OWNED BY public.user_aliases.id;


--
-- Name: challonge_match_results id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challonge_match_results ALTER COLUMN id SET DEFAULT nextval('public.challonge_match_results_id_seq'::regclass);


--
-- Name: challonge_reported_combos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challonge_reported_combos ALTER COLUMN id SET DEFAULT nextval('public.challonge_reported_combos_id_seq'::regclass);


--
-- Name: clubs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs ALTER COLUMN id SET DEFAULT nextval('public.clubs_id_seq'::regclass);


--
-- Name: user_aliases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_aliases ALTER COLUMN id SET DEFAULT nextval('public.user_aliases_id_seq'::regclass);


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: assist_blade_stats assist_blade_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assist_blade_stats
    ADD CONSTRAINT assist_blade_stats_pkey PRIMARY KEY (assist_blade, season);


--
-- Name: bit_stats bit_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bit_stats
    ADD CONSTRAINT bit_stats_pkey PRIMARY KEY ("bit", season);


--
-- Name: blade_stats blade_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blade_stats
    ADD CONSTRAINT blade_stats_pkey PRIMARY KEY (blade, season);


--
-- Name: challonge_match_results challonge_match_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challonge_match_results
    ADD CONSTRAINT challonge_match_results_pkey PRIMARY KEY (id);


--
-- Name: challonge_match_results challonge_match_results_tournament_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challonge_match_results
    ADD CONSTRAINT challonge_match_results_tournament_id_unique UNIQUE (tournament_id);


--
-- Name: challonge_players challonge_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challonge_players
    ADD CONSTRAINT challonge_players_pkey PRIMARY KEY (id);


--
-- Name: challonge_reported_combos challonge_reported_combos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challonge_reported_combos
    ADD CONSTRAINT challonge_reported_combos_pkey PRIMARY KEY (id);


--
-- Name: clubs clubs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clubs
    ADD CONSTRAINT clubs_pkey PRIMARY KEY (id);


--
-- Name: cm_match_results cm_match_results_tournament_id_player_id_combo_number_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cm_match_results
    ADD CONSTRAINT cm_match_results_tournament_id_player_id_combo_number_pk PRIMARY KEY (tournament_id, player_id, combo_number);


--
-- Name: cm_players cm_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cm_players
    ADD CONSTRAINT cm_players_pkey PRIMARY KEY (id);


--
-- Name: combo_stats combo_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.combo_stats
    ADD CONSTRAINT combo_stats_pkey PRIMARY KEY (blade, assist_blade, ratchet, "bit", lock_chip, season);


--
-- Name: external_api_cache external_api_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_api_cache
    ADD CONSTRAINT external_api_cache_pkey PRIMARY KEY (cache_key);


--
-- Name: external_player_combos external_player_combos_tournament_id_player_id_combo_number_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_player_combos
    ADD CONSTRAINT external_player_combos_tournament_id_player_id_combo_number_pk PRIMARY KEY (tournament_id, player_id, combo_number);


--
-- Name: favorite_combos favorite_combos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_combos
    ADD CONSTRAINT favorite_combos_pkey PRIMARY KEY (id);


--
-- Name: favorite_deck_combos favorite_deck_combos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_deck_combos
    ADD CONSTRAINT favorite_deck_combos_pkey PRIMARY KEY (id);


--
-- Name: favorite_decks favorite_decks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_decks
    ADD CONSTRAINT favorite_decks_pkey PRIMARY KEY (id);


--
-- Name: lock_chip_stats lock_chip_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lock_chip_stats
    ADD CONSTRAINT lock_chip_stats_pkey PRIMARY KEY (lock_chip, season);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: player_regional_stats player_regional_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_regional_stats
    ADD CONSTRAINT player_regional_stats_pkey PRIMARY KEY (player_id, region, season, platform);


--
-- Name: ratchet_stats ratchet_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ratchet_stats
    ADD CONSTRAINT ratchet_stats_pkey PRIMARY KEY (ratchet, season);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: user_aliases user_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_aliases
    ADD CONSTRAINT user_aliases_pkey PRIMARY KEY (id);


--
-- Name: users users_challonge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_challonge_id_key UNIQUE (challonge_id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_action_idx ON public.admin_audit_logs USING btree (action);


--
-- Name: admin_audit_tournament_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_tournament_idx ON public.admin_audit_logs USING btree (tournament_id);


--
-- Name: cm_match_results_player_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cm_match_results_player_idx ON public.cm_match_results USING btree (player_id);


--
-- Name: cm_match_results_tournament_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cm_match_results_tournament_idx ON public.cm_match_results USING btree (tournament_id);


--
-- Name: external_player_combos_combo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_player_combos_combo_idx ON public.external_player_combos USING btree (blade, ratchet, "bit");


--
-- Name: external_player_combos_player_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_player_combos_player_idx ON public.external_player_combos USING btree (player_id);


--
-- Name: external_player_combos_tournament_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_player_combos_tournament_idx ON public.external_player_combos USING btree (tournament_id);


--
-- Name: idx_user_aliases_lower_alias; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_aliases_lower_alias ON public.user_aliases USING btree (lower(alias));


--
-- Name: login_attempts_attempted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempts_attempted_at_idx ON public.login_attempts USING btree (attempted_at);


--
-- Name: login_attempts_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempts_email_idx ON public.login_attempts USING btree (email);


--
-- Name: login_attempts_ip_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempts_ip_idx ON public.login_attempts USING btree (ip_address);


--
-- Name: player_platform_stats_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX player_platform_stats_idx ON public.player_platform_stats USING btree (nickname, platform);


--
-- Name: session_expire_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_expire_idx ON public.session USING btree (expire);


--
-- Name: top_component_snapshot_ct_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX top_component_snapshot_ct_idx ON public.top_component_snapshot USING btree (component_type);


--
-- Name: top_component_snapshot_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX top_component_snapshot_name_idx ON public.top_component_snapshot USING btree (name);


--
-- Name: top_component_snapshot_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX top_component_snapshot_score_idx ON public.top_component_snapshot USING btree (punteggio_totale DESC);


--
-- Name: top_component_snapshot_season_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX top_component_snapshot_season_idx ON public.top_component_snapshot USING btree (season);


--
-- Name: top_component_snapshot_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX top_component_snapshot_unique ON public.top_component_snapshot USING btree (component_type, name, season);


--
-- Name: unique_user_tournament_combo_num_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_user_tournament_combo_num_idx ON public.challonge_reported_combos USING btree (user_id, tournament_id, combo_number);


--
-- Name: user_aliases_alias_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_aliases_alias_idx ON public.user_aliases USING btree (alias);


--
-- Name: user_aliases_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_aliases_user_id_idx ON public.user_aliases USING btree (user_id);


--
-- Name: users_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_idx ON public.users USING btree (email);


--
-- Name: users_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_token_idx ON public.users USING btree (verification_token);


--
-- Name: admin_audit_logs admin_audit_logs_admin_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_admin_user_id_users_id_fk FOREIGN KEY (admin_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: challonge_reported_combos challonge_reported_combos_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challonge_reported_combos
    ADD CONSTRAINT challonge_reported_combos_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cm_match_results cm_match_results_player_id_cm_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cm_match_results
    ADD CONSTRAINT cm_match_results_player_id_cm_players_id_fk FOREIGN KEY (player_id) REFERENCES public.cm_players(id) ON DELETE CASCADE;


--
-- Name: external_player_combos external_player_combos_player_id_cm_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_player_combos
    ADD CONSTRAINT external_player_combos_player_id_cm_players_id_fk FOREIGN KEY (player_id) REFERENCES public.cm_players(id) ON DELETE CASCADE;


--
-- Name: favorite_combos favorite_combos_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_combos
    ADD CONSTRAINT favorite_combos_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: favorite_deck_combos favorite_deck_combos_deck_id_favorite_decks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_deck_combos
    ADD CONSTRAINT favorite_deck_combos_deck_id_favorite_decks_id_fk FOREIGN KEY (deck_id) REFERENCES public.favorite_decks(id) ON DELETE CASCADE;


--
-- Name: favorite_decks favorite_decks_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_decks
    ADD CONSTRAINT favorite_decks_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 3y3qsuHGvpC6ab0IsCOnyIq1obuKK1nrH2j3oVA72SmEYuC8Xl251SQH6ckue6X

