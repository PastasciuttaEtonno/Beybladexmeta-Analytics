---
description: questo documento definisce le regole di business, l'architettura del database e i metodi di calcolo dei punteggi per il progetto Antigravity. L'AI deve consultare questo file prima di ogni modifica.
---

## Antigravity Workflow

Questo documento definisce le regole di business, l'architettura del database e i metodi di calcolo dei punteggi per il progetto Antigravity. L'AI deve consultare questo file prima di ogni modifica.

## 1.  SISTEMI DI ASSEGNAZIONE PUNTEGGI (SCORING)

Esistono **TRE** metodi distinti di assegnazione punti nel sistema. Non confonderli.

### A. Player Scoring: CHALLONGE (Metodo "Tiering Dinamico")

Si applica **solo** ai giocatori importati dai JSON di Challonge.
Il punteggio viene calcolato al volo nella Materialized View (`player_platform_stats`) basandosi su due variabili: **Numero Partecipanti** e **Rank Finale**.

**Tabella di Riferimento (Tiering):**

| Partecipanti | 1° Posto | 2° Posto | 3° Posto | 4° Posto | 5°-8° | 9°-12° | 13°-16° | 17°-24° | 25°-32° | 33-48 | 49+ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **6-7** | 100 | 70 | 50 | 30 | 10 | - | - | - | - | - | - |
| **8-12** | 150 | 80 | 60 | 40 | 20 | 10 | - | - | - | - | - |
| **13-16** | 200 | 120 | 80 | 60 | 30 | 15 | 10 | - | - | - | - |
| **17-24** | 250 | 160 | 100 | 80 | 60 | 30 | 15 | 10 | - | - | - |
| **25-32** | 300 | 200 | 120 | 90 | 70 | 45 | 30 | 15 | 10 | - | - |
| **33-48** | 350 | 240 | 140 | 110 | 80 | 55 | 40 | 30 | 15 | 10 | - |
| **49-64** | 400 | 280 | 160 | 120 | 90 | 65 | 50 | 40 | 30 | 15 | 10 |

---

### B. Player Scoring: CHALLENGERMODE (Metodo "Diretto")

Si applica ai giocatori provenienti da Challengermode.

* **Logica:** I punti NON vengono ricalcolati con la tabella sopra.
* **Fonte:** I punti sono presi direttamente dalla colonna `punti_guadagnati` nella tabella `cm_match_results`.
* **Motivo:** CM potrebbe avere logiche interne o punteggi già assegnati ufficialmente che noi importiamo fedelmente.

---

### C. Combo Scoring: META ANALYSIS (Metodo "Component Weight")

Si applica ai **Componenti** (Blade, Ratchet, Bit) per determinare il "Meta" (es. DranSword è Tier S).
Questo punteggio è indipendente dai punti giocatore.

* **Obiettivo:** Popolare le tabelle `blade_stats`, `ratchet_stats`, ecc. e la view `top_component_snapshot`.
* **Logica di Assegnazione (Standard):**
* Ogni volta che una combo finisce in Top 3 (o Top 4), i suoi componenti ricevono un "peso".
* **1° Posto:** Assegna X punti al componente (es. 5 pt).
* **2° Posto:** Assegna Y punti al componente (es. 3 pt).
* **3° Posto:** Assegna Z punti al componente (es. 1 pt).


* **Aggregazione:** La somma di questi punti determina il `punteggio_totale` di un componente nella `top_component_snapshot`.

---

## 2. ARCHITETTURA DATABASE

### Livello 0: Raw Data (Sorgenti)

1. **`cm_match_results`**: Risultati importati da CM (Punti fissi).
2. **`challonge_match_results`**: JSON grezzi da Challonge.
3. **`user_aliases`**: Tabella ponte per unificare identità (Alias -> User ID).
4. **`external_player_combos`**: Dati manuali per le combo.

### Livello 1: Engine (Elaborazione)

1. **`player_platform_stats` (Materialized View):**
* Unifica CM e Challonge.
* Applica il **Metodo A (Tiering)** solo ai dati Challonge.
* Applica il **Metodo B (Diretto)** ai dati CM.
* Risolve gli Alias.


2. **`unified_meta_view` (Standard View):**
* Unifica le combo di CM e Challonge.
* Filtra per Rank (es. `<= 4`).
* Serve da base per calcolare le statistiche dei componenti (**Metodo C**).



### Livello 2: Presentation (Frontend)

1. **`player_leaderboard` (View):** Aggrega i punti giocatore totali.
2. **`top_component_snapshot` (Materialized View):** Aggrega i punti componenti (**Metodo C**) per la Home Page. **Nota:** Deve includere la colonna `season`.

---

## 3. PROTOCOLLO DI SVILUPPO

### Quando modifichi la Classifica Giocatori:

1. Se devi cambiare i punti dei tornei Challonge, modifica la SQL Query dentro `player_platform_stats` (CASE WHEN...).
2. Dopo ogni import dati, esegui: `REFRESH MATERIALIZED VIEW CONCURRENTLY player_platform_stats`.

### Quando modifichi il Meta / Combo:

1. Se i dati Home vs Dialog non coincidono, controlla la colonna `season`.
* Home (`top_component_snapshot`) = Aggregato o filtrato male?
* Dialog (`blade_stats`) = Granulare per stagione.


2. La `unified_meta_view` è la fonte di verità per lo storico combo. Se cambi il filtro `WHERE rank <= 4`, cambierà tutto il dataset analizzato.

### Quando gestisci gli Alias:

1. L'alias collega un nome testo (Challonge) a un ID Utente (CM).
2. L'aggiornamento è effettivo solo dopo il **REFRESH** della Materialized View `player_platform_stats`.

### Quando devi eseguire script o query di aggiornamento:

1. Mandami il codice a me da eseguire. E non eseguire tu.