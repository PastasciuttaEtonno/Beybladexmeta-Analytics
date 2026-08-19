import { useQuery } from '@tanstack/react-query';
import type { BladeStats, RatchetStats, BitStats } from '@/types/api';

export interface TopComponentsResponse {
    blade: BladeStats | null;
    ratchet: RatchetStats | null;
    bit: BitStats | null;
}

export function useDashboardData(selectedSeason: string) {
    const { data: topComponents, isLoading } = useQuery<TopComponentsResponse>({
        queryKey: ['/api/stats/top/components', selectedSeason],
        queryFn: async () => {
            const res = await fetch(`/api/stats/top/components?season=${encodeURIComponent(selectedSeason)}`);
            if (!res.ok) throw new Error("Failed to fetch top components");
            return res.json();
        },
    });

    return {
        topBlade: topComponents?.blade,
        topRatchet: topComponents?.ratchet,
        topBit: topComponents?.bit,
        isLoading
    };
}
