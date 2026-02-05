
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export default function ImportTournament() {
    const { user } = useAuth();
    const { toast } = useToast();
    console.log("DEBUG: Admin Page - Current User:", user);
    const [jsonInput, setJsonInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // Simple protection: only admins should see this content
    if (!user || !user.isAdmin) {
        return (
            <div className="container py-8">
                <h1 className="text-2xl font-bold text-red-500">Access Denied</h1>
                <p>You must be an administrator to view this page.</p>
            </div>
        );
    }

    const handleImport = async () => {
        if (!jsonInput.trim()) {
            toast({
                title: "Error",
                description: "Please paste the JSON content first.",
                variant: "destructive",
            });
            return;
        }

        let parsedData;
        try {
            parsedData = JSON.parse(jsonInput);
        } catch (e) {
            toast({
                title: "Invalid JSON",
                description: "The text you pasted is not valid JSON.",
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
                    title: "Import Successful",
                    description: `Tournament imported with ID: ${data.id}`,
                });
                setJsonInput(""); // Clear input on success
            } else {
                throw new Error(data.error || "Unknown error");
            }
        } catch (error) {
            toast({
                title: "Import Failed",
                description: (error as Error).message,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4 pb-20">
            <PageHeader
                title="Admin Import"
                description="Manually import normalized tournament JSON files."
            />

            <Card>
                <CardHeader>
                    <CardTitle>Import Tournament JSON</CardTitle>
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
