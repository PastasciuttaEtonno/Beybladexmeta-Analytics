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
            if (window.ezstandalone) {
                // @ts-ignore
                ezstandalone.cmd.push(function () {
                    // @ts-ignore
                    if (typeof ezstandalone.refresh === 'function') {
                        // @ts-ignore
                        ezstandalone.refresh();
                    }
                });
            }
        } catch (e) {
            console.error("Ezoic refresh error:", e);
        }
    }, []);

    return (
        <div className="flex flex-col min-h-screen bg-background pb-20">
            <Seo
                title="Privacy Policy · Beybladexmeta Analytics"
                description="Privacy Policy and Data Processing Information"
                robots="noindex, nofollow"
            />
            <PageHeader title="Privacy Policy" action={<HeaderLogo />} />

            <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full space-y-6">
                <div className="flex justify-start">
                    <Link href="/profile">
                        <a className="no-underline">
                            <Button variant="outline" className="gap-2">
                                <ArrowLeft className="w-4 h-4" />
                                Back to Profile
                            </Button>
                        </a>
                    </Link>
                </div>

                <div className="space-y-8 text-foreground">
                    <p>
                        This Privacy Policy describes how the Data Controller collects, uses, and protects your personal data when you use this application (the "Service").
                    </p>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">1. Data Controller (Titolare del Trattamento)</h2>
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li>Contact Email: beybladexmeta@outlook.it</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">2. Data We Process (Dati Trattati)</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li><strong>Account Data:</strong> Email address and unique User Identifier (ID) for authentication and account management.</li>
                            <li><strong>Technical Data:</strong> IP Address (for security, abuse prevention, and rate limiting); Session Cookies; minimized technical logs of requests (date, time, action) used for security and debugging.</li>
                            <li><strong>Third-Party Public Data:</strong> Public tournament and profile data retrieved from sources like Challengermode, processed solely for statistical display and metagame analysis.</li>
                            <li><strong>Challengermode OAuth:</strong> used to link your Challengermode account to your Beybladexmeta account, enabling access to Challengermode-specific features.</li>
                            <li><strong>Challonge OAuth:</strong> used to link your Challonge account to your Beybladexmeta account, enabling access to Challonge-specific features.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">3. Purpose and Legal Basis (Finalità e Base Giuridica)</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li>
                                <strong>Account Management & Authentication</strong> — Legal Basis: Contractual Necessity (Art. 6.1.b)
                            </li>
                            <li>
                                <strong>Security & Abuse Prevention</strong> (rate limiting, reCAPTCHA) — Legal Basis: Legitimate Interest (Art. 6.1.f)
                            </li>
                            <li>
                                <strong>Essential Communications</strong> (verification emails) — Legal Basis: Contractual Necessity (Art. 6.1.b)
                            </li>
                            <li>
                                <strong>Statistics & Analysis</strong> (aggregate metagame data) — Legal Basis: Legitimate Interest (Art. 6.1.f)
                            </li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">4. Data Recipients and Third Parties (Destinatari e Terze Parti)</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li>Email Provider for essential communications.</li>
                            <li>Google reCAPTCHA for anti-bot protection (may set functional cookies).</li>
                            <li>Hosting and Storage Services for infrastructure and database.</li>
                            <li>Cloudflare Web Analytics for privacy-friendly statistical analysis.</li>
                            <li>External Data Sources (Challengermode, Challonge) for public tournament and profile data.</li>
                            <li>BeybladeWiki for images.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">5. International Data Transfers (Trasferimenti Extra-UE)</h2>
                        <p className="text-muted-foreground">
                            Some suppliers may be located outside the EU/EEA. Appropriate safeguards are applied (e.g., Standard Contractual Clauses) as required by law.
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">6. Retention Period (Conservazione)</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li><strong>Account Data:</strong> retained until the user requests account deletion.</li>
                            <li><strong>Login and Failed Attempts:</strong> retained for limited windows (e.g., 15–30 days) for security/abuse monitoring.</li>
                            <li><strong>Aggregated Tournament Data:</strong> retained for statistical purposes while the application is active.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">7. Data Security Measures (Sicurezza)</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li>Passwords stored using strong hashing.</li>
                            <li>Secure, protected session cookies with session limits.</li>
                            <li>Security headers and Content Security Policy (CSP).</li>
                            <li>Anti-bot verification via reCAPTCHA.</li>
                        </ul>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">8. Your Rights (Diritti dell’Interessato)</h2>
                        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
                            <li>Right of Access</li>
                            <li>Right to Rectification</li>
                            <li>Right to Erasure (Right to be Forgotten)</li>
                            <li>Right to Restriction of Processing</li>
                            <li>Right to Object (e.g., processing based on legitimate interest)</li>
                            <li>Right to Data Portability</li>
                        </ul>
                        <p className="text-muted-foreground mt-2">
                            To exercise your rights, contact: <span className="underline text-foreground">beybladexmeta@outlook.it</span>.
                        </p>
                        <p className="text-muted-foreground mt-2">
                            Right to Lodge a Complaint: You may lodge a complaint with the competent supervisory authority (in Italy, the Garante per la Protezione dei Dati Personali — garanteprivacy.it).
                        </p>
                    </section>

                    <section className="space-y-3">
                        <h2 className="text-xl font-semibold tracking-tight">9. Cookies</h2>
                        <p className="text-muted-foreground">
                            We only use technical session cookies essential for the Service. We do not use profiling or marketing cookies. We use Cloudflare Web Analytics, which is a privacy-first analytics service that does not use cookies or track personal data. Google reCAPTCHA may set functional cookies for its anti-bot protection service.
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
