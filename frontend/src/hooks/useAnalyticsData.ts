import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

export function useAnalyticsData(selectedComponent: string, selectedSeason: string | null = null) {
    // Fetch trends data
    const { data: trendsData, isLoading: trendsLoading } = useQuery({
        queryKey: ["/api/trends", "count", "week", selectedSeason || "All Time"],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.append("metric", "count");
            params.append("granularity", "week");
            if (selectedSeason) {
                params.append("season", selectedSeason);
            }
            const res = await fetch(`/api/trends?${params.toString()}`);
            return res.json();
        },
    });

    // Fetch components list for fallback
    const { data: componentsData } = useQuery({
        queryKey: ["components"],
        queryFn: async () => {
            const res = await fetch("/api/components");
            if (!res.ok) throw new Error("Failed to fetch components");
            return res.json();
        },
    });

    // Derived state: Available names for the selected component type
    const availableNames = useMemo(() => {
        const namesFromTrends = Array.from(
            new Set(
                ((trendsData || []) as any[])
                    .filter((d: any) => d.component_type === selectedComponent)
                    .map((d: any) => d.name),
            ),
        ).sort();

        if (namesFromTrends.length > 0) return namesFromTrends;

        // Fallback
        if (!componentsData) return [];
        const mapKey: Record<string, string> = {
            blade: "blades",
            "assist-blade": "assistBlades",
            ratchet: "ratchets",
            bit: "bits",
            "lock-chip": "lockChips",
        };
        const key = mapKey[selectedComponent] || "blades";
        const arr = (componentsData as any)[key] as string[] | undefined;
        return Array.isArray(arr) ? [...arr].sort() : [];
    }, [trendsData, componentsData, selectedComponent]);

    // Transformation logic for the chart
    const getChartData = (selectedName: string | null) => {
        if (!trendsData || !selectedName) return [];

        const filtered = (trendsData as any[]).filter(
            (d: any) => d.component_type === selectedComponent,
        );

        const months = [...new Set(filtered.map((d: any) => d.month))].sort();

        return months.map((month) => {
            const monthData: any = { month };
            const dataPoint = filtered.find(
                (d: any) => d.month === month && d.name === selectedName,
            );
            monthData[selectedName] = dataPoint ? dataPoint.total_points : 0;
            return monthData;
        });
    };

    return {
        trendsData,
        trendsLoading,
        availableNames,
        getChartData
    };
}
