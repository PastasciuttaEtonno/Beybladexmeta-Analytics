"""Il gate di M4: misura le risposte, non il recupero.

eval_retrieval.py chiede "ha trovato i documenti giusti". Questo chiede "cosa ha
scritto con quei documenti", che e' una domanda diversa e con una risposta
diversa: un recupero perfetto e un modello che inventa danno un sistema rotto in
cui ogni singolo pezzo sembra funzionare.

    python tools/eval_generation.py --url "$DATABASE_URL" --provider openrouter
    python tools/eval_generation.py --url "$DATABASE_URL" --provider claude

Cosa viene contato:

  citazioni fantasma   identificatori che il modello ha scritto e che non erano
                       fra le fonti iniettate. DEVONO essere zero: e' l'unico
                       controllo che non dipende dalla buona volonta' del
                       modello, e una citazione inventata dice che la risposta
                       e' stata costruita a memoria.
  strumenti inesistenti stessa cosa, per i nomi delle funzioni.
  numeri senza fonte   euristica con falsi positivi noti - arrotondamenti e
                       separatori delle migliaia sono gia' tollerati, ma un
                       valore calcolato da altri due verrebbe segnalato. Si
                       guarda, non si usa per bocciare.
  astensione           sui casi fuori tema: ha detto di non sapere?
  strumenti usati      su una domanda quantitativa ne ha chiamato uno? Non
                       chiamarlo significa aver risposto con la prosa, che e'
                       la violazione piu' facile da non notare.

Il confronto fra due fornitori si fa cosi': stesse domande, stesso corpus, e si
leggono le colonne. Non "sembra scrivere bene".
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "backend-py"))

import yaml  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.lib.rag import generate  # noqa: E402
from app.lib.rag.env import load_env  # noqa: E402

load_env()

# Le domande che devono far chiamare uno strumento: chiedono quantita'.
QUANTITATIVE_TAGS = {"statistica", "confine"}


def _async_url(url: str) -> str:
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return url.replace(prefix, "postgresql+asyncpg://", 1)
    return url


async def run(args) -> int:
    cases = yaml.safe_load(Path(args.golden).read_text(encoding="utf-8"))["cases"]
    if args.only:
        cases = [c for c in cases if c["id"] in args.only]
    if args.limit:
        cases = cases[: args.limit]

    engine = create_async_engine(_async_url(args.url), pool_pre_ping=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    model = generate.get_model(args.provider)

    phantom = unknown_tools = unsourced = failed = 0
    abstained_right = abstained_wrong = 0
    should_abstain = 0
    tool_expected = tool_used = 0
    latencies: list[int] = []
    tokens_in = tokens_out = 0
    problems: list[str] = []

    print(f"fornitore {args.provider}   modello {model.name}   {len(cases)} casi\n")

    try:
        async with factory() as session:
            for index, case in enumerate(cases, 1):
                tags = set(case.get("tags") or [])
                expects_nothing = bool(case.get("expected_none"))
                wants_tool = bool(QUANTITATIVE_TAGS & tags) or bool(case.get("expected_routing"))

                started = time.monotonic()
                try:
                    answer = await generate.answer(session, case["query"], model=model)
                except Exception as exc:
                    # Un fornitore che cede su una domanda non deve far perdere
                    # le altre ventiquattro. Il guasto e' un risultato: un
                    # modello che non risponde e' un modello che non si puo'
                    # usare, e va contato accanto agli altri difetti.
                    failed += 1
                    problems.append(f"{case['id']}: {type(exc).__name__} - {str(exc)[:120]}")
                    print(f"  {index:2}/{len(cases)} X {case['id']:30} "
                          f"{int((time.monotonic() - started) * 1000):6}ms  GUASTO")
                    if args.pause:
                        await asyncio.sleep(args.pause)
                    continue
                latencies.append(answer.latency_ms)
                tokens_in += answer.input_tokens
                tokens_out += answer.output_tokens

                verdict = answer.verdict
                phantom += len(verdict.phantom_citations)
                unknown_tools += len(verdict.unknown_tools)
                unsourced += len(verdict.unsourced_numbers)

                if expects_nothing:
                    should_abstain += 1
                    if answer.abstained or _says_it_does_not_know(answer.text):
                        abstained_right += 1
                    else:
                        abstained_wrong += 1
                        problems.append(f"{case['id']}: doveva astenersi, ha risposto")

                if wants_tool:
                    tool_expected += 1
                    if answer.tool_calls:
                        tool_used += 1
                    else:
                        problems.append(
                            f"{case['id']}: domanda quantitativa senza chiamate a "
                            f"strumenti - risposta presa dalla prosa")

                if verdict.phantom_citations:
                    problems.append(
                        f"{case['id']}: citazioni inesistenti "
                        f"{verdict.phantom_citations}")
                if verdict.unknown_tools:
                    problems.append(
                        f"{case['id']}: strumenti inesistenti {verdict.unknown_tools}")

                mark = "!" if not verdict.ok else ("~" if verdict.unsourced_numbers else " ")
                print(f"  {index:2}/{len(cases)} {mark} {case['id']:30} "
                      f"{answer.latency_ms:6}ms  strumenti={len(answer.tool_calls)}"
                      f"{'  ASTENUTO' if answer.abstained else ''}")
                if args.pause:
                    await asyncio.sleep(args.pause)
    finally:
        await engine.dispose()

    total = len(cases)
    median = sorted(latencies)[len(latencies) // 2] if latencies else 0
    print(f"\n{'=' * 62}")
    print(f"  citazioni fantasma      {phantom:4}   (deve essere 0)")
    print(f"  strumenti inesistenti   {unknown_tools:4}   (deve essere 0)")
    print(f"  numeri senza fonte      {unsourced:4}   (euristica, da guardare)")
    if should_abstain:
        print(f"  astensioni corrette     {abstained_right:4}/{should_abstain}")
    if tool_expected:
        print(f"  strumenti usati         {tool_used:4}/{tool_expected}   "
              f"sulle domande quantitative")
    print(f"  latenza mediana         {median:4} ms")
    print(f"  token                   {tokens_in} in / {tokens_out} out")
    if failed:
        print(f"  domande senza risposta  {failed:4}/{total}   il fornitore ha ceduto")

    if problems:
        print(f"\n  {len(problems)} problema/i:")
        for problem in problems:
            print(f"    - {problem}")

    passed = phantom == 0 and unknown_tools == 0 and failed == 0
    print(f"\n  GATE M4: {'superato' if passed else 'NON superato'}")
    return 0 if passed else 1


def _says_it_does_not_know(text: str) -> bool:
    """Un'astensione scritta dal modello invece che decisa dal recupero.

    Grezza di proposito: riconoscerla con precisione richiederebbe un altro
    modello, e sbagliare in eccesso qui gonfierebbe il punteggio. Le formule
    cercate sono quelle che il prompt di sistema chiede esplicitamente.
    """
    lowered = text.lower()
    return any(phrase in lowered for phrase in (
        "non lo copre", "non e' nel corpus", "non è nel corpus",
        "non ho trovato", "non riguarda", "non e' il mio argomento",
        "non è il mio argomento", "solo beyblade x",
    ))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True)
    parser.add_argument("--golden", default=str(REPO / "eval" / "golden_set.yaml"))
    parser.add_argument("--provider", default="claude", choices=["claude", "openrouter"])
    parser.add_argument("--only", nargs="*", help="solo questi id")
    parser.add_argument("--limit", type=int, help="primi N casi")
    parser.add_argument("--pause", type=float, default=0.0,
                        help="secondi fra una domanda e l'altra, per i tetti "
                             "di richieste dei modelli gratuiti")
    return asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    sys.exit(main())
