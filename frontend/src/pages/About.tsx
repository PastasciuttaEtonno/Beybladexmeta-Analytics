import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function About() {
    return (
        <div className="flex flex-col min-h-screen bg-background pb-20">
            <Seo
                title="Chi Siamo · Beybladexmeta Analytics"
                description="Scopri di più su Beybladexmeta Analytics, il portale dedicato alle statistiche e all'analisi del metagame di Beyblade X."
            />
            <PageHeader title="Chi Siamo" action={<HeaderLogo />} />

            <main className="flex-1 px-4 py-4 max-w-3xl mx-auto w-full space-y-6">
                <div className="flex justify-start">
                    <Link href="/profile" asChild>
                        <a className="no-underline">
                            <Button variant="outline" className="gap-2">
                                <ArrowLeft className="w-4 h-4" />
                                Torna al Profilo
                            </Button>
                        </a>
                    </Link>
                </div>

                <div className="space-y-6 text-foreground leading-relaxed">
                    <section className="space-y-3">
                        <h2 className="text-2xl font-bold tracking-tight">Il Progetto</h2>
                        <p className="text-muted-foreground">
                            Beybladexmeta Analytics è un progetto nato dalla passione per il metagame di Beyblade X.
                            Il nostro obiettivo è fornire ai giocatori strumenti avanzati per analizzare le performance delle diverse combo,
                            monitorare i trend dei tornei e registrare i propri risultati.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-2xl font-bold tracking-tight">Cosa Offriamo</h2>
                        <p className="text-muted-foreground">
                            Attraverso la raccolta automatizzata e manuale dei dati provenienti da piattaforme come Challengermode e Challonge,
                            elaboriamo classifiche dettagliate basate su punteggi proporzionali alla partecipazione e ai risultati ottenuti nei tornei.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li><strong>Top Combos:</strong> Classifiche sempre aggiornate delle combinazioni più vincenti.</li>
                            <li><strong>Analisi Trend:</strong> Monitoraggio dell'evoluzione del meta nel tempo.</li>
                            <li><strong>Leaderboard Giocatori:</strong> Un sistema di ranking globale per confrontarsi con i migliori.</li>
                            <li><strong>Preferiti:</strong> Salva le combo che ti piacciono di più.</li>
                            <li><strong>Profilo:</strong> Autenticati per vedere i tornei a cui hai partecipato.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-2xl font-bold tracking-tight">Dati e funzionamento</h2>
                        <p className="text-muted-foreground">
                            I dati sono raccolti dai tornei realizzati nella community di <a href="https://www.ibna.it/" target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline underline-offset-4 hover:text-primary/80 transition-colors">IBNA</a> in particolare da Challengermode e Challonge.
                            Gli utenti autenticati hanno la possibilità di registrare le combo che hanno utilizzato per ottenere il podio in un torneo.
                            In questo modo si contribuisce all'aggiornamento delle classifiche e all'analisi del metagame in italia.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-2xl font-bold tracking-tight">Sviluppo</h2>
                        <p className="text-muted-foreground">
                            L'applicazione è attualmente in una fase di sviluppo attivo. Lavoriamo costantemente per aggiungere nuove funzionalità,
                            migliorare l'interfaccia utente e garantire la massima precisione dei dati statistici.
                        </p>
                    </section>
                </div>
            </main>
        </div>
    );
}
