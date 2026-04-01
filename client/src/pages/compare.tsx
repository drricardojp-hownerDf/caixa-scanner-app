import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Property } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Building2, ArrowRightLeft, X, ExternalLink, Search,
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

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toString();
}

interface PaginatedResult {
  data: Property[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ComparisonRow {
  label: string;
  key: string;
  getValue: (p: Property) => string | number | null;
  format?: "currency" | "percent" | "number" | "text";
  bestIs?: "min" | "max";
}

const comparisonRows: ComparisonRow[] = [
  { label: "Preço", key: "preco", getValue: (p) => p.valorMinVenda, format: "currency", bestIs: "min" },
  { label: "Valor de Avaliação", key: "avaliacao", getValue: (p) => p.valorAvaliacao, format: "currency", bestIs: "max" },
  { label: "Desconto (%)", key: "desconto", getValue: (p) => p.desconto, format: "percent", bestIs: "max" },
  { label: "Tipo do Imóvel", key: "tipo", getValue: (p) => p.tipoImovel, format: "text" },
  { label: "Localização", key: "localizacao", getValue: (p) => `${p.cidade} - ${p.uf}`, format: "text" },
  { label: "Bairro", key: "bairro", getValue: (p) => p.bairro, format: "text" },
  { label: "Área Total", key: "area", getValue: (p) => p.areaTotal, format: "number", bestIs: "max" },
  { label: "Quartos", key: "quartos", getValue: (p) => p.quartos, format: "number", bestIs: "max" },
  { label: "Garagem", key: "garagem", getValue: (p) => p.garagem, format: "number", bestIs: "max" },
  { label: "Modalidade", key: "modalidade", getValue: (p) => p.tipoVenda, format: "text" },
  { label: "Aceita Financiamento", key: "financiamento", getValue: (p) => p.aceitaFinanciamento === 1 ? "Sim" : "Não", format: "text" },
  { label: "Score Geral", key: "scoreGeral", getValue: (p) => p.scoreGeral, format: "number", bestIs: "max" },
  { label: "Score FLIP", key: "scoreFLIP", getValue: (p) => p.scoreFLIP, format: "number", bestIs: "max" },
  { label: "Score Reforma", key: "scoreReforma", getValue: (p) => p.scoreReforma, format: "number", bestIs: "max" },
  { label: "Score Aluguel", key: "scoreAluguel", getValue: (p) => p.scoreAluguel, format: "number", bestIs: "max" },
];

function formatValue(value: string | number | null, format?: string): string {
  if (value === null || value === undefined) return "—";
  if (format === "currency") return formatCurrency(typeof value === "number" ? value : null);
  if (format === "percent") return formatPercent(typeof value === "number" ? value : null);
  if (format === "number") {
    if (typeof value === "number") return value % 1 === 0 ? value.toString() : value.toFixed(1);
    return String(value);
  }
  return String(value);
}

function findBestIndex(values: (string | number | null)[], bestIs?: "min" | "max"): number | null {
  if (!bestIs) return null;
  let bestIdx: number | null = null;
  let bestVal: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v !== "number" || v === null) continue;
    if (bestVal === null) {
      bestVal = v;
      bestIdx = i;
    } else if (bestIs === "max" && v > bestVal) {
      bestVal = v;
      bestIdx = i;
    } else if (bestIs === "min" && v < bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export default function ComparePage() {
  const queryClient = useQueryClient();

  const { data: result, isLoading } = useQuery<PaginatedResult>({
    queryKey: ["/api/properties?favoritos=true&pageSize=5"],
  });

  const properties = result?.data || [];

  const handleRemoveFavorite = async (id: number) => {
    await apiRequest("POST", `/api/properties/${id}/favorite`);
    queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
  };

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SidebarTrigger data-testid="button-sidebar-trigger" className="h-10 w-10 min-h-[44px] min-w-[44px]" />
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Comparar Imóveis
          </h1>
          <p className="text-sm text-muted-foreground">
            Compare seus imóveis favoritos lado a lado (máx. 5)
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : properties.length === 0 ? (
        <Card className="border-card-border">
          <CardContent className="p-12 text-center">
            <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2" data-testid="text-no-favorites">
              Nenhum imóvel favoritado para comparação.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Favorite imóveis no Painel clicando no ícone de coração para compará-los aqui.
            </p>
            <Link href="/">
              <Button variant="outline" size="sm" className="min-h-[44px]" data-testid="button-go-dashboard">
                Ir para o Painel
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-card-border overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]" data-testid="table-compare">
                {/* Header row with property titles */}
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 text-xs font-medium text-muted-foreground bg-muted/50 sticky left-0 z-10 min-w-[140px]">
                      Atributo
                    </th>
                    {properties.map((prop) => (
                      <th key={prop.id} className="p-3 text-center min-w-[180px]">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-center gap-1">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold line-clamp-2" data-testid={`text-compare-title-${prop.id}`}>
                              {prop.titulo}
                            </span>
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <Link href={`/property/${prop.id}`}>
                              <Button variant="ghost" size="sm" className="text-xs h-8 min-h-[44px] px-2" data-testid={`button-detail-${prop.id}`}>
                                <ExternalLink className="h-3 w-3 mr-1" />
                                Detalhes
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-8 min-h-[44px] px-2 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveFavorite(prop.id)}
                              data-testid={`button-remove-compare-${prop.id}`}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => {
                    const values = properties.map((p) => row.getValue(p));
                    const bestIdx = findBestIndex(values, row.bestIs);
                    return (
                      <tr key={row.key} className="border-b last:border-b-0 hover:bg-muted/30">
                        <td className="p-3 text-xs font-medium text-muted-foreground bg-muted/50 sticky left-0 z-10" data-testid={`label-row-${row.key}`}>
                          {row.label}
                        </td>
                        {properties.map((prop, idx) => (
                          <td
                            key={prop.id}
                            className={`p-3 text-center text-sm tabular-nums ${
                              bestIdx === idx ? "bg-green-50 dark:bg-green-900/20 font-semibold text-green-700 dark:text-green-400" : ""
                            }`}
                            data-testid={`cell-${row.key}-${prop.id}`}
                          >
                            {formatValue(values[idx], row.format)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {/* Link row */}
                  <tr className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="p-3 text-xs font-medium text-muted-foreground bg-muted/50 sticky left-0 z-10">
                      Link detalhes
                    </td>
                    {properties.map((prop) => (
                      <td key={prop.id} className="p-3 text-center">
                        <Link href={`/property/${prop.id}`}>
                          <Button variant="outline" size="sm" className="text-xs min-h-[44px]" data-testid={`button-view-${prop.id}`}>
                            Ver imóvel
                          </Button>
                        </Link>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
