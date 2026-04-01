import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Property } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious, PaginationEllipsis,
} from "@/components/ui/pagination";
import {
  Building2, MapPin, Bed, Car, Ruler, Percent, Heart, ArrowUpDown,
  Gavel, ShoppingCart, Globe, FileText, TrendingUp, TrendingDown,
  ChevronRight, Filter, Search, RefreshCw, Upload
} from "lucide-react";
import { Link, useLocation } from "wouter";

// ---- URL-based filter persistence ----
const FILTER_KEYS = [
  "uf", "cidade", "bairro", "precoMin", "precoMax",
  "descontoMin", "tipoImovel", "quartos", "garagemMin",
  "condominio", "tipoVenda",
] as const;

type Filters = Record<typeof FILTER_KEYS[number], string>;

const emptyFilters: Filters = {
  uf: "", cidade: "", bairro: "", precoMin: "", precoMax: "",
  descontoMin: "", tipoImovel: "", quartos: "", garagemMin: "",
  condominio: "", tipoVenda: "",
};

/** Read filters, sort and page from the URL search params (before the hash) */
function parseSearchParams(): {
  filters: Filters;
  sort: string;
  page: number;
  searched: boolean;
} {
  const sp = new URLSearchParams(window.location.search);
  const filters = { ...emptyFilters };
  for (const key of FILTER_KEYS) {
    filters[key] = sp.get(key) || "";
  }
  const sort = sp.get("sort") || "desconto-desc";
  const page = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
  const searched = sp.get("searched") === "1";
  return { filters, sort, page, searched };
}

/** Build URL with search params + current hash path */
function buildUrl(filters: Filters, sort: string, page: number, searched: boolean): string {
  const sp = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    if (filters[key]) sp.set(key, filters[key]);
  }
  if (sort !== "desconto-desc") sp.set("sort", sort);
  if (page > 1) sp.set("page", String(page));
  if (searched) sp.set("searched", "1");
  const qs = sp.toString();
  const hash = window.location.hash || "#/";
  const base = window.location.pathname;
  return qs ? `${base}?${qs}${hash}` : `${base}${hash}`;
}

/** Write filters into URL using replaceState (for filter tweaks, sort, page changes) */
function writeHashParams(filters: Filters, sort: string, page: number, searched: boolean) {
  window.history.replaceState(null, "", buildUrl(filters, sort, page, searched));
}

/** Push a new history entry (used when performing a search — so back button returns here) */
function pushHashParams(filters: Filters, sort: string, page: number, searched: boolean) {
  window.history.pushState(null, "", buildUrl(filters, sort, page, searched));
}

function formatCurrency(value: number | null | undefined): string {
  if (!value) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (!value) return "—";
  return `${value.toFixed(1)}%`;
}

const tipoVendaConfig: Record<string, { label: string; icon: any; color: string }> = {
  AUCTION: { label: "Leilão", icon: Gavel, color: "bg-chart-1/10 text-chart-1" },
  DIRECT: { label: "Compra Direta", icon: ShoppingCart, color: "bg-chart-3/10 text-chart-3" },
  ONLINE: { label: "Venda Online", icon: Globe, color: "bg-chart-2/10 text-chart-2" },
  BID: { label: "Licitação", icon: FileText, color: "bg-chart-4/10 text-chart-4" },
};

interface PaginatedResult {
  data: Property[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function StatsBar() {
  const { data: stats, isLoading } = useQuery<{
    total: number;
    porModalidade: Record<string, number>;
    porEstado: Record<string, number>;
    descontoMedio: number;
    valorMedioAvaliacao: number;
  }>({ queryKey: ["/api/stats"] });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const kpis = [
    { label: "Total Imóveis", value: stats.total.toString(), icon: Building2 },
    { label: "Desconto Médio", value: formatPercent(stats.descontoMedio), icon: Percent },
    { label: "Ticket Médio", value: formatCurrency(stats.valorMedioAvaliacao), icon: TrendingUp },
    { label: "Estados", value: Object.keys(stats.porEstado).length.toString(), icon: MapPin },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {kpis.map((kpi) => (
        <Card key={kpi.label} className="border-card-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <kpi.icon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
            </div>
            <p className="text-lg font-semibold tabular-nums" data-testid={`stat-${kpi.label}`}>{kpi.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function QuickSync() {
  const { data: lastSync } = useQuery<{
    lastSync: string | null;
    totalProperties: number;
    byState: Record<string, number>;
  }>({ queryKey: ["/api/sync/last"] });

  const stateCount = lastSync?.byState ? Object.keys(lastSync.byState).length : 0;

  return (
    <Card className="border-dashed border-primary/30 bg-primary/5">
      <CardContent className="p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <RefreshCw className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              {lastSync?.lastSync ? (
                <p className="text-xs text-muted-foreground truncate">
                  Última sincronização: {new Date(lastSync.lastSync).toLocaleDateString("pt-BR", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                  })} — {lastSync.totalProperties} imóveis em {stateCount} estado(s)
                </p>
              ) : lastSync && lastSync.totalProperties > 0 ? (
                <p className="text-xs text-muted-foreground truncate">
                  {lastSync.totalProperties} imóveis carregados de {stateCount} estado(s)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Importe imóveis do site da Caixa
                </p>
              )}
            </div>
          </div>
          <Link href="/sync">
            <Button size="sm" className="shrink-0 min-h-[44px]" data-testid="button-quick-sync">
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Sincronizar
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function PropertyCard({
  property,
  isSelected,
  onToggleSelect,
}: {
  property: Property;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
}) {
  const config = tipoVendaConfig[property.tipoVenda] || tipoVendaConfig.AUCTION;
  const Icon = config.icon;
  const queryClient = useQueryClient();

  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await apiRequest("POST", `/api/properties/${property.id}/favorite`);
    queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
  };

  const handleCheckbox = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleSelect(property.id);
  };

  return (
    <Link href={`/property/${property.id}`}>
      <Card className="group border-card-border hover:border-primary/30 transition-colors cursor-pointer" data-testid={`card-property-${property.id}`}>
        <CardContent className="p-0">
          {/* Image placeholder */}
          <div className="relative h-36 bg-muted rounded-t-lg overflow-hidden">
            {property.urlImagem ? (
              <img
                src={property.urlImagem}
                alt={property.titulo}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building2 className="h-10 w-10 text-muted-foreground/30" />
              </div>
            )}
            <div className="absolute top-2 left-2 flex gap-1.5">
              <Badge variant="secondary" className={`text-xs font-medium ${config.color}`}>
                <Icon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
            </div>
            {property.desconto && property.desconto > 0 && (
              <Badge className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-xs font-semibold">
                -{formatPercent(property.desconto)}
              </Badge>
            )}
            {/* Compare checkbox */}
            <div
              className="absolute bottom-2 left-2"
              onClick={handleCheckbox}
            >
              <div
                className={`h-6 w-6 min-h-[44px] min-w-[44px] flex items-center justify-center rounded border-2 transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-primary border-primary"
                    : "bg-background/80 border-muted-foreground/40 hover:border-primary"
                }`}
                data-testid={`checkbox-compare-${property.id}`}
              >
                {isSelected && (
                  <svg className="h-4 w-4 text-primary-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            </div>
          </div>

          <div className="p-3.5">
            {/* Price section */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-base font-semibold tabular-nums" data-testid={`text-price-${property.id}`}>
                  {formatCurrency(property.valorMinVenda || property.valorMinVenda2Leilao || property.valorMinVenda1Leilao)}
                </p>
                {property.valorAvaliacao && (
                  <p className="text-xs text-muted-foreground line-through tabular-nums">
                    Avaliado: {formatCurrency(property.valorAvaliacao)}
                  </p>
                )}
              </div>
              <button
                onClick={handleFavorite}
                className="p-1 rounded-md hover:bg-muted transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                data-testid={`button-favorite-${property.id}`}
              >
                <Heart className={`h-4 w-4 ${property.favorito ? 'fill-destructive text-destructive' : 'text-muted-foreground'}`} />
              </button>
            </div>

            {/* Title */}
            <p className="text-sm font-medium text-foreground mb-1.5 line-clamp-1" data-testid={`text-title-${property.id}`}>
              {property.titulo}
            </p>

            {/* Location */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="line-clamp-1" data-testid={`text-location-${property.id}`}>{property.bairro ? `${property.bairro}, ` : ""}{property.cidade} - {property.uf}</span>
            </div>

            {/* Features */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {property.tipoImovel && (
                <span className="flex items-center gap-1" data-testid={`text-tipo-${property.id}`}>
                  <Building2 className="h-3 w-3" />
                  {property.tipoImovel}
                </span>
              )}
              {property.quartos && (
                <span className="flex items-center gap-1" data-testid={`text-quartos-${property.id}`}>
                  <Bed className="h-3 w-3" />
                  {property.quartos}
                </span>
              )}
              {property.garagem !== null && property.garagem !== undefined && (
                <span className="flex items-center gap-1" data-testid={`text-garagem-${property.id}`}>
                  <Car className="h-3 w-3" />
                  {property.garagem}
                </span>
              )}
              {property.areaTotal && (
                <span className="flex items-center gap-1" data-testid={`text-area-${property.id}`}>
                  <Ruler className="h-3 w-3" />
                  {property.areaTotal}m²
                </span>
              )}
            </div>

            {/* Score badges */}
            {property.scoreGeral !== null && property.scoreGeral !== undefined && (
              <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-card-border">
                <span className="text-xs text-muted-foreground">Score:</span>
                <Badge
                  variant="secondary"
                  className={`text-xs tabular-nums ${
                    property.scoreGeral >= 70 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    property.scoreGeral >= 40 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}
                  data-testid={`badge-score-${property.id}`}
                >
                  {property.scoreGeral.toFixed(0)}/100
                </Badge>
                {property.aceitaFGTS === 1 && (
                  <Badge variant="outline" className="text-xs">FGTS</Badge>
                )}
                {property.aceitaFinanciamento === 1 && (
                  <Badge variant="outline" className="text-xs">Financ.</Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

type SortOption = { key: string; label: string; orderBy: string; orderDir: string };

const sortOptions: SortOption[] = [
  { key: "preco-asc", label: "Preço ↑", orderBy: "preco", orderDir: "asc" },
  { key: "preco-desc", label: "Preço ↓", orderBy: "preco", orderDir: "desc" },
  { key: "desconto-desc", label: "Desconto ↑", orderBy: "desconto", orderDir: "desc" },
  { key: "desconto-asc", label: "Desconto ↓", orderBy: "desconto", orderDir: "asc" },
  { key: "score-desc", label: "Melhor Score", orderBy: "score", orderDir: "desc" },
  { key: "area-desc", label: "Maior Área", orderBy: "area", orderDir: "desc" },
];

export default function Dashboard() {
  // Initialize state from URL hash params (survives navigation to /property/:id and back)
  const initial = useMemo(() => parseSearchParams(), []);

  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [activeSort, setActiveSort] = useState(initial.sort);
  const [currentPage, setCurrentPage] = useState(initial.page);
  const [hasSearched, setHasSearched] = useState(initial.searched);
  const [searchFilters, setSearchFilters] = useState<Filters | null>(
    initial.searched ? initial.filters : null
  );
  const [compareIds, setCompareIds] = useState<Set<number>>(new Set());
  const resultsRef = useRef<HTMLDivElement>(null);

  // Sync state back to URL hash whenever search-relevant state changes
  useEffect(() => {
    writeHashParams(
      hasSearched && searchFilters ? searchFilters : filters,
      activeSort,
      currentPage,
      hasSearched,
    );
  }, [filters, searchFilters, activeSort, currentPage, hasSearched]);

  // Count active filters (non-empty values)
  const activeFilterCount = Object.values(filters).filter((v) => v !== "").length;
  const canSearch = activeFilterCount >= 3;

  const sortOption = sortOptions.find((s) => s.key === activeSort) || sortOptions[2];

  // Build query params from searchFilters
  const buildQueryKey = () => {
    if (!hasSearched || !searchFilters) return null;
    const params = new URLSearchParams();
    if (searchFilters.uf) params.set("uf", searchFilters.uf);
    if (searchFilters.cidade) params.set("cidade", searchFilters.cidade);
    if (searchFilters.bairro) params.set("bairro", searchFilters.bairro);
    if (searchFilters.precoMin) params.set("precoMin", searchFilters.precoMin);
    if (searchFilters.precoMax) params.set("precoMax", searchFilters.precoMax);
    if (searchFilters.descontoMin) params.set("descontoMin", searchFilters.descontoMin);
    if (searchFilters.tipoImovel) params.set("tipoImovel", searchFilters.tipoImovel);
    if (searchFilters.quartos) params.set("quartos", searchFilters.quartos);
    if (searchFilters.garagemMin) params.set("garagemMin", searchFilters.garagemMin);
    if (searchFilters.condominio) params.set("condominio", searchFilters.condominio);
    if (searchFilters.tipoVenda) params.set("tipoVenda", searchFilters.tipoVenda);
    params.set("orderBy", sortOption.orderBy);
    params.set("orderDir", sortOption.orderDir);
    params.set("page", String(currentPage));
    params.set("pageSize", "10");
    return `/api/properties?${params.toString()}`;
  };

  const queryKey = buildQueryKey();

  const { data: result, isLoading, isFetching } = useQuery<PaginatedResult>({
    queryKey: queryKey ? [queryKey] : ["__disabled__"],
    enabled: !!queryKey,
  });

  const { data: ufs } = useQuery<string[]>({ queryKey: ["/api/ufs"] });
  const { data: cidades } = useQuery<string[]>({
    queryKey: ["/api/cidades", filters.uf ? `?uf=${filters.uf}` : ""],
    enabled: true,
  });
  const { data: bairros } = useQuery<string[]>({
    queryKey: [`/api/bairros?uf=${filters.uf || ""}&cidade=${filters.cidade || ""}`],
    enabled: !!(filters.uf || filters.cidade),
  });
  const { data: tiposImovel } = useQuery<string[]>({
    queryKey: ["/api/tipos-imovel"],
  });

  const handleSearch = () => {
    if (!canSearch) return;
    const newFilters = { ...filters };
    setSearchFilters(newFilters);
    setCurrentPage(1);
    setHasSearched(true);
    // Push a history entry so browser back button returns to this search state
    pushHashParams(newFilters, activeSort, 1, true);
  };

  const handleSortChange = (sortKey: string) => {
    setActiveSort(sortKey);
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    resultsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleCompare = useCallback((id: number) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 5) return prev;
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleClearFilters = () => {
    setFilters({ ...emptyFilters });
    setHasSearched(false);
    setSearchFilters(null);
    setCurrentPage(1);
  };

  // Pagination logic
  const totalPages = result?.totalPages || 0;

  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "ellipsis")[] = [];
    if (currentPage <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push("ellipsis");
      pages.push(totalPages);
    } else if (currentPage >= totalPages - 3) {
      pages.push(1);
      pages.push("ellipsis");
      for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push("ellipsis");
      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
      pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SidebarTrigger data-testid="button-sidebar-trigger" className="h-10 w-10 min-h-[44px] min-w-[44px]" />
        <div>
          <h1 className="text-lg font-semibold">Painel de Imóveis</h1>
          <p className="text-sm text-muted-foreground">Caixa Econômica Federal — Leilões e Vendas Diretas</p>
        </div>
      </div>

      {/* Stats KPIs */}
      <StatsBar />

      {/* Quick Sync */}
      <QuickSync />

      {/* Filters Panel */}
      <Card className="border-card-border" data-testid="panel-filters">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtros</span>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-xs" data-testid="badge-active-filters">
                  {activeFilterCount} ativo{activeFilterCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="text-xs min-h-[44px]"
                data-testid="button-clear-filters"
              >
                Limpar filtros
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {/* Estado */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Estado</label>
              <Select
                value={filters.uf || "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, uf: v === "all" ? "" : v, cidade: "", bairro: "" }))}
              >
                <SelectTrigger className="text-sm min-h-[44px]" data-testid="select-uf">
                  <SelectValue placeholder="Todos Estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Estados</SelectItem>
                  {ufs?.map((uf) => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Cidade */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Cidade</label>
              <Select
                value={filters.cidade || "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, cidade: v === "all" ? "" : v, bairro: "" }))}
              >
                <SelectTrigger className="text-sm min-h-[44px]" data-testid="select-cidade">
                  <SelectValue placeholder="Todas Cidades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Cidades</SelectItem>
                  {cidades?.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bairro */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Bairro</label>
              <Select
                value={filters.bairro || "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, bairro: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="text-sm min-h-[44px]" data-testid="select-bairro">
                  <SelectValue placeholder="Todos Bairros" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Bairros</SelectItem>
                  {bairros?.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preço Mínimo */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Preço Mín. (R$)</label>
              <Input
                type="number"
                placeholder="0"
                value={filters.precoMin}
                onChange={(e) => setFilters((f) => ({ ...f, precoMin: e.target.value }))}
                className="text-sm min-h-[44px]"
                data-testid="input-preco-min"
              />
            </div>

            {/* Preço Máximo */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Preço Máx. (R$)</label>
              <Input
                type="number"
                placeholder="Sem limite"
                value={filters.precoMax}
                onChange={(e) => setFilters((f) => ({ ...f, precoMax: e.target.value }))}
                className="text-sm min-h-[44px]"
                data-testid="input-preco-max"
              />
            </div>

            {/* Desconto Estimado */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Desconto Mín.</label>
              <Select
                value={filters.descontoMin || "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, descontoMin: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="text-sm min-h-[44px]" data-testid="select-desconto">
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer</SelectItem>
                  <SelectItem value="20">20%+</SelectItem>
                  <SelectItem value="30">30%+</SelectItem>
                  <SelectItem value="40">40%+</SelectItem>
                  <SelectItem value="50">50%+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tipo do Imóvel */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tipo do Imóvel</label>
              <Select
                value={filters.tipoImovel || "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, tipoImovel: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="text-sm min-h-[44px]" data-testid="select-tipo">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {tiposImovel?.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quartos */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Quartos</label>
              <Select
                value={filters.quartos || "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, quartos: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="text-sm min-h-[44px]" data-testid="select-quartos">
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer</SelectItem>
                  <SelectItem value="1">1+</SelectItem>
                  <SelectItem value="2">2+</SelectItem>
                  <SelectItem value="3">3+</SelectItem>
                  <SelectItem value="4">4+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Garagem */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Vagas de Garagem</label>
              <Select
                value={filters.garagemMin || "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, garagemMin: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="text-sm min-h-[44px]" data-testid="select-garagem">
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer</SelectItem>
                  <SelectItem value="1">1+</SelectItem>
                  <SelectItem value="2">2+</SelectItem>
                  <SelectItem value="3">3+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Condomínio */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Condomínio</label>
              <Select
                value={filters.condominio || "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, condominio: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="text-sm min-h-[44px]" data-testid="select-condominio">
                  <SelectValue placeholder="Qualquer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Modalidade */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Modalidade</label>
              <Select
                value={filters.tipoVenda || "all"}
                onValueChange={(v) => setFilters((f) => ({ ...f, tipoVenda: v === "all" ? "" : v }))}
              >
                <SelectTrigger className="text-sm min-h-[44px]" data-testid="select-modalidade">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="AUCTION">Leilão</SelectItem>
                  <SelectItem value="DIRECT">Compra Direta</SelectItem>
                  <SelectItem value="ONLINE">Venda Online</SelectItem>
                  <SelectItem value="BID">Licitação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Search button and filter counter */}
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Button
              onClick={handleSearch}
              disabled={!canSearch}
              className="min-h-[44px] px-6"
              data-testid="button-search"
            >
              <Search className="h-4 w-4 mr-2" />
              Buscar Imóveis
            </Button>
            {!canSearch && (
              <p className="text-xs text-muted-foreground" data-testid="text-filter-hint">
                Selecione pelo menos 3 filtros ({3 - activeFilterCount} restante{3 - activeFilterCount !== 1 ? "s" : ""})
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results area */}
      <div ref={resultsRef}>
        {!hasSearched ? (
          <Card className="border-card-border">
            <CardContent className="p-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground" data-testid="text-initial-message">
                Selecione pelo menos 3 filtros para visualizar imóveis
              </p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-72 rounded-lg" />
              ))}
            </div>
          </div>
        ) : result && result.data.length > 0 ? (
          <div className="space-y-4">
            {/* Sorting bar + result count */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" data-testid="text-result-count">
                {result.total} imóveis encontrados
                {isFetching && " (atualizando...)"}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Ordenar por:</span>
                {sortOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => handleSortChange(opt.key)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors min-h-[44px] ${
                      activeSort === opt.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    data-testid={`button-sort-${opt.key}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Compare selection info */}
            {compareIds.size > 0 && (
              <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded-lg">
                <span className="text-xs text-primary font-medium" data-testid="text-compare-count">
                  {compareIds.size} imóve{compareIds.size !== 1 ? "is" : "l"} selecionado{compareIds.size !== 1 ? "s" : ""} para comparação
                </span>
                <Link href="/compare">
                  <Button size="sm" variant="outline" className="text-xs min-h-[44px]" data-testid="button-go-compare">
                    Comparar
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs min-h-[44px]"
                  onClick={() => setCompareIds(new Set())}
                  data-testid="button-clear-compare"
                >
                  Limpar seleção
                </Button>
              </div>
            )}

            {/* Property grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {result.data.map((prop) => (
                <PropertyCard
                  key={prop.id}
                  property={prop}
                  isSelected={compareIds.has(prop.id)}
                  onToggleSelect={toggleCompare}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination data-testid="pagination">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                      className={`min-h-[44px] cursor-pointer ${currentPage <= 1 ? "pointer-events-none opacity-50" : ""}`}
                      data-testid="button-page-prev"
                    />
                  </PaginationItem>
                  {getPageNumbers().map((page, idx) =>
                    page === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${idx}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={page}>
                        <PaginationLink
                          isActive={currentPage === page}
                          onClick={() => handlePageChange(page as number)}
                          className="min-h-[44px] cursor-pointer"
                          data-testid={`button-page-${page}`}
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                      className={`min-h-[44px] cursor-pointer ${currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}`}
                      data-testid="button-page-next"
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        ) : (
          <Card className="border-card-border">
            <CardContent className="p-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground" data-testid="text-no-results">
                Nenhum imóvel encontrado com os filtros selecionados.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 min-h-[44px]"
                onClick={handleClearFilters}
                data-testid="button-clear-filters-empty"
              >
                Limpar Filtros
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
