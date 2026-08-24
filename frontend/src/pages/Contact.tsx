import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowLeft, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function Contact() {
    return (
        <div className="flex flex-col min-h-screen bg-background pb-20">
            <Seo
                title="Centro Supporto · Beybladexmeta Analytics"
                description="Hai bisogno di aiuto o vuoi segnalare un problema? Contatta il supporto di Beybladexmeta Analytics."
            />
            <PageHeader title="Centro Supporto" action={<HeaderLogo />} />

            <main className="flex-1 px-4 py-8 max-w-xl mx-auto w-full flex flex-col justify-center space-y-12">
                <div className="text-center space-y-2">
                    <h1 className="text-3xl font-bold tracking-tight">Contattaci</h1>
                    <p className="text-muted-foreground">
                        Hai domande o suggerimenti? Problemi tecnici? Scrivici pure.
                    </p>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Mail className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-muted-foreground">Email</p>
                            <a href="mailto:beybladexmeta@outlook.it" className="text-base font-semibold hover:underline block truncate">
                                beybladexmeta@outlook.it
                            </a>
                        </div>
                    </div>
                </div>

                <div className="flex justify-center pt-8 border-t">
                    <Link href="/profile" asChild>
                        <a className="no-underline">
                            <Button variant="outline" className="gap-2">
                                <ArrowLeft className="w-4 h-4" />
                                Torna al Profilo
                            </Button>
                        </a>
                    </Link>
                </div>
            </main>
        </div>
    );
}
