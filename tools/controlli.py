"""Gli stessi controlli della CI, sulla tua macchina.

GitHub Actions non gira su questo repo (il credito e' bloccato), quindi il
workflow in .github/ e' un pezzo di carta finche' non lo si riabilita. Questo
script fa la stessa cosa in locale: e' l'unico modo perche' i controlli esistano
davvero invece che in teoria.

    python tools/controlli.py            # tutto quello che si puo' fare
    python tools/controlli.py --veloce   # solo test e tipi, per il gancio pre-push
    python tools/controlli.py --immagini # aggiunge la costruzione delle due immagini

Cosa fa, in ordine di costo:

  test senza database     169 test; quelli che toccano il database si saltano
                          da soli, com'e' giusto che sia
  tipi del frontend       tsc --noEmit
  migrazioni              --status: esce 1 se una migrazione e' cambiata dopo
                          essere stata applicata
  registro dei pezzi      doppioni, alias ambigui, schede senza voce
  test col database       187 test
  immagini (facoltativo)  docker build: prende cio' che tsc non vede, tipo
                          `cross-env not found`

I passi sul database si saltano da soli se il database di sviluppo non risponde,
e lo dicono: meglio un controllo dichiaratamente parziale che uno che sembra
completo e non lo e'.
"""

from __future__ import annotations

import argparse
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SVILUPPO = "postgresql://postgres:postgres@localhost:5433/beyblade_tracker"


class Esito:
    def __init__(self) -> None:
        self.righe: list[tuple[str, str, float]] = []

    def aggiungi(self, nome: str, stato: str, secondi: float) -> None:
        self.righe.append((nome, stato, secondi))

    @property
    def rotti(self) -> list[str]:
        return [nome for nome, stato, _ in self.righe if stato == "rotto"]

    def stampa(self) -> None:
        print()
        print("=" * 58)
        for nome, stato, secondi in self.righe:
            segno = {"ok": "ok  ", "rotto": "ROTTO", "saltato": "-   "}[stato]
            print(f"  {segno} {nome:38} {secondi:5.1f}s")
        print("=" * 58)
        if self.rotti:
            print(f"\n{len(self.rotti)} controllo/i rotto/i: {', '.join(self.rotti)}")
        else:
            print("\ntutto a posto")


def esegui(nome: str, comando: list[str], esito: Esito, *, cwd: Path | None = None,
           env_extra: dict[str, str] | None = None) -> bool:
    import os

    print(f"\n--- {nome}")
    ambiente = {**os.environ, **(env_extra or {})}
    # Le variabili del RAG non c'entrano coi test e una chiave mancante non deve
    # far fallire un controllo che non la usa.
    ambiente.setdefault("PYTHONIOENCODING", "utf-8")
    inizio = time.monotonic()
    esecuzione = subprocess.run(comando, cwd=str(cwd or REPO), env=ambiente)
    durata = time.monotonic() - inizio
    ok = esecuzione.returncode == 0
    esito.aggiungi(nome, "ok" if ok else "rotto", durata)
    return ok


def database_raggiungibile(porta: int = 5433) -> bool:
    try:
        with socket.create_connection(("localhost", porta), timeout=2):
            return True
    except OSError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--veloce", action="store_true",
                        help="solo test senza database e tipi del frontend")
    parser.add_argument("--immagini", action="store_true",
                        help="costruisci anche le due immagini Docker (lento)")
    parser.add_argument("--url", default=SVILUPPO, help="database su cui provare")
    args = parser.parse_args()

    esito = Esito()
    uv = shutil.which("uv") or "uv"

    esegui("test senza database", [uv, "run", "python", "-m", "pytest", "-q"], esito,
           cwd=REPO / "backend-py", env_extra={"DATABASE_URL": ""})

    npx = shutil.which("npx") or "npx"
    esegui("tipi del frontend", [npx, "tsc", "--noEmit"], esito, cwd=REPO / "frontend")

    if not args.veloce:
        if database_raggiungibile():
            esegui("migrazioni", [uv, "run", "--project", "backend-py", "python",
                                  "tools/migrate.py", "--url", args.url, "--status"], esito)
            esegui("registro dei pezzi", [uv, "run", "--project", "backend-py", "python",
                                          "tools/check_kb_registry.py", "--url", args.url], esito)
            esegui("test col database", [uv, "run", "python", "-m", "pytest", "-q"], esito,
                   cwd=REPO / "backend-py", env_extra={"DATABASE_URL": args.url})
        else:
            print("\n--- database di sviluppo non raggiungibile su :5433")
            print("    `npm run db:up` e rilancia, oppure accetta un controllo parziale")
            for nome in ("migrazioni", "registro dei pezzi", "test col database"):
                esito.aggiungi(nome, "saltato", 0.0)

        if args.immagini:
            esegui("immagine del backend",
                   ["docker", "build", "-t", "prova-backend", "./backend-py"], esito)
            esegui("immagine del frontend",
                   ["docker", "build", "-t", "prova-frontend",
                    "--build-arg", "VITE_PUBLIC_MINIO_URL=https://esempio.invalid",
                    "./frontend"], esito)

    esito.stampa()
    return 1 if esito.rotti else 0


if __name__ == "__main__":
    sys.exit(main())
