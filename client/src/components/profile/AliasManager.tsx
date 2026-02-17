import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, Trash2, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { User } from "@shared/schema";

interface AliasManagerProps {
    user: any;
}

export function AliasManager({ user }: AliasManagerProps) {
    const { toast } = useToast();
    const [newAlias, setNewAlias] = useState("");

    const { data: aliases, refetch: refetchAliases } = useQuery({
        queryKey: ['/api/user/aliases'],
        queryFn: async () => {
            const res = await apiRequest("GET", "/api/user/aliases");
            return await res.json();
        },
        enabled: !!user,
    });

    const createAliasMutation = useMutation({
        mutationFn: async (alias: string) => {
            await apiRequest("POST", "/api/user/aliases", { alias });
        },
        onSuccess: () => {
            toast({ title: "Success", description: "Alias requested" });
            setNewAlias("");
            refetchAliases();
        },
        onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to create alias", variant: "destructive" });
        }
    });

    const deleteAliasMutation = useMutation({
        mutationFn: async (id: number) => {
            await apiRequest("DELETE", `/api/user/aliases/${id}`);
        },
        onSuccess: () => {
            toast({ title: "Success", description: "Alias removed" });
            refetchAliases();
        },
        onError: (err: any) => {
            toast({ title: "Error", description: err.message || "Failed to delete alias", variant: "destructive" });
        }
    });

    if (!user?.challongeId) {
        return (
            <div className="p-3 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded-md text-sm border border-orange-500/20">
                <p className="font-medium mb-2">Autenticazione Challonge richiesta</p>
                <p className="text-xs mb-2">Per richiedere alias devi prima collegare il tuo account Challonge.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Aggiungi Nickname</Label>
                <div className="flex gap-2">
                    <Input
                        value={newAlias}
                        onChange={(e) => setNewAlias(e.target.value)}
                        placeholder="Vecchio nickname usato nei tornei..."
                    />
                    <Button
                        onClick={() => createAliasMutation.mutate(newAlias)}
                        disabled={!newAlias.trim() || createAliasMutation.isPending}
                    >
                        {createAliasMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "Richiedi"}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                    Dichiara i nickname che hai usato in passato su Challonge per abbinare i risultati ai tornei.
                </p>
            </div>

            <div className="space-y-2">
                {aliases?.map((alias: any) => (
                    <div key={alias.id} className="flex items-center justify-between p-2 border rounded-md">
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{alias.alias}</span>
                            {alias.isVerified ? (
                                <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800">Verificato</span>
                            ) : (
                                <span className="text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-1.5 py-0.5 rounded border border-yellow-200 dark:border-yellow-800">In Attesa</span>
                            )}
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteAliasMutation.mutate(alias.id)} disabled={deleteAliasMutation.isPending}>
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                    </div>
                ))}
                {!aliases?.length && (
                    <p className="text-sm text-muted-foreground text-center py-2">Nessun alias registrato.</p>
                )}
            </div>
        </div>
    );
}
