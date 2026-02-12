import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";

export default function PrivacyPolicy() {
    //     useEffect(() => {
    //         // Check if we're in development (not production domain)
    //         const isDevelopment = !window.location.hostname.includes('beybladexmeta.com');

    //         console.log('[Ezoic CMP] Component mounted, initializing...');
    //         console.log('[Ezoic CMP] Hostname:', window.location.hostname);
    //         console.log('[Ezoic CMP] Is development:', isDevelopment);

    //         // Wait for DOM to be ready before accessing the element
    //         setTimeout(() => {
    //             // Check if target element exists
    //             const targetElement = document.getElementById('ezoic-privacy-policy-embed');
    //             console.log('[Ezoic CMP] Target element found:', targetElement);

    //             if (isDevelopment && targetElement) {
    //                 // Show development message for localhost
    //                 targetElement.innerHTML = `
    //                 <div style="padding: 1rem; border: 2px dashed #666; border-radius: 8px; background: #f5f5f5; color: #333;">
    //                     <p style="margin: 0; font-weight: 600;">📋 Development Mode</p>
    //                     <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem;">
    //                         Ezoic CMP content will display in production at <strong>beybladexmeta.com</strong>
    //                     </p>
    //                 </div>
    //             `;
    //                 console.log('[Ezoic CMP] Localhost detected - showing development placeholder');
    //                 return; // Don't load the script on localhost
    //             }

    //             // Load Ezoic CMP script for production
    //             const script = document.createElement('script');
    //             script.src = 'https://g.ezoic.net/privacy/beybladexmeta.com/cmp.js';
    //             script.async = true;

    //             script.onload = () => {
    //                 console.log('[Ezoic CMP] Script loaded successfully');
    //                 console.log('[Ezoic CMP] Target element content:', targetElement?.innerHTML);

    //                 // Check again after a delay to see if content was injected
    //                 setTimeout(() => {
    //                     const updatedElement = document.getElementById('ezoic-privacy-policy-embed');
    //                     console.log('[Ezoic CMP] Element content after 2s:', updatedElement?.innerHTML);
    //                     console.log('[Ezoic CMP] Element has children:', updatedElement?.children.length);
    //                 }, 2000);
    //             };

    //             script.onerror = (error) => {
    //                 console.error('[Ezoic CMP] Script failed to load:', error);
    //                 // Show fallback message on error
    //                 if (targetElement) {
    //                     targetElement.innerHTML = `
    //                     <div style="padding: 1rem; border: 2px solid #f44336; border-radius: 8px; background: #ffebee; color: #c62828;">
    //                         <p style="margin: 0; font-weight: 600;">Unable to load Ezoic privacy policy</p>
    //                         <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem;">
    //                             Please contact us at <a href="mailto:beybladexmeta@outlook.it" style="color: #1976d2;">beybladexmeta@outlook.it</a> for privacy information.
    //                         </p>
    //                     </div>
    //                 `;
    //                 }
    //             };

    //             console.log('[Ezoic CMP] Appending script to body...');
    //             document.body.appendChild(script);
    //         }, 1000); // Wait 100ms to ensure DOM is fully rendered
    //     }, []);

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

                </div>
                <span id="ezoic-privacy-policy-embed"></span>
            </main>
        </div>
    );
}
