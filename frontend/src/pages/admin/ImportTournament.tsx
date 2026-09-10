
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export default function ImportTournament() {
    const { user } = useAuth();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    console.log("DEBUG: Admin Page - Current User:", user);
    const [jsonInput, setJsonInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Simple protection: only admins should see this content
    if (!user || !user.isAdmin) {
        return (
            <div className="container py-8">
                <h1 className="text-2xl font-bold text-destructive">Accesso riservato</h1>
                <p>You must be an administrator to view this page.</p>
            </div>
        );
    }

    const handleImport = async () => {
        if (!jsonInput.trim()) {
            toast({
                title: "Contenuto mancante",
                description: "Incolla il JSON del torneo prima di importare.",
                variant: "destructive",
            });
            return;
        }

        let parsedData;
        try {
            parsedData = JSON.parse(jsonInput);
        } catch (e) {
            toast({
                title: "JSON non valido",
                description: "Il testo incollato non e' JSON valido. Controlla che sia completo.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            const res = await apiRequest("POST", "/api/admin/import-tournament", parsedData);

            // Debug: check if response is ok and is json
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                const text = await res.text();
                console.error("DEBUG: Received non-JSON response:", text.substring(0, 500));
                throw new Error(`Server returned non-JSON response: ${res.status} ${res.statusText}. Check console for details.`);
            }

            const data = await res.json();

            if (data.success) {
                toast({
                    title: "Torneo importato",
                    description: `Tournament imported with ID: ${data.id}`,
                });
                queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
                setJsonInput(""); // Clear input on success
            } else {
                throw new Error(data.error || "Unknown error");
            }
        } catch (error) {
            toast({
                title: "Importazione non riuscita",
                description: (error as Error).message,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleForceRefresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
        toast({
            title: "Elenco aggiornato",
            description: "L'elenco dei tornei e' stato ricaricato.",
        });
    };

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 pb-20">
            <PageHeader
                title="Importazione tornei"
                description="Manually import normalized tournament JSON files."
                action={
                    <Button variant="outline" size="sm" onClick={handleForceRefresh}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Forza aggiornamento
                    </Button>
                }
            />

            <Card>
                <CardHeader>
                    <CardTitle>Importa un torneo da JSON</CardTitle>
                    <CardDescription>
                        Paste the raw JSON content of a normalized tournament file here.
                        It must contain fields like `id`, `tournament_name`, `start_date`, etc.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Textarea
                        placeholder='{ "id": "...", "tournament_name": "...", ... }'
                        className="min-h-[300px] font-mono text-xs"
                        value={jsonInput}
                        onChange={(e) => setJsonInput(e.target.value)}
                    />
                    <Button
                        onClick={handleImport}
                        disabled={isLoading}
                        className="w-full sm:w-auto"
                    >
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Import Tournament
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
