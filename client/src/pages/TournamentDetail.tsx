import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Loader2, User, ChevronsUpDown, Pencil } from "lucide-react";

type ComboForm = {
  blade: string;
  assistBlade: string;
  ratchet: string;
  bit: string;
  lockChip: string;
};

const PUBLIC_MINIO_URL = (import.meta.env.VITE_PUBLIC_MINIO_URL || "").replace(/\/$/, "");

function ComponentImage({ folder, name }: { folder: string; name: string }) {
  const [attemptIndex, setAttemptIndex] = useState(0);
  // Reset fallback attempts whenever the image name or folder changes
  useEffect(() => {
    setAttemptIndex(0);
  }, [name, folder]);
  const getImageVariations = (n: string, format: "png" | "webp") => {
    const variations = [
      n.toLowerCase().replace(/\s+/g, ""),
      n.toLowerCase().replace(/\s+/g, "-"),
      n.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase().replace(/\s+/g, "-"),
    ];
    return variations.map((v) => `${PUBLIC_MINIO_URL}/beyblades/${folder}/${v}.${format}`);
  };
  // Try PNG first; if not found, fall back to WEBP
  const allAttempts = [...getImageVariations(name, "png"), ...getImageVariations(name, "webp")];
  const handleError = () => {
    if (attemptIndex < allAttempts.length - 1) setAttemptIndex(attemptIndex + 1);
  };
  return (
    <div className="aspect-square bg-muted rounded-md overflow-hidden flex items-center justify-center">
      {attemptIndex >= allAttempts.length ? (
        <div className="text-center p-4">
          <p className="text-sm text-muted-foreground">Image not available</p>
        </div>
      ) : (
        <img
          key={attemptIndex}
          src={allAttempts[attemptIndex]}
          alt={name}
          className="w-full h-full object-contain"
          onError={handleError}
        />
      )}
    </div>
  );
}

// Simple SVG placeholder used when no combos are assigned
function SvgPlaceholder() {
  return (
    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded bg-muted flex items-center justify-center">
      <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-7 sm:h-7 text-muted-foreground" aria-label="placeholder">
        <rect x="3" y="3" width="18" height="18" rx="3" ry="3" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2" />
        <path d="M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

const isSingleWordBlade = (bladeName: string): boolean => {
  if (!bladeName) return true;
  const hasMultipleCapitals = /[A-Z].*[A-Z]/.test(bladeName);
  return !hasMultipleCapitals;
};

// Format a combo title, omitting 'None' parts and keeping it concise
function formatComboTitle(combo: ComboForm): string {
  const blade = combo.blade?.trim() || '';
  const assist = combo.assistBlade?.trim() || '';
  const ratchet = combo.ratchet?.trim() || '';
  const bit = combo.bit?.trim() || '';
  const lockChip = combo.lockChip?.trim() || '';

  // Only include assist and lock chip if not 'None'
  const assistPart = assist && assist.toLowerCase() !== 'none' ? assist : '';
  const lockPart = lockChip && lockChip.toLowerCase() !== 'none' ? lockChip : '';

  const parts = [
    lockPart,
    blade + (assistPart ? `${assistPart}` : ''),
    ratchet,
    bit,
  ].filter(Boolean);

  const title = parts.join(' • ');
  return title;
}

type SearchableSelectProps = {
  id: string;
  testId?: string;
  value: string;
  onSelect: (val: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  includeNone?: boolean;
};

function SearchableSelect({ id, testId, value, onSelect, options, placeholder, disabled = false, includeNone = false }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const shownOptions = includeNone ? ["None", ...options] : options;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between" id={id} data-testid={testId} disabled={disabled}>
          {value || placeholder}
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[320px]">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Names">
              {shownOptions.map((opt) => (
                <CommandItem key={opt} value={opt} onSelect={(val) => { onSelect(val); setOpen(false); }}>
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type ExternalTournamentDetail = {
  id: string;
  name: string;
  state: string;
  contactUrl: string | null;
  stages?: Array<{ format?: string | null; lineupCount?: number | null }> | null;
  attendance?: {
    availableSlotCount?: number | null;
    confirmedLineupCount?: number | null;
    signups?: {
      userCount?: number | null;
      lineupCount?: number | null;
      lineups?: Array<{
        placement?: { displayPlacement?: string | null } | null;
        members?: Array<{
          user?: {
            username?: string | null;
            userId?: string | null;
            profilePicture?: { url?: string | null; width?: number | null; height?: number | null } | null;
          } | null;
        }> | null;
      }> | null;
    } | null;
  } | null;
};

export default function TournamentDetail() {
  const [, params] = useRoute("/tournaments/:id");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const tournamentId = params?.id || "";

  const { data: detailResp, isLoading: detailLoading } = useQuery<{ detail: ExternalTournamentDetail }>({
    queryKey: ["/api/challengermode/tournaments", tournamentId],
    queryFn: async () => {
      const resp = await fetch(`/api/challengermode/tournaments/${tournamentId}`, { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to fetch tournament detail");
      return await resp.json();
    },
    enabled: !!tournamentId,
  });

  // Admin combo editor state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; username: string } | null>(null);
  const [editCombos, setEditCombos] = useState<ComboForm[]>([
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
  ]);

  // Map of playerId -> combos, to render only for players who have combos
  const [playerCombosById, setPlayerCombosById] = useState<Record<string, ComboForm[]>>({});

  const { data: componentsData } = useQuery<{ blades: string[]; assistBlades: string[]; ratchets: string[]; bits: string[]; lockChips: string[] }>({
    queryKey: ["/api/components"],
  });

  const { data: playerCombosResp, isLoading: playerCombosLoading, refetch: refetchPlayerCombos } = useQuery<{ combos: ComboForm[] }>({
    queryKey: ["/api/tournaments", tournamentId, selectedPlayer?.id || "", "combos"],
    queryFn: async () => {
      const resp = await fetch(`/api/tournaments/${tournamentId}/players/${selectedPlayer?.id}/combos`, { credentials: "include" });
      if (!resp.ok) throw new Error("Failed to fetch player combos");
      return await resp.json();
    },
    enabled: editDialogOpen && !!tournamentId && !!selectedPlayer?.id,
  });

  useEffect(() => {
    if (playerCombosResp?.combos && playerCombosResp.combos.length > 0) {
      const current = playerCombosResp.combos;
      const filled = [0, 1, 2].map((i) => {
        const c = current[i];
        return c ? c : { blade: "", assistBlade: "None", ratchet: "", bit: "", lockChip: "None" };
      });
      setEditCombos(filled);
    } else if (editDialogOpen) {
      setEditCombos([
        { blade: "", assistBlade: "None", ratchet: "", bit: "", lockChip: "None" },
        { blade: "", assistBlade: "None", ratchet: "", bit: "", lockChip: "None" },
        { blade: "", assistBlade: "None", ratchet: "", bit: "", lockChip: "None" },
      ]);
    }
  }, [playerCombosResp, editDialogOpen]);

  // When combos are fetched for the selected player, cache them for per-player rendering
  useEffect(() => {
    if (selectedPlayer?.id && playerCombosResp?.combos && playerCombosResp.combos.length > 0) {
      setPlayerCombosById((prev) => ({ ...prev, [selectedPlayer.id]: playerCombosResp.combos }));
    }
  }, [selectedPlayer?.id, playerCombosResp]);

  // Prefetch combos for top-4 lineup members to avoid placeholders where possible
  useEffect(() => {
    const lineups = detailResp?.detail?.attendance?.signups?.lineups ?? [];
    const top = (lineups || []).slice(0, 4);
    top.forEach((l) => {
      (l.members || []).forEach(async (m) => {
        const id = m.user?.userId || null;
        if (!id) return;
        if (playerCombosById[id]) return;
        try {
          const resp = await fetch(`/api/tournaments/${tournamentId}/players/${id}/combos`, { credentials: "include" });
          if (!resp.ok) return;
          const data = await resp.json();
          if (data?.combos && data.combos.length > 0) {
            setPlayerCombosById((prev) => ({ ...prev, [id]: data.combos }));
          }
        } catch (e) {
          // ignore
        }
      });
    });
  }, [detailResp, tournamentId]);

  const updateEditCombo = (index: number, field: keyof ComboForm, value: string) => {
    setEditCombos((prev) => prev.map((c, i) => {
      if (i !== index) return c;
      const updated = { ...c, [field]: value };
      // Only single-word blades can use Assist Blades and Lock Chips
      if (field === 'blade') {
        const singleWord = isSingleWordBlade(value || '');
        if (!singleWord) {
          updated.assistBlade = 'None';
          updated.lockChip = 'None';
        }
      }
      return updated;
    }));
  };

  const saveCombosMutation = useMutation({
    mutationFn: async () => {
      const payload = { combos: editCombos };
      return apiRequest("PUT", `/api/tournaments/${tournamentId}/players/${selectedPlayer?.id}/combos`, payload);
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Player combos updated" });
      // Update local cache so UI reflects changes for the specific player
      if (selectedPlayer?.id) {
        setPlayerCombosById((prev) => ({ ...prev, [selectedPlayer.id]: editCombos }));
      }
      refetchPlayerCombos();
      setEditDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err?.message || "Failed to save combos", variant: "destructive" });
    },
  });

  const renderLineups = () => {
    const detail = detailResp?.detail;
    const lineups: any[] = detail?.attendance?.signups?.lineups || [];
    const sorted = lineups.slice().sort((a, b) => {
      const ap = parseInt(a?.placement?.displayPlacement ?? '999', 10);
      const bp = parseInt(b?.placement?.displayPlacement ?? '999', 10);
      return ap - bp;
    });
    if (sorted.length === 0) {
      return <p className="text-sm text-muted-foreground">Nessun dato di classifica disponibile.</p>;
    }
    return (
      <div className="space-y-4">
        {sorted.map((lu, idx) => {
          const placement = lu?.placement?.displayPlacement ?? `${idx + 1}`;
          const members: any[] = lu?.members || [];
          return (
            <Card key={idx} className="border">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Posizione {placement}</CardTitle>
              </CardHeader>
              <CardContent className="py-3">
                <div className="flex flex-col gap-4">
                  {members.map((m, i) => {
                    const cmUser = m?.user || {};
                    const pic = cmUser?.profilePicture || {};
                    const url = pic?.url || '';
                    const canEdit = !!user?.isAdmin && parseInt(placement, 10) <= 4;
                    const memberId = String(cmUser?.userId || '').trim();
                    const memberName = cmUser?.username || cmUser?.userId || 'Giocatore';
                    const combosList = (playerCombosById && memberId) ? (playerCombosById[memberId] ?? []) : [];
                    return (
                      <div key={i} className={`flex flex-col items-start justify-start gap-3 ${canEdit ? 'cursor-pointer' : ''}`}
                           onClick={() => {
                             if (!canEdit) return;
                             if (!memberId) return;
                             setSelectedPlayer({ id: memberId, username: String(memberName) });
                             setEditDialogOpen(true);
                           }}>
                        <div className="flex items-center gap-3">
                          {url ? (
                            <img src={url} alt={String(memberName)} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                              <User className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <span className="text-sm font-medium">{String(memberName)}</span>
                          {canEdit && (
                            <Pencil className="ml-1 w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="mt-2 flex flex-col gap-2 max-w-full">
                          {combosList && combosList.length > 0 ? (
                            combosList.map((combo, comboIdx) => (
                              <div key={comboIdx} className="flex flex-col gap-1 max-w-full">
                                <div className="text-sm font-medium text-muted-foreground truncate" title={formatComboTitle(combo)}>
                                  {formatComboTitle(combo)}
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                  {combo.lockChip && combo.lockChip !== 'None' && (
                                    <div className="w-9 h-9 sm:w-10 sm:h-10"><ComponentImage folder="chips" name={combo.lockChip} /></div>
                                  )}
                                  <div className="w-9 h-9 sm:w-10 sm:h-10"><ComponentImage folder="blades" name={combo.blade} /></div>
                                  {combo.assistBlade && combo.assistBlade !== 'None' && (
                                    <div className="w-9 h-9 sm:w-10 sm:h-10"><ComponentImage folder="assist-blades" name={combo.assistBlade} /></div>
                                  )}
                                  <div className="w-9 h-9 sm:w-10 sm:h-10"><ComponentImage folder="ratchets" name={combo.ratchet} /></div>
                                  <div className="w-9 h-9 sm:w-10 sm:h-10"><ComponentImage folder="bits" name={combo.bit} /></div>
                                  {/* {combo.lockChip && combo.lockChip !== 'None' && (
                                    <div className="w-9 h-9 sm:w-10 sm:h-10"><ComponentImage folder="chips" name={combo.lockChip} /></div>
                                  )} */}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="flex flex-col gap-2">
                              {[0,1,2].map((cIdx) => (
                                <div key={cIdx} className="flex flex-col gap-1 max-w-full">
                                  <div className="text-sm font-medium text-muted-foreground">Combo {cIdx + 1}</div>
                                  <div className="flex items-center gap-3 flex-wrap">
                                    <SvgPlaceholder />
                                    <SvgPlaceholder />
                                    <SvgPlaceholder />
                                    <SvgPlaceholder />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Dettagli torneo" action={<HeaderLogo />} />

      <main className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full space-y-6">
        <Button variant="ghost" onClick={() => setLocation('/tournaments')} className="gap-2 w-fit" data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
          Indietro
        </Button>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl font-semibold">
              {detailResp?.detail?.name || 'Dettagli torneo'}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {detailResp?.detail?.state || ''}
            </p>
            {detailResp?.detail?.contactUrl && (
              <p className="text-xs">
                <a className="text-blue-600 hover:underline" href={detailResp.detail.contactUrl} target="_blank" rel="noreferrer">Contatti / Info</a>
              </p>
            )}
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <div className="flex items-center justify-center py-16" aria-label="Loading leaderboard">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              renderLineups()
            )}
          </CardContent>
        </Card>

        {user?.isAdmin && (
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {selectedPlayer ? `Modifica combo: ${selectedPlayer.username}` : 'Modifica combo'}
                </DialogTitle>
              </DialogHeader>

              {playerCombosLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-6">
                  {[0, 1, 2].map((idx) => (
                    <div key={idx} className="space-y-3 pb-6 border-b last:border-b-0 last:pb-0">
                      <h4 className="font-medium text-sm text-muted-foreground">Combo {idx + 1}</h4>

                      <div>
                        <Label htmlFor={`edit-${idx}-blade`}>Blade</Label>
                        <SearchableSelect
                          id={`edit-${idx}-blade`}
                          value={editCombos[idx]?.blade || ''}
                          placeholder="Select blade"
                          options={componentsData?.blades || []}
                          onSelect={(val) => updateEditCombo(idx, 'blade', val)}
                        />
                      </div>

                      <div>
                        <Label htmlFor={`edit-${idx}-assistBlade`}>Assist Blade</Label>
                        <SearchableSelect
                          id={`edit-${idx}-assistBlade`}
                          value={editCombos[idx]?.assistBlade || ''}
                          placeholder="Select assist blade"
                          options={componentsData?.assistBlades || []}
                          includeNone
                          disabled={!isSingleWordBlade(editCombos[idx]?.blade || '')}
                          onSelect={(val) => updateEditCombo(idx, 'assistBlade', val)}
                        />
                        {!isSingleWordBlade(editCombos[idx]?.blade || '') && (
                          <p className="text-xs text-muted-foreground mt-1">Multi-word blades cannot use Assist Blades</p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor={`edit-${idx}-ratchet`}>Ratchet</Label>
                        <SearchableSelect
                          id={`edit-${idx}-ratchet`}
                          value={editCombos[idx]?.ratchet || ''}
                          placeholder="Select ratchet"
                          options={componentsData?.ratchets || []}
                          onSelect={(val) => updateEditCombo(idx, 'ratchet', val)}
                        />
                      </div>

                      <div>
                        <Label htmlFor={`edit-${idx}-bit`}>Bit</Label>
                        <SearchableSelect
                          id={`edit-${idx}-bit`}
                          value={editCombos[idx]?.bit || ''}
                          placeholder="Select bit"
                          options={componentsData?.bits || []}
                          onSelect={(val) => updateEditCombo(idx, 'bit', val)}
                        />
                      </div>

                      <div>
                        <Label htmlFor={`edit-${idx}-lockChip`}>Lock Chip</Label>
                        <SearchableSelect
                          id={`edit-${idx}-lockChip`}
                          value={editCombos[idx]?.lockChip || ''}
                          placeholder="Select lock chip"
                          options={componentsData?.lockChips || []}
                          includeNone
                          disabled={!isSingleWordBlade(editCombos[idx]?.blade || '')}
                          onSelect={(val) => updateEditCombo(idx, 'lockChip', val)}
                        />
                        {!isSingleWordBlade(editCombos[idx]?.blade || '') && (
                          <p className="text-xs text-muted-foreground mt-1">Multi-word blades cannot use Lock Chips</p>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
                    <Button type="button" onClick={() => saveCombosMutation.mutate()} disabled={saveCombosMutation.isPending}>
                      {saveCombosMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : 'Save'}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </main>
    </div>
  );
}