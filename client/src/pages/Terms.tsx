import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
    return (
        <div className="flex flex-col min-h-screen bg-background pb-20">
            <Seo
                title="Termini e Condizioni · Beybladexmeta Analytics"
                description="Termini e Condizioni di utilizzo del servizio Beybladexmeta Analytics."
                robots="noindex, nofollow"
            />
            <PageHeader title="Termini e Condizioni" action={<HeaderLogo />} />

            <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full space-y-6">
                <div className="flex justify-start">
                    <Link href="/profile">
                        <a className="no-underline">
                            <Button variant="outline" className="gap-2">
                                <ArrowLeft className="w-4 h-4" />
                                Torna al Profilo
                            </Button>
                        </a>
                    </Link>
                </div>

                <div className="space-y-8 text-foreground leading-relaxed">
                    <p>
                        Questi Termini e Condizioni disciplinano l'utilizzo dell'applicazione Beybladexmeta Analytics (il "Servizio") da parte degli utenti.
                    </p>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">1. Accettazione dei Termini</h2>
                        <p className="text-muted-foreground">
                            Accedendo o utilizzando il Servizio, l'utente accetta di essere vincolato dai presenti Termini. Se non si accettano tali termini, si è invitati a non utilizzare il Servizio.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">2. Utilizzo del Servizio</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li>L'utente si impegna a non abusare del Servizio né a tentare di eludere le misure di sicurezza o i limiti di frequenza (rate limiting).</li>
                            <li>Tutti i contenuti sono forniti a scopo informativo; non garantiamo l'accuratezza assoluta dei dati statistici raccolti da terze parti.</li>
                            <li>È vietato l'uso di bot o sistemi automatizzati per estrarre dati dal Servizio senza autorizzazione scritta.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">3. Account Utente</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li>L'utente è responsabile della protezione delle proprie credenziali di accesso.</li>
                            <li>Ci riserviamo il diritto di sospendere o chiudere gli account che violano questi Termini o le leggi vigenti.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">4. Privacy</h2>
                        <p className="text-muted-foreground">
                            Il trattamento dei dati personali avviene secondo quanto descritto nella nostra <Link href="/privacy-policy" className="text-primary underline">Privacy Policy</Link>.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">5. Proprietà Intellettuale</h2>
                        <p className="text-muted-foreground">
                            I marchi registrati, i loghi e i contenuti di terze parti (come quelli relativi a Beyblade X) appartengono ai rispettivi proprietari. Beybladexmeta Analytics non vanta alcun diritto su tali asset di terze parti.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">6. Limitazione di Responsabilità</h2>
                        <p className="text-muted-foreground">
                            Il Servizio è fornito "visto e piaciuto" (as is). Non siamo responsabili per danni indiretti o consequenziali derivanti dall'uso o dall'impossibilità di usare il Servizio.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">7. Modifiche ai Termini</h2>
                        <p className="text-muted-foreground">
                            Potremmo aggiornare questi Termini periodicamente. L'uso continuato del Servizio dopo le modifiche costituisce l'accettazione delle stesse.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">8. Contatti</h2>
                        <p className="text-muted-foreground">
                            Per domande relative a questi Termini, contattare: <a href="mailto:beybladexmeta@outlook.it" className="text-primary underline">beybladexmeta@outlook.it</a>.
                        </p>
                    </section>
                </div>
            </main>
        </div>
    );
}
