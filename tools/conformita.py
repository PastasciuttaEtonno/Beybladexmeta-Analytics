"""Le regole di sicurezza di questo progetto, verificate una per una.

Gli scanner del settore (gitleaks, semgrep, trivy, checkov) sanno cercare i
problemi che hanno TUTTI i progetti. Non sanno niente delle promesse che si e'
fatta questa applicazione in particolare: che il cookie di sessione sia
`httponly`, che la Swagger di FastAPI resti chiusa al pubblico, che il dump
usato in CI non contenga persone vere. Quelle promesse vivono sparse fra
nginx.conf.template, sessions.py e il Dockerfile, e finora niente controllava
che qualcuno non le smontasse per sbaglio.

Questo file e' quel qualcuno. E' lo stesso mestiere di check_kb_registry.py -
prendere una cosa che sappiamo debba essere vera e chiederglielo a ogni push -
applicato alla sicurezza invece che al registro dei pezzi.

    python tools/conformita.py           # tutte le regole
    python tools/conformita.py --lista   # cosa controlla, senza controllare

Ogni regola dice tre cose: cosa pretende, dove guarda, e cosa succede se salta.
La terza e' la piu' importante: una regola di cui non sai dire il danno e' una
regola che prima o poi qualcuno disattivera' perche' dava fastidio.
"""

from __future__ import annotations

import argparse
import gzip
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


@dataclass
class Regola:
    nome: str
    danno: str
    problemi: list[str] = field(default_factory=list)
    saltata: str | None = None

    @property
    def stato(self) -> str:
        if self.saltata:
            return "saltato"
        return "rotto" if self.problemi else "ok"


def leggi(percorso: str) -> str | None:
    file = REPO / percorso
    return file.read_text(encoding="utf-8", errors="replace") if file.is_file() else None


# --------------------------------------------------------------------------
# 1. I segreti non entrano nel repo
# --------------------------------------------------------------------------

def env_non_tracciati() -> Regola:
    """Nessun .env versionato, a parte gli esempi.

    Il danno: un .env vero in un commit e' pubblico per sempre, anche dopo che
    lo cancelli - resta nella storia, e la storia si clona. La ruota di ogni
    chiave dentro quel file diventa obbligatoria, e sono una dozzina.
    """
    regola = Regola("segreti fuori dal repo",
                    "un .env committato resta nella storia anche dopo il rm")
    risultato = subprocess.run(["git", "ls-files"], cwd=REPO,
                               capture_output=True, text=True)
    if risultato.returncode != 0:
        regola.saltata = "git non risponde"
        return regola

    for riga in risultato.stdout.splitlines():
        nome = Path(riga).name
        # .env.example e .env.docker.example mostrano la FORMA delle variabili:
        # e' proprio quello che devono fare, ed e' il motivo per cui esistono.
        if nome.startswith(".env") and not nome.endswith(".example"):
            regola.problemi.append(f"{riga} e' versionato")
        if re.search(r"\.(pem|key|p12|pfx)$", riga):
            regola.problemi.append(f"{riga}: chiave o certificato versionato")

    return regola


def esempi_senza_valori_veri() -> Regola:
    """Nei .env.example ci va la forma, non il valore.

    Il danno: e' la perdita piu' beffarda che esista. Il file si chiama
    "esempio", nessuno lo guarda con sospetto, e intanto la chiave e' pubblica.
    """
    regola = Regola("gli esempi restano esempi",
                    "un valore vero in un .env.example e' un segreto pubblico")

    # Chiavi vere riconoscibili dal loro prefisso. Non e' un elenco completo -
    # per quello c'e' gitleaks - ma prende i fornitori che questo progetto usa
    # davvero, che sono quelli su cui puo' sbagliare.
    veri = re.compile(
        r"(sk-ant-[A-Za-z0-9-]{20,}"       # Anthropic
        r"|sk-or-v1-[A-Za-z0-9]{20,}"      # OpenRouter
        r"|pa-[A-Za-z0-9_-]{20,}"          # Voyage
        r"|re_[A-Za-z0-9_-]{20,})"         # Resend
    )
    for file in REPO.rglob(".env*.example"):
        if "node_modules" in file.parts or ".venv" in file.parts:
            continue
        righe = file.read_text(encoding="utf-8", errors="replace").splitlines()
        for numero, riga in enumerate(righe, 1):
            if veri.search(riga):
                nome = riga.split("=", 1)[0].strip()
                relativo = file.relative_to(REPO).as_posix()
                regola.problemi.append(f"{relativo}:{numero} {nome} sembra una chiave vera")
    return regola


# --------------------------------------------------------------------------
# 2. Le promesse dell'applicazione
# --------------------------------------------------------------------------

def cookie_di_sessione() -> Regola:
    """Il cookie di sessione non deve essere leggibile da JavaScript.

    Il danno: senza `httponly`, un solo XSS in qualunque punto del sito diventa
    furto di sessione - l'attaccante legge document.cookie e da quel momento e'
    loggato come te. Senza `samesite`, la stessa sessione parte da sola su ogni
    richiesta che un altro sito riesce a far fare al tuo browser.
    """
    regola = Regola("il cookie di sessione e' protetto",
                    "senza httponly un XSS qualsiasi diventa furto di sessione")
    testo = leggi("backend-py/app/lib/sessions.py")
    if testo is None:
        regola.saltata = "sessions.py non trovato"
        return regola

    chiamate = re.findall(r"set_cookie\((.*?)\n\s*\)", testo, re.S)
    if not chiamate:
        regola.problemi.append("nessuna set_cookie trovata: il file e' cambiato molto")
    for chiamata in chiamate:
        compatta = chiamata.replace(" ", "")
        if "httponly=True" not in compatta:
            regola.problemi.append("una set_cookie senza httponly=True")
        if "samesite=" not in compatta:
            regola.problemi.append("una set_cookie senza samesite")
    return regola


def intestazioni_di_sicurezza() -> Regola:
    """nginx deve continuare a mandare le intestazioni che mandava Express.

    Il danno: sono passate da Express a nginx durante la migrazione, e una
    intestazione persa in un trasloco non fa rumore - il sito funziona
    benissimo senza. Te ne accorgi quando qualcuno ti mette in un iframe.
    """
    regola = Regola("le intestazioni di sicurezza ci sono ancora",
                    "un'intestazione persa nel trasloco non fa rumore")
    testo = leggi("frontend/nginx.conf.template")
    if testo is None:
        regola.saltata = "nginx.conf.template non trovato"
        return regola

    for intestazione in ("X-Frame-Options", "X-Content-Type-Options",
                         "Referrer-Policy", "Content-Security-Policy"):
        if intestazione not in testo:
            regola.problemi.append(f"manca {intestazione}")

    # frame-ancestors e object-src sono le due direttive della CSP che valgono
    # da sole: la prima impedisce il clickjacking anche dove X-Frame-Options
    # non arriva, la seconda chiude i plugin come vettore.
    for direttiva in ("frame-ancestors", "object-src"):
        if direttiva not in testo:
            regola.problemi.append(f"la CSP non dichiara {direttiva}")

    if "server_tokens off" not in testo:
        regola.problemi.append("server_tokens non e' spento: nginx annuncia la sua versione")
    return regola


def swagger_chiusa() -> Regola:
    """La Swagger di FastAPI non deve essere raggiungibile dall'esterno.

    Il danno: /api/_py/docs e' l'elenco completo delle rotte, dei parametri e
    dei modelli - comprese quelle di /api/admin. E' una mappa del backend
    regalata a chiunque passi. Sta chiusa in nginx e non nell'applicazione
    apposta, cosi' resta comoda per chi arriva al container direttamente.
    """
    regola = Regola("la Swagger non e' pubblica",
                    "e' la mappa completa del backend, admin comprese")
    nginx = leggi("frontend/nginx.conf.template")
    main = leggi("backend-py/app/main.py")
    if nginx is None or main is None:
        regola.saltata = "nginx.conf.template o main.py non trovati"
        return regola

    dichiarato = re.search(r'docs_url\s*=\s*"([^"]+)"', main)
    if not dichiarato:
        regola.problemi.append(
            "main.py non dichiara docs_url: la Swagger sta sul percorso di default /docs")
        return regola

    percorso = dichiarato.group(1).rsplit("/", 1)[0] + "/"
    # Il blocco deve esserci E deve chiudere: una location vuota lascia passare
    # tutto al fallback della SPA.
    blocco = re.search(r"location\s+" + re.escape(percorso) + r"\s*\{(.*?)\}", nginx, re.S)
    if not blocco:
        regola.problemi.append(f"nginx non blocca {percorso} (docs_url e' {dichiarato.group(1)})")
    elif "return 404" not in blocco.group(1) and "return 403" not in blocco.group(1):
        regola.problemi.append(f"il blocco {percorso} non chiude nulla")
    return regola


# --------------------------------------------------------------------------
# 3. I contenitori
# --------------------------------------------------------------------------

def contenitori_non_root() -> Regola:
    """Ogni immagine deve dichiarare un utente non root.

    Il danno: root nel container non e' root sull'host, ma accorcia di un passo
    ogni catena di evasione, e vale la differenza fra una falla in nginx che
    resta dentro il container e una che ne esce.
    """
    regola = Regola("i contenitori non girano da root",
                    "root nel container accorcia di un passo ogni evasione")
    for percorso in ("backend-py/Dockerfile", "frontend/Dockerfile"):
        testo = leggi(percorso)
        if testo is None:
            regola.problemi.append(f"{percorso} non trovato")
            continue
        utenti = re.findall(r"^\s*USER\s+(\S+)", testo, re.M)
        if not utenti:
            regola.problemi.append(f"{percorso}: nessuna USER, gira da root")
        elif utenti[-1] in ("root", "0"):
            regola.problemi.append(f"{percorso}: l'ultima USER e' {utenti[-1]}")
    return regola


def immagini_di_base_fissate() -> Regola:
    """Nessun FROM su un tag mobile.

    Il danno: con `:latest` la stessa build a due settimane di distanza produce
    due immagini diverse, e quando una si rompe non hai modo di sapere cosa e'
    cambiato. E' anche il modo piu' semplice per far entrare codice di altri
    senza accorgersene.
    """
    regola = Regola("le immagini di base sono fissate",
                    "con :latest la stessa build da' due risultati diversi")
    for percorso in ("backend-py/Dockerfile", "frontend/Dockerfile"):
        testo = leggi(percorso)
        if testo is None:
            continue
        for riferimento in re.findall(r"^\s*FROM\s+(\S+)", testo, re.M):
            if riferimento.startswith("$"):
                continue
            if "@sha256:" in riferimento:
                continue
            if ":" not in riferimento.rsplit("/", 1)[-1] or riferimento.endswith(":latest"):
                regola.problemi.append(f"{percorso}: FROM {riferimento} non e' fissato")
    return regola


def compose_senza_segreti() -> Regola:
    """Il compose di produzione passa le variabili, non i valori.

    Il danno: un segreto scritto per esteso qui e' un segreto versionato, con
    la stessa storia infinita del .env - e per giunta in un file che si guarda
    spesso e si copia volentieri.
    """
    regola = Regola("il compose di produzione non contiene valori",
                    "un valore per esteso qui e' un segreto versionato")
    testo = leggi("docker-compose.prod.yml")
    if testo is None:
        regola.saltata = "docker-compose.prod.yml non trovato"
        return regola

    sensibile = re.compile(r"(SECRET|API_KEY|PASSWORD|TOKEN|CLIENT_SECRET|DATABASE_URL)")
    for numero, riga in enumerate(testo.splitlines(), 1):
        spoglia = riga.strip()
        if spoglia.startswith("#") or ":" not in spoglia:
            continue
        chiave, _, valore = spoglia.partition(":")
        valore = valore.strip()
        if not sensibile.search(chiave) or not valore:
            continue
        # Va bene solo ${VAR} o ${VAR:-} con default vuoto. Un default con
        # dentro qualcosa e' un valore scritto nel repo come un altro.
        if not re.fullmatch(r"\$\{[A-Z_]+(:-\s*)?\}", valore):
            regola.problemi.append(
                f"docker-compose.prod.yml:{numero} {chiave.strip()} = {valore[:30]}")
    return regola


# --------------------------------------------------------------------------
# 4. La catena di montaggio stessa
# --------------------------------------------------------------------------

def permessi_dei_workflow() -> Regola:
    """Ogni workflow deve dichiarare i suoi permessi.

    Il danno: senza un blocco `permissions`, il GITHUB_TOKEN del lavoro eredita
    il default del repo, che su un repo vecchio e' spesso scrittura su tutto.
    Da li' una dipendenza compromessa dentro un `npm ci` puo' riscrivere il
    codice, pubblicare release, muovere i tag. E' il punto piu' spesso
    dimenticato di tutta la linea di montaggio, perche' la CI funziona
    benissimo lo stesso.
    """
    regola = Regola("i workflow dichiarano i loro permessi",
                    "senza permissions il token eredita la scrittura su tutto")
    cartella = REPO / ".github" / "workflows"
    if not cartella.is_dir():
        regola.saltata = "nessun workflow"
        return regola

    for file in sorted(cartella.glob("*.yml")) + sorted(cartella.glob("*.yaml")):
        testo = file.read_text(encoding="utf-8", errors="replace")
        # Solo il blocco di primo livello: una `permissions:` annidata dentro un
        # job non protegge gli altri job.
        if not re.search(r"^permissions:", testo, re.M):
            regola.problemi.append(f"{file.name}: nessun blocco permissions di primo livello")
        elif re.search(r"^permissions:\s*write-all", testo, re.M):
            regola.problemi.append(f"{file.name}: permissions write-all")
    return regola


def dump_senza_persone() -> Regola:
    """Il database di prova della CI non contiene dati personali.

    Il danno: quel file sta nel repo, quindi e' pubblico quanto il codice. Ci
    finirebbero email, hash bcrypt, sessioni e conversazioni - una violazione
    di dati che si autopubblica a ogni clone. Il dump e' stato ripulito una
    volta a mano; questa regola e' cio' che impedisce che il prossimo, generato
    di fretta, arrivi pieno.
    """
    regola = Regola("il dump della CI non contiene persone",
                    "sta nel repo: e' pubblico quanto il codice")
    file = REPO / "docker" / "ci-db.sql.gz"
    if not file.is_file():
        regola.saltata = "docker/ci-db.sql.gz non trovato"
        return regola

    vietate = {"users", "session", "sessions", "chat_message", "chat_session",
               "user_favorites", "favorite_combos", "favorite_decks", "audit_log",
               "password_reset", "email_verification"}
    with gzip.open(file, "rt", encoding="utf-8", errors="replace") as aperto:
        for riga in aperto:
            trovata = re.match(r"COPY public\.(\w+)", riga)
            if trovata and trovata.group(1) in vietate:
                regola.problemi.append(f"il dump contiene la tabella {trovata.group(1)}")
    return regola


REGOLE = (
    env_non_tracciati,
    esempi_senza_valori_veri,
    cookie_di_sessione,
    intestazioni_di_sicurezza,
    swagger_chiusa,
    contenitori_non_root,
    immagini_di_base_fissate,
    compose_senza_segreti,
    permessi_dei_workflow,
    dump_senza_persone,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lista", action="store_true",
                        help="elenca le regole senza eseguirle")
    argomenti = parser.parse_args()

    if argomenti.lista:
        for funzione in REGOLE:
            print(f"  {funzione.__doc__.splitlines()[0]}")
        return 0

    esiti = [funzione() for funzione in REGOLE]

    print()
    print("=" * 68)
    for regola in esiti:
        segno = {"ok": "ok   ", "rotto": "ROTTO", "saltato": "-    "}[regola.stato]
        print(f"  {segno} {regola.nome}")
        for problema in regola.problemi:
            print(f"          {problema}")
        if regola.saltata:
            print(f"          {regola.saltata}")
    print("=" * 68)

    rotte = [regola for regola in esiti if regola.stato == "rotto"]
    if rotte:
        print(f"\n{len(rotte)} regola/e non rispettata/e:\n")
        for regola in rotte:
            print(f"  {regola.nome}")
            print(f"    perche' conta: {regola.danno}")
        return 1

    saltate = sum(1 for regola in esiti if regola.stato == "saltato")
    print(f"\ntutte le regole rispettate ({len(esiti) - saltate}/{len(esiti)} verificate)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
