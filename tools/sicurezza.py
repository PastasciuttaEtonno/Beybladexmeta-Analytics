"""Gli stessi controlli di sicurezza della CI, sulla tua macchina.

E' il gemello di tools/controlli.py: quello risponde a "funziona?", questo a
"e' sicuro?". Esistono separati perche' si rompono per motivi diversi e perche'
uno dei due puo' restare rosso per giorni - una CVE senza patch, per dire -
senza che questo debba impedirti di lavorare.

    python tools/sicurezza.py             # tutto
    python tools/sicurezza.py --veloce    # solo cio' che non serve Docker
    python tools/sicurezza.py --immagini  # aggiunge la scansione delle immagini

Perche' averlo in locale ora che Actions funziona: perche' un problema di
sicurezza scoperto dopo il push e' gia' pubblico. Un segreto in un commit
spinto su GitHub va ruotato anche se lo togli un minuto dopo, perche' nel
frattempo e' stato in un repo remoto e nei suoi cloni. Il pre-push e' l'ultimo
momento in cui la correzione costa ancora poco - ed e' per questo che
`hooks:install` attacca la scansione dei segreti li' e non altrove.

Quasi tutti gli strumenti girano dentro Docker: sono scritti in Go, Python e
Haskell, e installarli tutti a mano su Windows e' un pomeriggio buttato. Se
Docker non c'e', i passi che lo vogliono si saltano e lo DICONO - un controllo
dichiaratamente parziale e' onesto, uno che sembra completo e non lo e' e'
peggio di niente.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Versioni fissate e non `latest`, per lo stesso motivo per cui lo sono le
# immagini di base: uno strumento che si aggiorna da solo cambia i risultati
# senza che nessuno abbia cambiato il codice, e allora non sai piu' se la
# nuova segnalazione e' colpa tua o sua.
GITLEAKS = "zricethezav/gitleaks:v8.21.2"
SEMGREP = "semgrep/semgrep:1.97.0"
TRIVY = "aquasec/trivy:0.58.1"
HADOLINT = "hadolint/hadolint:v2.12.0"
CHECKOV = "bridgecrew/checkov:3.2.334"

# Su questo codice `text()` si usa ovunque CON i parametri legati, che e' il
# modo corretto: la regola scatta 50 volte e ha ragione zero.
REGOLA_RUMOROSA = (
    "python.sqlalchemy.security.audit.avoid-sqlalchemy-text.avoid-sqlalchemy-text"
)


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
        print("=" * 62)
        for nome, stato, secondi in self.righe:
            segno = {"ok": "ok  ", "rotto": "ROTTO", "saltato": "-   ",
                     "avviso": "nota "}[stato]
            print(f"  {segno} {nome:44} {secondi:5.1f}s")
        print("=" * 62)
        if self.rotti:
            print(f"\n{len(self.rotti)} controllo/i rotto/i: {', '.join(self.rotti)}")
        else:
            print("\nnessun problema bloccante")


def esegui(nome: str, comando: list[str], esito: Esito, *,
           blocca: bool = True, cwd: Path | None = None) -> bool:
    print(f"\n--- {nome}")
    inizio = time.monotonic()
    ambiente = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    esecuzione = subprocess.run(comando, cwd=str(cwd or REPO), env=ambiente)
    durata = time.monotonic() - inizio
    ok = esecuzione.returncode == 0
    esito.aggiungi(nome, "ok" if ok else ("rotto" if blocca else "avviso"), durata)
    return ok


def in_docker(immagine: str, argomenti: list[str], *, monta_socket: bool = False) -> list[str]:
    """Il comando per far girare uno strumento contenendo il repo in /src."""
    comando = ["docker", "run", "--rm", "-v", f"{REPO}:/src", "-w", "/src"]
    if monta_socket:
        # Trivy deve vedere le immagini gia' costruite sull'host, che vivono
        # nel demone e non nel filesystem.
        comando += ["-v", "/var/run/docker.sock:/var/run/docker.sock"]
    return comando + [immagine] + argomenti


def docker_c_e() -> bool:
    if not shutil.which("docker"):
        return False
    return subprocess.run(["docker", "info"], capture_output=True).returncode == 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--veloce", action="store_true",
                        help="solo i controlli che non richiedono Docker")
    parser.add_argument("--immagini", action="store_true",
                        help="costruisci e scansiona le due immagini (lento)")
    parser.add_argument("--solo-segreti", action="store_true",
                        help="solo la scansione dei segreti (per il pre-push)")
    argomenti = parser.parse_args()

    esito = Esito()
    docker = docker_c_e()

    # ------------------------------------------------------------------
    # I segreti: primo perche' e' l'unico la cui correzione non e' gratis.
    # ------------------------------------------------------------------
    if docker:
        esegui("segreti nella storia (gitleaks)",
               in_docker(GITLEAKS, ["detect", "--source=/src", "--config=/src/.gitleaks.toml",
                                    "--no-banner", "--redact"]),
               esito)
    else:
        esito.aggiungi("segreti nella storia (gitleaks)", "saltato", 0.0)

    if argomenti.solo_segreti:
        esito.stampa()
        if not docker:
            # Detto forte perche' questo ramo gira dentro il pre-push, dove un
            # "saltato" in una tabella passa inosservato e il push parte lo
            # stesso. Non fa fallire il push - Docker spento non e' colpa di
            # chi sta spingendo - ma deve restare impossibile crederlo fatto.
            print()
            print("!" * 62)
            print("  ATTENZIONE: Docker non risponde, i segreti NON sono stati")
            print("  cercati. Questo push non e' stato controllato.")
            print("  Avvia Docker e rilancia `npm run sicurezza:veloce`.")
            print("!" * 62)
        return 1 if esito.rotti else 0

    # ------------------------------------------------------------------
    # Le regole di questo progetto: nessuna dipendenza, sempre eseguibile.
    # ------------------------------------------------------------------
    esegui("le regole di questo progetto (conformita)",
           [sys.executable, "tools/conformita.py"], esito)

    if argomenti.veloce:
        esito.stampa()
        if not docker:
            print("\nDocker non risponde: saltati gitleaks, semgrep, trivy, hadolint, checkov.")
        return 1 if esito.rotti else 0

    if not docker:
        for nome in ("SAST (semgrep)", "dipendenze (trivy)",
                     "Dockerfile (hadolint)", "configurazione (checkov)"):
            esito.aggiungi(nome, "saltato", 0.0)
        esito.stampa()
        print("\nDocker non risponde: quasi tutto e' stato saltato.")
        print("Avvia Docker Desktop e rilancia, oppure accetta un controllo parziale.")
        return 1 if esito.rotti else 0

    # ------------------------------------------------------------------
    # SAST. Non blocca: vedi il commento in .github/workflows/sicurezza.yml -
    # delle 19 segnalazioni che restano nessuna e' sfruttabile, ma finche'
    # sono li' bloccare vorrebbe dire non poter piu' spingere niente.
    # ------------------------------------------------------------------
    esegui("SAST (semgrep)",
           in_docker(SEMGREP, ["semgrep", "scan", "--config=p/default",
                               "--config=p/security-audit", "--config=p/secrets",
                               f"--exclude-rule={REGOLA_RUMOROSA}",
                               "--metrics=off", "--error"]),
           esito, blocca=False)

    # ------------------------------------------------------------------
    # SCA. --ignore-unfixed per la stessa ragione di sempre: una CVE senza
    # patch non e' azionabile, e una riga rossa che nessuno puo' far tornare
    # verde viene spenta.
    # ------------------------------------------------------------------
    esegui("dipendenze (trivy)",
           in_docker(TRIVY, ["fs", "--scanners", "vuln", "--severity", "HIGH,CRITICAL",
                             "--ignore-unfixed", "--exit-code", "1", "--quiet",
                             "--skip-dirs", ".config,attached_assets,node_modules", "/src"]),
           esito)

    # ------------------------------------------------------------------
    # IaC: qui l'infrastruttura sono due Dockerfile e due compose.
    # ------------------------------------------------------------------
    for nome, percorso in (("backend", "backend-py/Dockerfile"),
                           ("frontend", "frontend/Dockerfile")):
        esegui(f"Dockerfile del {nome} (hadolint)",
               in_docker(HADOLINT, ["hadolint", "--config", "/src/.hadolint.yaml",
                                    f"/src/{percorso}"]),
               esito)

    esegui("configurazione (checkov)",
           in_docker(CHECKOV, ["-d", "/src", "--config-file", "/src/.checkov.yaml"]),
           esito)

    # ------------------------------------------------------------------
    # Le immagini: facoltative perche' vanno costruite prima, e sono minuti.
    # ------------------------------------------------------------------
    if argomenti.immagini:
        costruite = []
        if esegui("costruisci l'immagine del backend",
                  ["docker", "build", "-t", "prova-backend", "./backend-py"], esito):
            costruite.append("prova-backend")
        if esegui("costruisci l'immagine del frontend",
                  ["docker", "build", "-t", "prova-frontend",
                   "--build-arg", "VITE_PUBLIC_MINIO_URL=https://esempio.invalid",
                   "./frontend"], esito):
            costruite.append("prova-frontend")

        for immagine in costruite:
            esegui(f"CVE in {immagine} (trivy)",
                   in_docker(TRIVY, ["image", "--severity", "HIGH,CRITICAL",
                                     "--ignore-unfixed", "--exit-code", "1",
                                     "--quiet", immagine], monta_socket=True),
                   esito)

    esito.stampa()

    if any(stato == "avviso" for _, stato, _ in esito.righe):
        print("\nLe righe 'nota' segnalano e non fermano: sono spiegate in")
        print("docs/sicurezza.md, insieme a cosa serve per renderle bloccanti.")

    print("\nCosa NON copre questo comando: il DAST, che vuole lo stack acceso e")
    print("gira in notturna su GitHub (.github/workflows/dast.yml).")

    return 1 if esito.rotti else 0


if __name__ == "__main__":
    sys.exit(main())
