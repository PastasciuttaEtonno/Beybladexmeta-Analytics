import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Card } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPolicy() {
    return (
        <div className="flex flex-col min-h-screen bg-background pb-20">
            <Seo
                title="Privacy Policy · Beybladexmeta Analytics"
                description="Privacy Policy and Data Processing Information"
                robots="noindex, nofollow"
            />
            <PageHeader title="Privacy Policy" action={<HeaderLogo />} />

            <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full space-y-6">
                <Card className="p-6 space-y-6">
                    <div className="space-y-4 text-sm">
                        <p>
                            This Privacy Policy describes how the Data Controller collects, uses, and protects your personal data when you use this application (the "Service").
                        </p>

                        <div>
                            <p className="font-medium">1. Data Controller (Titolare del Trattamento)</p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Contact Email: beybladexmeta@outlook.it</li>
                            </ul>
                        </div>

                        <div>
                            <p className="font-medium">2. Data We Process (Dati Trattati)</p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Account Data: Email address and unique User Identifier (ID) for authentication and account management.</li>
                                <li>Technical Data: IP Address (for security, abuse prevention, and rate limiting); Session Cookies ; minimized technical logs of requests (date, time, action) used for security and debugging.</li>
                                <li>Third-Party Public Data: Public tournament and profile data retrieved from sources like Challengermode, processed solely for statistical display and metagame analysis.</li>
                                <li>Challengermode OAuth: used to link your Challengermode account to your Beybladexmeta account, enabling access to Challengermode-specific features.</li>
                                <li>Challonge OAuth: used to link your Challonge account to your Beybladexmeta account, enabling access to Challonge-specific features.</li>
                            </ul>
                        </div>

                        <div>
                            <p className="font-medium">3. Purpose and Legal Basis (Finalità e Base Giuridica)</p>
                            <ul className="list-disc pl-5 space-y-2">
                                <li>
                                    Account Management & Authentication — Legal Basis: Contractual Necessity (Art. 6.1.b)
                                </li>
                                <li>
                                    Security & Abuse Prevention (rate limiting, reCAPTCHA) — Legal Basis: Legitimate Interest (Art. 6.1.f)
                                </li>
                                <li>
                                    Essential Communications (verification emails) — Legal Basis: Contractual Necessity (Art. 6.1.b)
                                </li>
                                <li>
                                    Statistics & Analysis (aggregate metagame data) — Legal Basis: Legitimate Interest (Art. 6.1.f)
                                </li>
                            </ul>
                        </div>

                        <div>
                            <p className="font-medium">4. Data Recipients and Third Parties (Destinatari e Terze Parti)</p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Email Provider for essential communications.</li>
                                <li>Google reCAPTCHA for anti-bot protection (may set functional cookies).</li>
                                <li>Hosting and Storage Services for infrastructure and database.</li>
                                <li>Cloudflare Web Analytics for privacy-friendly statistical analysis.</li>
                                <li>External Data Sources (Challengermode, Challonge) for public tournament and profile data.</li>
                                <li>BeybladeWiki for images.</li>
                            </ul>
                        </div>

                        <div>
                            <p className="font-medium">5. International Data Transfers (Trasferimenti Extra-UE)</p>
                            <p>
                                Some suppliers may be located outside the EU/EEA. Appropriate safeguards are applied (e.g., Standard Contractual Clauses) as required by law.
                            </p>
                        </div>

                        <div>
                            <p className="font-medium">6. Retention Period (Conservazione)</p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Account Data: retained until the user requests account deletion.</li>
                                <li>Login and Failed Attempts: retained for limited windows (e.g., 15–30 days) for security/abuse monitoring.</li>
                                <li>Aggregated Tournament Data: retained for statistical purposes while the application is active.</li>
                            </ul>
                        </div>

                        <div>
                            <p className="font-medium">7. Data Security Measures (Sicurezza)</p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Passwords stored using strong hashing.</li>
                                <li>Secure, protected session cookies with session limits.</li>
                                <li>Security headers and Content Security Policy (CSP).</li>
                                <li>Anti-bot verification via reCAPTCHA.</li>
                            </ul>
                        </div>

                        <div>
                            <p className="font-medium">8. Your Rights (Diritti dell’Interessato)</p>
                            <ul className="list-disc pl-5 space-y-1">
                                <li>Right of Access</li>
                                <li>Right to Rectification</li>
                                <li>Right to Erasure (Right to be Forgotten)</li>
                                <li>Right to Restriction of Processing</li>
                                <li>Right to Object (e.g., processing based on legitimate interest)</li>
                                <li>Right to Data Portability</li>
                            </ul>
                            <p>
                                To exercise your rights, contact: <span className="underline">beybladexmeta@outlook.it</span>.
                            </p>
                            <p className="mt-2">
                                Right to Lodge a Complaint: You may lodge a complaint with the competent supervisory authority (in Italy, the Garante per la Protezione dei Dati Personali — garanteprivacy.it).
                            </p>
                        </div>

                        <div>
                            <p className="font-medium">9. Cookies</p>
                            <p>
                                We only use technical session cookies essential for the Service. We do not use profiling or marketing cookies. We use Cloudflare Web Analytics, which is a privacy-first analytics service that does not use cookies or track personal data. Google reCAPTCHA may set functional cookies for its anti-bot protection service.
                            </p>
                        </div>

                        <div className="pt-4 border-t space-y-4">
                            <div>
                                <p className="font-medium">10. Ezoic Services</p>
                                <p>
                                    This website uses the services of Ezoic Inc. (“Ezoic”), including to manage third-party interest-based advertising. Ezoic may employ a variety of technologies on this website, including tools to serve content, display advertisements and enable advertising to visitors of this website, which may utilize first and third-party cookies.
                                </p>
                                <p className="mt-2">
                                    A cookie is a small text file sent to your device by a web server that enables the website to remember information about your browsing activity. First-party cookies are created by the site you are visiting, while third-party cookies are set by domains other than the one you're visiting. Ezoic and our partners may place third-party cookies, tags, beacons, pixels, and similar technologies to monitor interactions with advertisements and optimize ad targeting. Please note that disabling cookies may limit access to certain content and features on the website, and rejecting cookies does not eliminate advertisements but will result in non-personalized advertising. You can find more information about cookies and how to manage them <a href="https://allaboutcookies.org/" target="_blank" rel="noopener noreferrer" className="underline text-primary">here</a>.
                                </p>
                                <p className="mt-2">
                                    The following information may be collected, used, and stored in a cookie when serving personalized ads:
                                </p>
                                <ul className="list-disc pl-5 mt-1 space-y-1">
                                    <li>IP address</li>
                                    <li>Operating system type and version</li>
                                    <li>Device type</li>
                                    <li>Language preferences</li>
                                    <li>Web browser type</li>
                                    <li>Email (in a hashed or encrypted form)</li>
                                </ul>
                                <p className="mt-2">
                                    Ezoic and its partners may use this data in combination with information that has been independently collected to deliver targeted advertisements across various platforms and websites. Ezoic’s partners may also gather additional data, such as unique IDs, advertising IDs, geolocation data, usage data, device information, traffic data, referral sources, and interactions between users and websites or advertisements, to create audience segments for targeted advertising across different devices, browsers, and apps. You can find more information about interest-based advertising and how to manage them <a href="https://youradchoices.com/" target="_blank" rel="noopener noreferrer" className="underline text-primary">here</a>.
                                </p>
                                <p className="mt-2">
                                    You can view Ezoic’s privacy policy <a href="https://ezoic.com/privacy/" target="_blank" rel="noopener noreferrer" className="underline text-primary">here</a>, or for additional information about Ezoic’s advertising and other partners, you can view Ezoic’s advertising partners <a href="https://www.ezoic.com/privacy-policy/advertising-partners/" target="_blank" rel="noopener noreferrer" className="underline text-primary">here</a>.
                                </p>
                            </div>
                            <span id="ezoic-privacy-policy-embed"></span>
                        </div>
                    </div>
                </Card>
                <div className="flex justify-center">
                    <Link href="/profile">
                        <a className="no-underline">
                            <Button variant="outline" className="gap-2">
                                <ArrowLeft className="w-4 h-4" />
                                Back to Profile
                            </Button>
                        </a>
                    </Link>
                </div>
            </main>
        </div>
    );
}
