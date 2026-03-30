import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Property } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  ArrowLeft, Building2, MapPin, Bed, Car, Ruler, Percent, Heart,
  Gavel, ShoppingCart, Globe, FileText, TrendingUp, DollarSign,
  Home, Key, Hammer, ArrowRightLeft, ExternalLink, CheckCircle, XCircle,
  Calendar, AlertTriangle, FileDown
} from "lucide-react";

function formatCurrency(value: number | null | undefined): string {
  if (!value && value !== 0) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (!value && value !== 0) return "—";
  return `${value.toFixed(1)}%`;
}

const tipoVendaConfig: Record<string, { label: string; icon: any; color: string }> = {
  AUCTION: { label: "Leilão", icon: Gavel, color: "bg-chart-1/10 text-chart-1" },
  DIRECT: { label: "Compra Direta", icon: ShoppingCart, color: "bg-chart-3/10 text-chart-3" },
  ONLINE: { label: "Venda Online", icon: Globe, color: "bg-chart-2/10 text-chart-2" },
  BID: { label: "Licitação", icon: FileText, color: "bg-chart-4/10 text-chart-4" },
};

function AnalysisCard({ title, icon: Icon, data, type }: {
  title: string;
  icon: any;
  data: any;
  type: "flip" | "reforma" | "aluguelLongo" | "aluguelCurto";
}) {
  const isViable = data.viable;
  const labelColor = data.label === "Excelente" ? "text-green-600 dark:text-green-400" :
    data.label === "Bom" ? "text-blue-600 dark:text-blue-400" :
    data.label === "Razoável" ? "text-yellow-600 dark:text-yellow-400" :
    "text-red-600 dark:text-red-400";

  return (
    <Card className="border-card-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${labelColor}`}>{data.label}</span>
            {isViable ? (
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {(type === "flip" || type === "reforma") && (
          <>
            <Row label="Custo Aquisição" value={formatCurrency(data.custoAquisicao)} />
            <Row label="Documentação (~5%)" value={formatCurrency(data.custoDocumentacao)} />
            {type === "reforma" && <Row label="Custo Reforma" value={formatCurrency(data.custoReforma)} />}
            <div className="border-t border-card-border my-2" />
            <Row label="Custo Total" value={formatCurrency(data.custoTotal)} bold />
            <Row label="Valor Venda Estimado" value={formatCurrency(data.valorVendaEstimado)} />
            <div className="border-t border-card-border my-2" />
            <Row
              label="Lucro Estimado"
              value={formatCurrency(data.lucroEstimado)}
              bold
              highlight={data.lucroEstimado > 0 ? "green" : "red"}
            />
            <Row
              label="ROI"
              value={formatPercent(data.roi)}
              bold
              highlight={data.roi >= 15 ? "green" : data.roi >= 5 ? "yellow" : "red"}
            />
            {type === "reforma" && <Row label="Prazo Estimado" value={`${data.prazoMeses} meses`} />}
          </>
        )}
        {(type === "aluguelLongo" || type === "aluguelCurto") && (
          <>
            <Row label="Custo Aquisição" value={formatCurrency(data.custoAquisicao || data.custoTotal - (data.custoMobilia || 0))} />
            {type === "aluguelCurto" && <Row label="Mobília" value={formatCurrency(data.custoMobilia)} />}
            <Row label="Custo Total" value={formatCurrency(data.custoTotal)} bold />
            <div className="border-t border-card-border my-2" />
            <Row label={type === "aluguelCurto" ? "Receita Mensal Bruta" : "Aluguel Mensal"} value={formatCurrency(data.aluguelMensal || data.receitaMensal)} />
            <Row label="Despesas Mensais" value={formatCurrency(data.despesasMensais)} />
            <Row label="Receita Líquida/mês" value={formatCurrency(data.receitaLiquida)} bold highlight={data.receitaLiquida > 0 ? "green" : "red"} />
            <div className="border-t border-card-border my-2" />
            <Row
              label="Yield Anual"
              value={formatPercent(data.yieldAnual)}
              bold
              highlight={data.yieldAnual >= 8 ? "green" : data.yieldAnual >= 5 ? "yellow" : "red"}
            />
            <Row label="Payback" value={data.paybackMeses >= 999 ? "N/A" : `${data.paybackMeses} meses`} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold, highlight }: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: "green" | "red" | "yellow";
}) {
  const colorClass = highlight === "green" ? "text-green-600 dark:text-green-400" :
    highlight === "red" ? "text-red-600 dark:text-red-400" :
    highlight === "yellow" ? "text-yellow-600 dark:text-yellow-400" : "";

  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${bold ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
      <span className={`text-sm tabular-nums ${bold ? "font-semibold" : "font-medium"} ${colorClass}`}>{value}</span>
    </div>
  );
}

export default function PropertyDetail() {
  const [, params] = useRoute("/property/:id");
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const propertyId = params?.id;

  const { data, isLoading } = useQuery<{
    property: Property;
    market: any[];
    analysis: any;
  }>({
    queryKey: ["/api/properties", propertyId],
    enabled: !!propertyId,
  });

  if (data?.property && !notesLoaded) {
    setNotes(data.property.notas || "");
    setNotesLoaded(true);
  }

  const favoriteMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/properties/${propertyId}/favorite`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
    },
  });

  const notesMutation = useMutation({
    mutationFn: (notas: string) => apiRequest("PATCH", `/api/properties/${propertyId}/notes`, { notas }),
    onSuccess: () => {
      toast({ title: "Notas salvas", description: "Suas anotações foram atualizadas." });
      queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-lg" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { property, analysis } = data;
  const config = tipoVendaConfig[property.tipoVenda] || tipoVendaConfig.AUCTION;
  const VendaIcon = config.icon;

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <Link href="/">
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        </Link>
      </div>

      {/* Property Info Card */}
      <Card className="border-card-border">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row gap-5">
            {/* Image */}
            <div className="w-full md:w-64 h-48 bg-muted rounded-lg overflow-hidden shrink-0">
              {property.urlImagem ? (
                <img
                  src={property.urlImagem}
                  alt={property.titulo}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Building2 className="h-12 w-12 text-muted-foreground/30" />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className={`text-xs font-medium ${config.color}`}>
                      <VendaIcon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                    {property.aceitaFGTS === 1 && <Badge variant="outline" className="text-xs">FGTS</Badge>}
                    {property.aceitaFinanciamento === 1 && <Badge variant="outline" className="text-xs">Financiamento</Badge>}
                  </div>
                  <h2 className="text-lg font-semibold" data-testid="text-property-title">{property.titulo}</h2>
                </div>
                <button
                  onClick={() => favoriteMutation.mutate()}
                  className="p-2 rounded-md hover:bg-muted transition-colors"
                  data-testid="button-favorite"
                >
                  <Heart className={`h-5 w-5 ${property.favorito ? 'fill-destructive text-destructive' : 'text-muted-foreground'}`} />
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {property.endereco}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <InfoPill icon={Building2} label="Tipo" value={property.tipoImovel} />
                {property.quartos && <InfoPill icon={Bed} label="Quartos" value={property.quartos.toString()} />}
                {property.garagem !== null && property.garagem !== undefined && <InfoPill icon={Car} label="Garagem" value={property.garagem.toString()} />}
                {property.areaTotal && <InfoPill icon={Ruler} label="Área" value={`${property.areaTotal}m²`} />}
              </div>

              {/* Prices */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-card-border">
                {property.valorAvaliacao && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Avaliação</span>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(property.valorAvaliacao)}</span>
                  </div>
                )}
                {property.valorMinVenda1Leilao && (
                  <div>
                    <span className="text-xs text-muted-foreground block">1° Leilão</span>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(property.valorMinVenda1Leilao)}</span>
                  </div>
                )}
                {property.valorMinVenda2Leilao && (
                  <div>
                    <span className="text-xs text-muted-foreground block">2° Leilão</span>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(property.valorMinVenda2Leilao)}</span>
                  </div>
                )}
                {property.desconto && (
                  <div>
                    <span className="text-xs text-muted-foreground block">Desconto</span>
                    <span className="text-sm font-semibold tabular-nums text-destructive">{formatPercent(property.desconto)}</span>
                  </div>
                )}
              </div>

              {/* Links */}
              <div className="flex flex-wrap gap-2 pt-2">
                {property.linkImovel && (
                  <a href={property.linkImovel} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Ver na Caixa
                    </Button>
                  </a>
                )}
                {property.linkEdital && (
                  <a href={property.linkEdital} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <FileDown className="h-3.5 w-3.5 mr-1" />
                      Edital
                    </Button>
                  </a>
                )}
                {property.linkMatricula && (
                  <a href={property.linkMatricula} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <FileDown className="h-3.5 w-3.5 mr-1" />
                      Matrícula
                    </Button>
                  </a>
                )}
              </div>

              {/* Dates */}
              {(property.dataLeilao1 || property.dataLeilao2) && (
                <div className="flex items-center gap-3 pt-2 border-t border-card-border text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  {property.dataLeilao1 && <span>1° Leilão: <strong>{property.dataLeilao1}</strong></span>}
                  {property.dataLeilao2 && <span>2° Leilão: <strong>{property.dataLeilao2}</strong></span>}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financial Analysis Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" data-testid="tab-overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="venda" data-testid="tab-venda">Venda (FLIP / Reforma)</TabsTrigger>
          <TabsTrigger value="aluguel" data-testid="tab-aluguel">Aluguel</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard
              icon={ArrowRightLeft}
              title="FLIP"
              roi={analysis.flip.roi}
              label={analysis.flip.label}
              viable={analysis.flip.viable}
            />
            <SummaryCard
              icon={Hammer}
              title="Reforma + Venda"
              roi={analysis.reforma.roi}
              label={analysis.reforma.label}
              viable={analysis.reforma.viable}
            />
            <SummaryCard
              icon={Key}
              title="Aluguel Longo"
              roi={analysis.aluguelLongo.yieldAnual}
              label={analysis.aluguelLongo.label}
              viable={analysis.aluguelLongo.viable}
              isYield
            />
            <SummaryCard
              icon={Home}
              title="Aluguel Curto"
              roi={analysis.aluguelCurto.yieldAnual}
              label={analysis.aluguelCurto.label}
              viable={analysis.aluguelCurto.viable}
              isYield
            />
          </div>

          {/* Disclaimer */}
          <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10">
            <CardContent className="p-3.5 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-700 dark:text-yellow-300 leading-relaxed">
                Os valores são estimativas baseadas em dados de mercado disponíveis. Custos reais podem variar.
                Considere custos adicionais como advogado, desocupação, dívidas de IPTU/condomínio e comissões.
                Faça sua própria due diligence antes de investir.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="venda" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnalysisCard title="FLIP (Compra e Revenda)" icon={ArrowRightLeft} data={analysis.flip} type="flip" />
            <AnalysisCard title="Reforma + Venda" icon={Hammer} data={analysis.reforma} type="reforma" />
          </div>
        </TabsContent>

        <TabsContent value="aluguel" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnalysisCard title="Aluguel Longo Prazo" icon={Key} data={analysis.aluguelLongo} type="aluguelLongo" />
            <AnalysisCard title="Aluguel Curto Prazo (Airbnb)" icon={Home} data={analysis.aluguelCurto} type="aluguelCurto" />
          </div>
        </TabsContent>
      </Tabs>

      {/* Notes */}
      <Card className="border-card-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Minhas Notas</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Adicione suas anotações sobre este imóvel..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[80px] mb-2 text-sm"
            data-testid="input-notes"
          />
          <Button
            size="sm"
            onClick={() => notesMutation.mutate(notes)}
            disabled={notesMutation.isPending}
            data-testid="button-save-notes"
          >
            {notesMutation.isPending ? "Salvando..." : "Salvar Notas"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoPill({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SummaryCard({ icon: Icon, title, roi, label, viable, isYield }: {
  icon: any;
  title: string;
  roi: number;
  label: string;
  viable: boolean;
  isYield?: boolean;
}) {
  const bgColor = viable ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800" :
    roi >= 5 ? "bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800" :
    "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800";

  const textColor = viable ? "text-green-700 dark:text-green-400" :
    roi >= 5 ? "text-yellow-700 dark:text-yellow-400" :
    "text-red-700 dark:text-red-400";

  return (
    <Card className={`${bgColor}`}>
      <CardContent className="p-3.5 text-center">
        <Icon className={`h-5 w-5 mx-auto mb-1 ${textColor}`} />
        <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
        <p className={`text-lg font-bold tabular-nums ${textColor}`}>
          {roi.toFixed(1)}%
        </p>
        <p className="text-xs text-muted-foreground">{isYield ? "Yield/ano" : "ROI"}</p>
        <Badge variant="secondary" className={`mt-1.5 text-xs ${textColor}`}>
          {label}
        </Badge>
      </CardContent>
    </Card>
  );
}
