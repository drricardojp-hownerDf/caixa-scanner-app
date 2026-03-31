import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Property } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { useApifyToken } from "@/hooks/use-apify-token";
import {
  Building2, MapPin, Bed, Car, Ruler, Percent, Heart, ArrowUpDown,
  Gavel, ShoppingCart, Globe, FileText, TrendingUp, TrendingDown,
  ChevronRight, Filter, Search, RefreshCw, Loader2, Settings2, Upload
} from "lucide-react";
import { Link } from "wouter";

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

const ESTADOS_SYNC = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO"
];

function QuickSync() {
  const { toast } = useToast();
  const { token, hasToken } = useApifyToken();
  const [syncEstado, setSyncEstado] = useState("SP");
  const [syncCidade, setSyncCidade] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);

  const csvImportMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import-csv", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao importar");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ufs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cidades"] });
      toast({ title: "CSV importado", description: data.message });
      if (csvInputRef.current) csvInputRef.current.value = "";
    },
    onError: (err: any) => {
      toast({ title: "Erro na importação", description: err.message, variant: "destructive" });
    },
  });

  const handleCsvImport = () => {
    csvInputRef.current?.click();
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) csvImportMutation.mutate(file);
  };

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sync", {
      token: token.trim(),
      estado: syncEstado,
      cidade: syncCidade || undefined,
    }),
    onSuccess: () => {
      setIsSyncing(true);
      setSyncMessage("Buscando imóveis...");
      toast({ title: "Busca iniciada", description: `Buscando em ${syncEstado}${syncCidade ? ` - ${syncCidade}` : ""}... aguarde 1-5 min.` });
      const interval = setInterval(async () => {
        try {
          const res = await fetch("/api/sync/status");
          const status = await res.json();
          setSyncMessage(status.message || "Buscando...");
          if (status.status === "completed") {
            clearInterval(interval);
            setIsSyncing(false);
            setSyncMessage("");
            queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
            queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/ufs"] });
            queryClient.invalidateQueries({ queryKey: ["/api/cidades"] });
            toast({ title: "Atualizado", description: status.message });
          } else if (status.status === "error") {
            clearInterval(interval);
            setIsSyncing(false);
            setSyncMessage("");
            toast({ title: "Erro", description: status.message, variant: "destructive" });
          }
        } catch { /* continue polling */ }
      }, 3000);
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  if (!hasToken) {
    return (
      <Card className="border-dashed border-primary/30 bg-primary/5">
        <CardContent className="p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4" />
              <span>Configure seu token ou importe um CSV</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvFileChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCsvImport}
                disabled={csvImportMutation.isPending}
                className="shrink-0 min-h-[44px]"
              >
                {csvImportMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    CSV
                  </>
                )}
              </Button>
              <Link href="/sync">
                <Button variant="outline" size="sm" className="shrink-0 min-h-[44px]">
                  <Settings2 className="h-3.5 w-3.5 mr-1.5" />
                  Configurar
                </Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-card-border">
      <CardContent className="p-3.5 space-y-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Select value={syncEstado} onValueChange={setSyncEstado}>
            <SelectTrigger className="w-[80px] text-sm h-10 min-h-[44px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {ESTADOS_SYNC.map(uf => (
                <SelectItem key={uf} value={uf}>{uf}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            type="text"
            placeholder="Cidade (opcional)"
            value={syncCidade}
            onChange={(e) => setSyncCidade(e.target.value.toUpperCase())}
            className="flex-1 min-w-[120px] h-10 min-h-[44px] px-3 text-sm rounded-md border border-input bg-background placeholder:text-muted-foreground"
          />
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={isSyncing}
            className="h-10 min-h-[44px] px-4"
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Atualizar
              </>
            )}
          </Button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCsvFileChange}
          />
          <Button
            variant="outline"
            onClick={handleCsvImport}
            disabled={csvImportMutation.isPending}
            className="h-10 min-h-[44px] px-3"
            title="Importar CSV"
          >
            {csvImportMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Upload className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">CSV</span>
              </>
            )}
          </Button>
          <Link href="/sync">
            <Button variant="ghost" size="icon" className="h-10 w-10 min-h-[44px] min-w-[44px] text-muted-foreground">
              <Settings2 className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        {isSyncing && syncMessage && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{syncMessage}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PropertyCard({ property }: { property: Property }) {
  const config = tipoVendaConfig[property.tipoVenda] || tipoVendaConfig.AUCTION;
  const Icon = config.icon;

  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await apiRequest("POST", `/api/properties/${property.id}/favorite`);
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
                className="p-1 rounded-md hover:bg-muted transition-colors"
                data-testid={`button-favorite-${property.id}`}
              >
                <Heart className={`h-4 w-4 ${property.favorito ? 'fill-destructive text-destructive' : 'text-muted-foreground'}`} />
              </button>
            </div>

            {/* Title */}
            <p className="text-sm font-medium text-foreground mb-1.5 line-clamp-1">
              {property.titulo}
            </p>

            {/* Location */}
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="line-clamp-1">{property.bairro ? `${property.bairro}, ` : ""}{property.cidade} - {property.uf}</span>
            </div>

            {/* Features */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {property.tipoImovel && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {property.tipoImovel}
                </span>
              )}
              {property.quartos && (
                <span className="flex items-center gap-1">
                  <Bed className="h-3 w-3" />
                  {property.quartos}
                </span>
              )}
              {property.garagem !== null && property.garagem !== undefined && (
                <span className="flex items-center gap-1">
                  <Car className="h-3 w-3" />
                  {property.garagem}
                </span>
              )}
              {property.areaTotal && (
                <span className="flex items-center gap-1">
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

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState({
    uf: "",
    cidade: "",
    tipoImovel: "",
    tipoVenda: "",
    orderBy: "desconto",
    descontoMin: "",
  });

  // Build query string from filters
  const queryString = Object.entries(filters)
    .filter(([_, v]) => v !== "" && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  const { data: properties, isLoading } = useQuery<Property[]>({
    queryKey: [`/api/properties${queryString ? `?${queryString}` : ""}`],
  });

  const { data: ufs } = useQuery<string[]>({ queryKey: ["/api/ufs"] });
  const { data: cidades } = useQuery<string[]>({
    queryKey: ["/api/cidades", filters.uf ? `?uf=${filters.uf}` : ""],
  });

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

      {/* Filters */}
      <Card className="border-card-border">
        <CardContent className="p-3.5">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <Select
              value={filters.uf || "all"}
              onValueChange={(v) => setFilters(f => ({ ...f, uf: v === "all" ? "" : v, cidade: "" }))}
            >
              <SelectTrigger className="text-sm" data-testid="select-uf">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Estados</SelectItem>
                {ufs?.map(uf => (
                  <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.cidade || "all"}
              onValueChange={(v) => setFilters(f => ({ ...f, cidade: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="text-sm" data-testid="select-cidade">
                <SelectValue placeholder="Cidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Cidades</SelectItem>
                {cidades?.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.tipoImovel || "all"}
              onValueChange={(v) => setFilters(f => ({ ...f, tipoImovel: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="text-sm" data-testid="select-tipo">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Tipos</SelectItem>
                <SelectItem value="Apartamento">Apartamento</SelectItem>
                <SelectItem value="Casa">Casa</SelectItem>
                <SelectItem value="Terreno">Terreno</SelectItem>
                <SelectItem value="Comercial">Comercial</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.tipoVenda || "all"}
              onValueChange={(v) => setFilters(f => ({ ...f, tipoVenda: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="text-sm" data-testid="select-modalidade">
                <SelectValue placeholder="Modalidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Modalidades</SelectItem>
                <SelectItem value="AUCTION">Leilão</SelectItem>
                <SelectItem value="DIRECT">Compra Direta</SelectItem>
                <SelectItem value="ONLINE">Venda Online</SelectItem>
                <SelectItem value="BID">Licitação</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.descontoMin || "all"}
              onValueChange={(v) => setFilters(f => ({ ...f, descontoMin: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="text-sm" data-testid="select-desconto">
                <SelectValue placeholder="Desconto Min." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer Desconto</SelectItem>
                <SelectItem value="20">20%+</SelectItem>
                <SelectItem value="30">30%+</SelectItem>
                <SelectItem value="40">40%+</SelectItem>
                <SelectItem value="50">50%+</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.orderBy || "desconto"}
              onValueChange={(v) => setFilters(f => ({ ...f, orderBy: v }))}
            >
              <SelectTrigger className="text-sm" data-testid="select-order">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desconto">Maior Desconto</SelectItem>
                <SelectItem value="preco">Menor Preço</SelectItem>
                <SelectItem value="score">Melhor Score</SelectItem>
                <SelectItem value="area">Maior Área</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Carregando..." : `${properties?.length || 0} imóveis encontrados`}
        </p>
      </div>

      {/* Property grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : properties && properties.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((prop) => (
            <PropertyCard key={prop.id} property={prop} />
          ))}
        </div>
      ) : (
        <Card className="border-card-border">
          <CardContent className="p-12 text-center">
            <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum imóvel encontrado com os filtros selecionados.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setFilters({ uf: "", cidade: "", tipoImovel: "", tipoVenda: "", orderBy: "desconto", descontoMin: "" })}
              data-testid="button-clear-filters"
            >
              Limpar Filtros
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
