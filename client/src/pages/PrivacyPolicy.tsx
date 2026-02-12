import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";

export default function PrivacyPolicy() {
    useEffect(() => {
        try {
            // @ts-ignore
            const ez = window.ezstandalone;
            if (ez && ez.cmd) {
                ez.cmd.push(function () {
                    if (typeof ez.showPrivacyPolicy === 'function') {
                        ez.showPrivacyPolicy();
                    }
                    if (typeof ez.refresh === 'function') {
                        ez.refresh();
                    }
                });
            }
        } catch (e) {
            console.error("Ezoic initialization error:", e);
        }
    }, []);

    return (
        <div className="flex flex-col min-h-screen bg-background pb-20">
            <Seo
                title="Privacy Policy · Beybladexmeta Analytics"
                description="Informativa sul trattamento dei dati personali e sulla privacy per Beybladexmeta Analytics."
                robots="noindex, nofollow"
            />
            <PageHeader title="Privacy Policy" action={<HeaderLogo />} />

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
                        Questa Privacy Policy descrive come il Titolare raccoglie, utilizza e protegge i tuoi dati personali quando utilizzi questa applicazione (il "Servizio").
                    </p>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">1. Titolare del Trattamento</h2>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li>Email di contatto: beybladexmeta@outlook.it</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">2. Dati Trattati</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li><strong>Dati dell'Account:</strong> Indirizzo email e identificativo unico (ID) per l'autenticazione e la gestione dell'account.</li>
                            <li><strong>Dati Tecnici:</strong> Indirizzo IP (per sicurezza e prevenzione abusi); Cookie di sessione; log tecnici minimizzati (data, ora, azione) per debug.</li>
                            <li><strong>Dati Pubblici di Terze Parti:</strong> Dati di tornei e profili pubblici recuperati da fonti come Challengermode e Challonge, trattati esclusivamente per finalità statistiche.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">3. Finalità e Base Giuridica</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li><strong>Gestione Account e Autenticazione</strong> — Necessità Contrattuale (Art. 6.1.b GDPR)</li>
                            <li><strong>Sicurezza e Prevenzione Abusi</strong> (reCAPTCHA, rate limiting) — Legittimo Interesse (Art. 6.1.f GDPR)</li>
                            <li><strong>Comunicazioni Essenziali</strong> (email di verifica) — Necessità Contrattuale (Art. 6.1.b GDPR)</li>
                            <li><strong>Statistiche e Analisi</strong> (dati aggregati sul metagame) — Legittimo Interesse (Art. 6.1.f GDPR)</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">4. Destinatari dei Dati</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li>Fornitore di servizi email per comunicazioni essenziali.</li>
                            <li>Google reCAPTCHA per protezione anti-bot.</li>
                            <li>Servizi di Hosting e Cloud per l'infrastruttura e il database.</li>
                            <li>Cloudflare Web Analytics per analisi statistiche anonime.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">5. Trasferimento Dati Extra-UE</h2>
                        <p className="text-muted-foreground">
                            Alcuni fornitori potrebbero avere sede fuori dall'UE/SEE. In tali casi, vengono applicate le salvaguardie adeguate (es. Clausole Contrattuali Standard) come richiesto dalla legge.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">6. Periodo di Conservazione</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li><strong>Dati Account:</strong> conservati fino alla richiesta di cancellazione da parte dell'utente.</li>
                            <li><strong>Log di sicurezza:</strong> conservati per finestre temporali limitate (es. 30 giorni) per monitoraggio abusi.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">7. Diritti dell'Interessato</h2>
                        <p className="text-muted-foreground">
                            Puoi esercitare in ogni momento i diritti previsti dal GDPR (accesso, rettifica, cancellazione, limitazione, opposizione, portabilità) scrivendo a: <span className="underline text-foreground">beybladexmeta@outlook.it</span>.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">8. Cookie e Terze Parti</h2>
                        <p className="text-muted-foreground">
                            Utilizziamo solo cookie tecnici necessari al funzionamento del sito. Non utilizziamo cookie di profilazione o marketing proprietari. Servizi di terze parti come Ezoic possono gestire le proprie impostazioni cookie attraverso il banner di consenso fornito.
                        </p>
                    </section>

                    <div className="pt-8 border-t">
                        <span id="ezoic-privacy-policy-embed"></span>
                    </div>
                </div>
            </main>
        </div>
    );
}
