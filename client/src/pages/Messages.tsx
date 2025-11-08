import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Lock, Trophy, Medal, Award } from "lucide-react";

type ComboForm = {
  blade: string;
  assistBlade: string;
  ratchet: string;
  bit: string;
  lockChip: string;
};

const isSingleWordBlade = (bladeName: string): boolean => {
  if (!bladeName) return true;
  const hasMultipleCapitals = /[A-Z].*[A-Z]/.test(bladeName);
  return !hasMultipleCapitals;
};

export default function Messages() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [participants, setParticipants] = useState<number>(0);

  const [firstPlace, setFirstPlace] = useState<ComboForm[]>([
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
  ]);

  const [secondPlace, setSecondPlace] = useState<ComboForm[]>([
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
  ]);

  const [thirdPlace, setThirdPlace] = useState<ComboForm[]>([
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
    { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
  ]);

  const { data: componentsData } = useQuery<{
    blades: string[];
    assistBlades: string[];
    ratchets: string[];
    bits: string[];
    lockChips: string[];
  }>({
    queryKey: ["/api/components"],
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/admin/tournament-results", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Tournament results submitted successfully",
      });
      setParticipants(0);
      setFirstPlace([
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
      ]);
      setSecondPlace([
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
      ]);
      setThirdPlace([
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
        { blade: "", assistBlade: "", ratchet: "", bit: "", lockChip: "" },
      ]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit tournament results",
        variant: "destructive",
      });
    },
  });

  const updateCombo = (
    position: "first" | "second" | "third",
    index: number,
    field: keyof ComboForm,
    value: string,
  ) => {
    const setter =
      position === "first"
        ? setFirstPlace
        : position === "second"
          ? setSecondPlace
          : setThirdPlace;
    const combos =
      position === "first"
        ? firstPlace
        : position === "second"
          ? secondPlace
          : thirdPlace;

    const newCombos = [...combos];
    newCombos[index] = { ...newCombos[index], [field]: value };

    if (field === "blade" && !isSingleWordBlade(value)) {
      newCombos[index].assistBlade = "None";
      newCombos[index].lockChip = "None";
    }

    setter(newCombos);
  };

  const validateDeckUniqueness = (
    combos: ComboForm[],
    deckName: string,
  ): string | null => {
    const parts: { [key: string]: string[] } = {
      blade: [],
      assistBlade: [],
      ratchet: [],
      bit: [],
      lockChip: [],
    };

    for (const combo of combos) {
      parts.blade.push(combo.blade);
      parts.assistBlade.push(combo.assistBlade);
      parts.ratchet.push(combo.ratchet);
      parts.bit.push(combo.bit);
      parts.lockChip.push(combo.lockChip);
    }

    const checkDuplicates = (
      arr: string[],
      partName: string,
      allowNone: boolean,
    ): string | null => {
      const filtered = allowNone ? arr.filter((v) => v !== "None") : arr;
      const unique = new Set(filtered);
      if (filtered.length !== unique.size) {
        return `${deckName} has duplicate ${partName}s. Each combo must use different parts (except "None" for Assist Blade and Lock Chip).`;
      }
      return null;
    };

    const errors = [
      checkDuplicates(parts.blade, "Blade", false),
      checkDuplicates(parts.assistBlade, "Assist Blade", true),
      checkDuplicates(parts.ratchet, "Ratchet", false),
      checkDuplicates(parts.bit, "Bit", false),
      checkDuplicates(parts.lockChip, "Lock Chip", true),
    ].filter(Boolean);

    return errors.length > 0 ? errors[0] : null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (participants < 1) {
      toast({
        title: "Error",
        description: "Please enter a valid number of participants",
        variant: "destructive",
      });
      return;
    }

    const allCombos = [...firstPlace, ...secondPlace, ...thirdPlace];
    const hasEmpty = allCombos.some(
      (combo) =>
        !combo.blade ||
        !combo.assistBlade ||
        !combo.ratchet ||
        !combo.bit ||
        !combo.lockChip,
    );

    if (hasEmpty) {
      toast({
        title: "Error",
        description: "Please fill in all combo components",
        variant: "destructive",
      });
      return;
    }

    const firstPlaceError = validateDeckUniqueness(firstPlace, "1st Place");
    const secondPlaceError = validateDeckUniqueness(secondPlace, "2nd Place");
    const thirdPlaceError = validateDeckUniqueness(thirdPlace, "3rd Place");

    const validationError =
      firstPlaceError || secondPlaceError || thirdPlaceError;
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    submitMutation.mutate({
      participants,
      firstPlaceCombos: firstPlace,
      secondPlaceCombos: secondPlace,
      thirdPlaceCombos: thirdPlace,
    });
  };

  if (!user?.isAdmin) {
    return (
      <div className="flex flex-col min-h-screen bg-background pb-20">
        <PageHeader title="Tournaments" action={<HeaderLogo />} />

        <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
          <Card className="p-8 text-center">
            <div className="flex justify-center mb-4">
              <Lock className="w-16 h-16 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">
              Admin Access Required
            </h2>
            <p className="text-muted-foreground">
              This section is only accessible to administrators.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  const renderComboInputs = (
    combos: ComboForm[],
    position: "first" | "second" | "third",
    icon: React.ReactNode,
    title: string,
  ) => (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-4">
        {icon}
        <h3 className="text-lg font-semibold">{title}</h3>
      </CardHeader>
      <CardContent className="space-y-6">
        {combos.map((combo, idx) => (
          <div
            key={idx}
            className="space-y-3 pb-6 border-b last:border-b-0 last:pb-0"
          >
            <h4 className="font-medium text-sm text-muted-foreground">
              Combo {idx + 1}
            </h4>

            <div>
              <Label htmlFor={`${position}-${idx}-blade`}>Blade</Label>
              <Select
                value={combo.blade}
                onValueChange={(val) =>
                  updateCombo(position, idx, "blade", val)
                }
              >
                <SelectTrigger
                  id={`${position}-${idx}-blade`}
                  data-testid={`select-${position}-${idx}-blade`}
                >
                  <SelectValue placeholder="Select blade" />
                </SelectTrigger>
                <SelectContent>
                  {componentsData?.blades.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-assistBlade`}>
                Assist Blade
              </Label>
              <Select
                value={combo.assistBlade}
                onValueChange={(val) =>
                  updateCombo(position, idx, "assistBlade", val)
                }
                disabled={!isSingleWordBlade(combo.blade)}
              >
                <SelectTrigger
                  id={`${position}-${idx}-assistBlade`}
                  data-testid={`select-${position}-${idx}-assistBlade`}
                >
                  <SelectValue placeholder="Select assist blade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  {componentsData?.assistBlades.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isSingleWordBlade(combo.blade) && combo.blade && (
                <p className="text-xs text-muted-foreground mt-1">
                  Multi-word blades cannot use Assist Blades
                </p>
              )}
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-ratchet`}>Ratchet</Label>
              <Select
                value={combo.ratchet}
                onValueChange={(val) =>
                  updateCombo(position, idx, "ratchet", val)
                }
              >
                <SelectTrigger
                  id={`${position}-${idx}-ratchet`}
                  data-testid={`select-${position}-${idx}-ratchet`}
                >
                  <SelectValue placeholder="Select ratchet" />
                </SelectTrigger>
                <SelectContent>
                  {componentsData?.ratchets.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-bit`}>Bit</Label>
              <Select
                value={combo.bit}
                onValueChange={(val) => updateCombo(position, idx, "bit", val)}
              >
                <SelectTrigger
                  id={`${position}-${idx}-bit`}
                  data-testid={`select-${position}-${idx}-bit`}
                >
                  <SelectValue placeholder="Select bit" />
                </SelectTrigger>
                <SelectContent>
                  {componentsData?.bits.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor={`${position}-${idx}-lockChip`}>Lock Chip</Label>
              <Select
                value={combo.lockChip}
                onValueChange={(val) =>
                  updateCombo(position, idx, "lockChip", val)
                }
                disabled={!isSingleWordBlade(combo.blade)}
              >
                <SelectTrigger
                  id={`${position}-${idx}-lockChip`}
                  data-testid={`select-${position}-${idx}-lockChip`}
                >
                  <SelectValue placeholder="Select lock chip" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  {componentsData?.lockChips.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isSingleWordBlade(combo.blade) && combo.blade && (
                <p className="text-xs text-muted-foreground mt-1">
                  Multi-word blades cannot use Lock Chips
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Tournament" action={<HeaderLogo />} />

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">Informazioni torneo</h3>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="participants">Numero dei partecipanti</Label>
                <Input
                  id="participants"
                  type="number"
                  min="1"
                  value={participants || ""}
                  onChange={(e) =>
                    setParticipants(parseInt(e.target.value) || 0)
                  }
                  placeholder="da 6 a 126"
                  data-testid="input-participants"
                />
              </div>
            </CardContent>
          </Card>

          {renderComboInputs(
            firstPlace,
            "first",
            <Trophy className="w-5 h-5 text-yellow-500" />,
            "1st Place",
          )}
          {renderComboInputs(
            secondPlace,
            "second",
            <Medal className="w-5 h-5 text-gray-400" />,
            "2nd Place",
          )}
          {renderComboInputs(
            thirdPlace,
            "third",
            <Award className="w-5 h-5 text-amber-600" />,
            "3rd Place",
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={submitMutation.isPending}
            data-testid="button-submit-tournament"
          >
            {submitMutation.isPending
              ? "Submitting..."
              : "Submit Tournament Results"}
          </Button>
        </form>
      </main>
    </div>
  );
}
