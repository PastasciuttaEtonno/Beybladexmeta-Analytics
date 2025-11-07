import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Trophy,
  Medal,
  Award,
  TrendingUp,
  Filter,
  X,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { ComboStats } from "@shared/schema";

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ComboResponse {
  combos: ComboStats[];
  pagination: PaginationMeta;
}

export default function Analytics() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("score");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Temporary state for modal inputs
  const [tempSearchTerm, setTempSearchTerm] = useState("");
  const [tempSortBy, setTempSortBy] = useState("score");
  const [tempSortOrder, setTempSortOrder] = useState<"asc" | "desc">("desc");

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy, sortOrder]);

  const { data, isLoading } = useQuery<ComboResponse>({
    queryKey: ["/api/stats/combos", searchTerm, sortBy, sortOrder, currentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      params.append("sortBy", sortBy);
      params.append("sortOrder", sortOrder);
      params.append("page", currentPage.toString());
      params.append("limit", "20");

      const response = await fetch(`/api/stats/combos?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch combos");
      return response.json();
    },
  });

  const handleOpenFilterModal = () => {
    setTempSearchTerm(searchTerm);
    setTempSortBy(sortBy);
    setTempSortOrder(sortOrder);
    setFilterModalOpen(true);
  };

  const handleApplyFilters = () => {
    setSearchTerm(tempSearchTerm);
    setSortBy(tempSortBy);
    setSortOrder(tempSortOrder);
    setFilterModalOpen(false);
  };

  const handleClearFilters = () => {
    setTempSearchTerm("");
    setTempSortBy("score");
    setTempSortOrder("desc");
    setSearchTerm("");
    setSortBy("score");
    setSortOrder("desc");
    setFilterModalOpen(false);
  };

  const hasActiveFilters =
    searchTerm !== "" || sortBy !== "score" || sortOrder !== "desc";

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (index === 1) return <Medal className="w-5 h-5 text-gray-400" />;
    if (index === 2) return <Award className="w-5 h-5 text-amber-600" />;
    return null;
  };

  const getRankBadge = (index: number) => {
    if (index === 0)
      return <Badge className="bg-yellow-500 hover:bg-yellow-600">1st</Badge>;
    if (index === 1)
      return <Badge className="bg-gray-400 hover:bg-gray-500">2nd</Badge>;
    if (index === 2)
      return <Badge className="bg-amber-600 hover:bg-amber-700">3rd</Badge>;
    return <Badge variant="outline">{index + 1}</Badge>;
  };

  const getComboId = (combo: ComboStats) => {
    return encodeURIComponent(
      `${combo.blade}|${combo.assistBlade}|${combo.ratchet}|${combo.bit}|${combo.lockChip}`,
    );
  };

  const handleComboClick = (combo: ComboStats) => {
    setLocation(`/combo/${getComboId(combo)}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Meta-Game" />

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-6 h-6 text-primary" />
              <div>
                <h2 className="text-lg font-semibold">Top Combos</h2>
                <p className="text-sm text-muted-foreground">
                  Classifica combo tornei
                </p>
              </div>
            </div>

            <Dialog open={filterModalOpen} onOpenChange={setFilterModalOpen}>
              <DialogTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="relative"
                  onClick={handleOpenFilterModal}
                  data-testid="button-filter"
                >
                  <Filter className="w-4 h-4" />
                  {hasActiveFilters && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Filter Combos</DialogTitle>
                  <DialogDescription>
                    Cerca e filtra combo in base al posizionamento e ai
                    componenti.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="search">Search</Label>
                    <Input
                      id="search"
                      placeholder="Search by blade, assist blade, ratchet, bit, or chip..."
                      value={tempSearchTerm}
                      onChange={(e) => setTempSearchTerm(e.target.value)}
                      data-testid="input-modal-search"
                    />
                    <p className="text-xs text-muted-foreground">
                      Filtra tra tutti i nomi dei componenti
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="sort">Sort by</Label>
                    <Select value={tempSortBy} onValueChange={setTempSortBy}>
                      <SelectTrigger id="sort" data-testid="select-modal-sort">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="score">Total Score</SelectItem>
                        <SelectItem value="first">1st Place</SelectItem>
                        <SelectItem value="second">2nd Place</SelectItem>
                        <SelectItem value="third">3rd Place</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="order">Sort order</Label>
                    <Select
                      value={tempSortOrder}
                      onValueChange={(value) =>
                        setTempSortOrder(value as "asc" | "desc")
                      }
                    >
                      <SelectTrigger
                        id="order"
                        data-testid="select-modal-order"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="desc">Decrescente</SelectItem>
                        <SelectItem value="asc">Crescente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter className="flex-row gap-2 sm:gap-2">
                  <Button
                    variant="outline"
                    onClick={handleClearFilters}
                    className="flex-1"
                    data-testid="button-clear-filters"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                  <Button
                    onClick={handleApplyFilters}
                    className="flex-1"
                    data-testid="button-apply-filters"
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    Apply
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {hasActiveFilters && (
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">
                Filtri attivi:
              </span>
              {searchTerm && (
                <Badge variant="secondary" className="text-xs">
                  Search: {searchTerm}
                </Badge>
              )}
              {sortBy !== "score" && (
                <Badge variant="secondary" className="text-xs">
                  Sort:{" "}
                  {sortBy === "first"
                    ? "1st Place"
                    : sortBy === "second"
                      ? "2nd Place"
                      : "3rd Place"}
                </Badge>
              )}
              {sortOrder !== "desc" && (
                <Badge variant="secondary" className="text-xs">
                  Order:{" "}
                  {sortOrder === "asc"
                    ? "Lowest to Highest"
                    : "Highest to Lowest"}
                </Badge>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-24 bg-muted/30 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : data?.combos && data.combos.length > 0 ? (
            <div className="space-y-3">
              {data.combos.map((combo, index) => (
                <Card
                  key={`${combo.blade}-${combo.assistBlade}-${combo.ratchet}-${combo.bit}-${combo.lockChip}`}
                  className="p-4 hover-elevate active-elevate-2 cursor-pointer"
                  onClick={() => handleComboClick(combo)}
                  data-testid={`card-combo-${index}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-1 min-w-[3rem]">
                      {getRankIcon(index)}
                      {getRankBadge(index)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Blade</p>
                          <p
                            className="text-sm font-medium truncate"
                            data-testid={`text-blade-${index}`}
                          >
                            {combo.blade}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Assist Blade
                          </p>
                          <p className="text-sm font-medium truncate">
                            {combo.assistBlade}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Ratchet
                          </p>
                          <p className="text-sm font-medium truncate">
                            {combo.ratchet}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Bit</p>
                          <p className="text-sm font-medium truncate">
                            {combo.bit}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">
                            Lock Chip
                          </p>
                          <p className="text-sm font-medium truncate">
                            {combo.lockChip}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 pt-3 border-t border-border">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Score</p>
                          <p
                            className="text-lg font-bold text-primary"
                            data-testid={`text-score-${index}`}
                          >
                            {combo.punteggioTotale.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">1st</p>
                          <p className="text-sm font-semibold text-yellow-500">
                            {combo.primiPosti}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">2nd</p>
                          <p className="text-sm font-semibold text-gray-400">
                            {combo.secondiPosti}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">3rd</p>
                          <p className="text-sm font-semibold text-amber-600">
                            {combo.terziPosti}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No tournament data yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Dati apparirano una volta che i tornei verranno registrati
              </p>
            </div>
          )}

          {data?.combos && data.combos.length > 0 && data.pagination && (
            <div className="mt-6 space-y-3">
              <div
                className="text-center text-sm text-muted-foreground"
                data-testid="text-pagination-info"
              >
                Page {data.pagination.page} of {data.pagination.totalPages} (
                {data.pagination.total.toLocaleString()} total combos)
              </div>

              <div className="flex items-center justify-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  data-testid="button-first-page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>

                <Button
                  size="icon"
                  variant="outline"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={currentPage === 1}
                  data-testid="button-previous-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                <Button
                  size="icon"
                  variant="outline"
                  onClick={() =>
                    setCurrentPage((prev) =>
                      Math.min(data.pagination.totalPages, prev + 1),
                    )
                  }
                  disabled={currentPage === data.pagination.totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>

                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setCurrentPage(data.pagination.totalPages)}
                  disabled={currentPage === data.pagination.totalPages}
                  data-testid="button-last-page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}
