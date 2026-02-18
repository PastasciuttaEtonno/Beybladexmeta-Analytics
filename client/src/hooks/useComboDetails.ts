import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useSearch } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export type ComboStats = {
    blade: string;
    assistBlade: string;
    ratchet: string;
    bit: string;
    lockChip: string;
    primiPosti: number;
    secondiPosti: number;
    terziPosti: number;
    quartiPosti: number;
    punteggioTotale: number;
    dataCreazione: string;
};

export type TournamentEntry = {
    tournamentId: string;
    tournamentName?: string;
    tournament_name?: string;
    playerName: string;
    date: string;
    placement: number;
    playerId: string;
};

export function useComboDetails() {
    const [, params] = useRoute("/combo/:id");
    const searchString = useSearch();
    const searchParams = new URLSearchParams(searchString);
    const season = searchParams.get("season") || "";
    const { toast } = useToast();

    const comboId = params?.id;
    const decodedId = comboId ? decodeURIComponent(comboId) : null;

    // Fetch Combo Stats
    const { data: comboData, isLoading: comboLoading, error: comboError } = useQuery<{ combo: ComboStats; rank: number }>({
        queryKey: ["/api/stats/combos/by-key", decodedId],
        enabled: !!decodedId,
        queryFn: async () => {
            const resp = await fetch(`/api/stats/combos/by-key?key=${encodeURIComponent(decodedId!)}`);
            if (!resp.ok) throw new Error("Failed to fetch combo");
            return resp.json();
        },
    });

    // Fetch Tournament History
    const { data: tourData, isLoading: tourLoading } = useQuery<{ tournaments: TournamentEntry[] }>({
        queryKey: ['/api/stats/combos', decodedId, 'tournaments', season],
        queryFn: async () => {
            const querySeason = season ? `?season=${encodeURIComponent(season)}` : '';
            const resp = await fetch(`/api/stats/combos/${encodeURIComponent(decodedId!)}/tournaments${querySeason}`);
            if (!resp.ok) throw new Error('Failed to fetch combo tournaments');
            return resp.json();
        },
        enabled: !!decodedId,
    });

    // Pagination Logic
    const [currentPage, setCurrentPage] = useState(1);
    const tournamentsPerPage = 5;
    const totalTournaments = tourData?.tournaments?.length || 0;
    const totalPages = Math.ceil(totalTournaments / tournamentsPerPage);
    const startIndex = (currentPage - 1) * tournamentsPerPage;
    const endIndex = startIndex + tournamentsPerPage;
    const currentTournaments = (tourData?.tournaments || []).slice(startIndex, endIndex);

    const combo = comboData?.combo;
    const rank = comboData?.rank ?? 0;

    // Metadata Generators
    const getComboTitle = () => {
        if (!combo) return "";
        return [
            combo.lockChip && combo.lockChip.toLowerCase() !== "none" ? combo.lockChip : "",
            combo.blade,
            combo.assistBlade && combo.assistBlade.toLowerCase() !== "none" ? combo.assistBlade : "",
            combo.ratchet && combo.ratchet.toLowerCase() !== "none" ? combo.ratchet : "",
            combo.bit,
        ].filter(Boolean).join(" • ");
    };

    const getCanonicalUrl = () => `${window.location.origin}/combo/${encodeURIComponent(decodedId || "")}`;
    const getOgImageUrl = () => `${window.location.origin}/api/og/combo/${encodeURIComponent(decodedId || "")}`;

    // Actions
    const handleShare = async () => {
        const title = getComboTitle();
        const url = window.location.href;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${title} · Combo`,
                    text: `Check out this Beyblade X combo: ${title}`,
                    url: url,
                });
            } catch (err) {
                console.error('Error sharing:', err);
            }
        } else {
            try {
                await navigator.clipboard.writeText(url);
                toast({
                    title: "Link copiato!",
                    description: "Il link della combo è stato copiato negli appunti.",
                });
            } catch (err) {
                toast({
                    title: "Errore",
                    description: "Impossibile copiare il link.",
                    variant: "destructive"
                });
            }
        }
    };

    return {
        comboId,
        decodedId,
        combo,
        rank,
        comboLoading,
        comboError,

        // Tournaments
        tournaments: currentTournaments,
        tourLoading,
        totalTournaments,
        currentPage,
        totalPages,
        setCurrentPage,
        tournamentsPerPage, // Export if needed for external pagination components

        // Helpers
        getComboTitle,
        getCanonicalUrl,
        getOgImageUrl,
        handleShare,
        season // Export season for UI to use
    };
}
