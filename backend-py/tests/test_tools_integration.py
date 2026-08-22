"""I tool contro il database vero, confrontati con l'endpoint di produzione.

E' il gate di M3: un tool che calcola i punti a modo suo farebbe rispondere al
modello numeri diversi da quelli che l'utente legge sul sito, e nessuno dei due
sarebbe evidentemente sbagliato. Il confronto e' l'unico modo per accorgersene.

Saltati automaticamente senza DATABASE_URL, cosi' la suite veloce resta veloce:

    DATABASE_URL=postgresql://postgres:postgres@localhost:5433/beyblade_tracker \\
      python -m pytest tests/test_tools_integration.py -v
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.lib.rag import tools
from app.lib.scoring import BASE_POINTS

from app.lib.rag.env import came_from_dotenv, load_env

load_env()
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# Non basta che la variabile esista: deve venire da CHI HA LANCIATO il test.
# Il .env alla radice e' il file di docker-compose, e il suo DATABASE_URL punta
# a `db:5432` - l'host interno della rete Docker, che da qui non si risolve.
# Senza questa distinzione i test non si saltavano piu' e fallivano con un
# errore DNS, che sembra un guasto e invece e' una configurazione presa dal
# posto sbagliato.
_USABLE = bool(DATABASE_URL) and not came_from_dotenv("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not _USABLE,
    reason="esporta DATABASE_URL verso un database raggiungibile da questo processo "
           "(quello nel .env punta all'host interno di Docker)",
)


def _async_url(url: str) -> str:
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return url.replace(prefix, "postgresql+asyncpg://", 1)
    return url


@pytest.fixture
async def session():
    engine = create_async_engine(_async_url(DATABASE_URL), pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        yield s
    await engine.dispose()


async def _endpoint_meta(session):
    """Ricalcola /api/analytics/meta con la logica del router, sugli stessi dati.

    Non si chiama l'endpoint via HTTP: il test deve poter girare senza che il
    servizio sia in piedi, e cio' che va verificato e' l'accordo sulla FORMULA,
    non sul trasporto.
    """
    rows = await session.execute(text(
        'SELECT blade, ratchet, "bit", rank, participant_count '
        "FROM unified_meta_view"
    ))
    points: dict[str, dict[str, float]] = {"blade": {}, "ratchet": {}, "bit": {}}
    for row in rows:
        if not row.rank or row.rank > 4:
            continue
        earned = BASE_POINTS.get(row.rank, 0) * (row.participant_count or 0)
        if earned == 0:
            continue
        for bucket, value in (("blade", row.blade), ("ratchet", row.ratchet),
                              ("bit", row.bit)):
            if value:
                points[bucket][value] = points[bucket].get(value, 0) + earned
    return points


@pytest.mark.parametrize("slot", ["blade", "ratchet", "bit"])
async def test_component_ranking_agrees_with_the_endpoint(session, slot):
    reference = (await _endpoint_meta(session))[slot]
    result = await tools.component_ranking(session, slot=slot, limit=100)
    ours = {row["nome"]: row["punti"] for row in result.rows}

    for name, value in ours.items():
        assert value == reference.get(name), f"{slot}/{name}"

    # L'unica differenza ammessa e' che i tool escludano i segnaposto. Se
    # l'endpoint ne mostra uno, il piu' sbagliato dei due e' l'endpoint.
    only_in_reference = set(reference) - set(ours)
    assert all(not tools._real(name) for name in only_in_reference), only_in_reference


async def test_placeholders_never_reach_a_ranking(session):
    for slot in tools.SLOT_COLUMN:
        result = await tools.component_ranking(session, slot=slot, limit=100)
        assert all(tools._real(row["nome"]) for row in result.rows), slot


async def test_every_tool_returns_sample_size_and_as_of(session):
    calls = [
        ("top_combos", {"limit": 5}),
        ("component_ranking", {"slot": "blade", "limit": 5}),
        ("component_usage", {"slot": "blade", "name": "WizardRod"}),
        ("combo_detail", {"blade": "WizardRod", "ratchet": "1-60", "bit": "Hexa"}),
        ("compare_components", {"slot": "ratchet", "names": ["1-60", "9-60"]}),
    ]
    for name, arguments in calls:
        payload = await tools.call_tool(session, name, arguments)
        assert "error" not in payload, (name, payload)
        assert isinstance(payload["sample_size"], int), name
        assert payload["as_of"], name
        assert payload["source"] == "unified_meta_view", name


async def test_a_combo_that_never_placed_says_so(session):
    payload = await tools.call_tool(session, "combo_detail", {
        "blade": "WizardRod", "ratchet": "9-99", "bit": "Inesistente"})
    assert payload["sample_size"] == 0
    assert payload["rows"] == []
    assert any("non esiste" in note for note in payload["notes"])


async def test_usage_partners_match_the_placements_counted(session):
    """I partner sono un sottoinsieme dei piazzamenti contati: se una quota
    superasse il 100% vorrebbe dire che si stanno contando righe due volte."""
    payload = await tools.call_tool(
        session, "component_usage", {"slot": "blade", "name": "WizardRod"})
    total = payload["sample_size"]
    assert total > 0
    for partners in payload["rows"][0]["montato_piu_spesso_con"].values():
        for partner in partners:
            assert partner["insieme"] <= total
            assert 0 < partner["quota_pct"] <= 100


async def test_limit_is_clamped(session):
    """Il limite arriva dal modello: 10.000 non deve diventare 10.000 righe."""
    result = await tools.top_combos(session, limit=9999)
    assert len(result.rows) <= 20


async def test_unknown_slot_is_reported_not_raised(session):
    payload = await tools.call_tool(
        session, "component_ranking", {"slot": "cappello", "limit": 5})
    assert "error" in payload and "cappello" in payload["error"]


async def test_a_real_season_produces_no_warning(session):
    payload = await tools.call_tool(session, "component_usage", {
        "slot": "blade", "name": "WizardRod", "season": "Off Season 2025"})
    assert payload["sample_size"] > 0
    assert not any("non esiste nei dati" in note for note in payload["notes"])


async def test_current_meta_reads_the_snapshot_not_the_tournaments(session):
    """Le due fonti rispondono a domande diverse e non vanno sommate.

    unified_meta_view si ferma al 16 gennaio 2026; meta_snapshot e' una
    fotografia del meta corrente. Senza questo strumento una domanda sull'oggi
    riceveva dati di sette mesi prima, o uno zero.
    """
    payload = await tools.call_tool(session, "current_meta", {"slot": None, "limit": 5})
    assert payload["source"] == "meta_snapshot"
    assert payload["rows"]
    assert payload["sample_size"] > 0
    # La provenienza diversa e' dichiarata, sempre, in prima posizione.
    assert "gia' aggregata da terzi" in payload["notes"][0]


async def test_current_meta_per_slot_ranks_by_wins(session):
    payload = await tools.call_tool(session, "current_meta",
                                    {"slot": "blade", "limit": 5})
    wins = [row["vittorie"] for row in payload["rows"]]
    assert wins == sorted(wins, reverse=True)
    assert all(tools._real(row["nome"]) for row in payload["rows"])


async def test_a_valid_season_without_tournaments_is_not_called_nonexistent(session):
    """Season 2026 esiste - determine_season la produce per ogni data dal 1
    febbraio 2026 - ma nessun torneo di quel periodo e' stato importato.
    Dire 'non esiste' farebbe concludere al modello che la stagione non e'
    valida invece che non ancora popolata: due cose diverse."""
    payload = await tools.call_tool(session, "component_usage", {
        "slot": "blade", "name": "WizardRod", "season": "Season 2026"})
    note = payload["notes"][0]
    assert "Nessun torneo importato" in note
    assert "non significa che la stagione non esista" in note.lower()
    assert "vuoto di dati" in note
    # E indica dove guardare per il meta attuale.
    assert "current_meta" in note
