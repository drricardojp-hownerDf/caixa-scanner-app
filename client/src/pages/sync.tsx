import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { useApifyToken } from "@/hooks/use-apify-token";
import {
  RefreshCw, Key, MapPin, Settings, CheckCircle, AlertCircle,
  Loader2, Database, Trash2, ExternalLink, Info, Zap, ShieldCheck
} from "lucide-react";

const ESTADOS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA",
  "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO"
];

interface SyncStatus {
  status: "idle" | "running" | "completed" | "error";
  message: string;
  progress?: number;
  total?: number;
}

export default function SyncPage() {
  const { toast } = useToast();
  const { token, setToken, hasToken } = useApifyToken();
  const [estado, setEstado] = useState("SP");
  const [cidade, setCidade] = useState("");
  const [modalidade, setModalidade] = useState("");
  const [polling, setPolling] = useState(false);

  // Poll sync status when running
  const { data: syncStatus } = useQuery<SyncStatus>({
    queryKey: ["/api/sync/status"],
    refetchInterval: polling ? 3000 : false,
  });

  // Stop polling when sync completes
  useEffect(() => {
    if (syncStatus && (syncStatus.status === "completed" || syncStatus.status === "error" || syncStatus.status === "idle")) {
      if (polling) {
        setPolling(false);
        if (syncStatus.status === "completed") {
          queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
          queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/ufs"] });
          queryClient.invalidateQueries({ queryKey: ["/api/cidades"] });
          toast({ title: "Sincronização concluída", description: syncStatus.message });
        } else if (syncStatus.status === "error") {
          toast({ title: "Erro na sincronização", description: syncStatus.message, variant: "destructive" });
        }
      }
    }
  }, [syncStatus, polling]);

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sync", {
      token: token.trim(),
      estado,
      cidade: cidade || undefined,
      modalidade: modalidade || undefined,
    }),
    onSuccess: () => {
      setPolling(true);
      toast({ title: "Sincronização iniciada", description: `Buscando imóveis em ${estado}...` });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/properties"),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Dados limpos",
        description: `${data.deleted} imóveis removidos. ${data.kept} favoritos mantidos.`,
      });
    },
  });

  const isRunning = syncStatus?.status === "running" || polling;

  return (
    <div className="p-4 md:p-6 max-w-[800px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-lg font-semibold">Sincronizar Dados</h1>
          <p className="text-sm text-muted-foreground">Buscar imóveis reais da Caixa Econômica Federal</p>
        </div>
      </div>

      {/* How it works */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">Como funciona</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Crie uma conta gratuita no <a href="https://apify.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Apify.com</a></li>
                <li>Copie seu <strong>API Token</strong> em Configurações &rarr; Integrações</li>
                <li>Cole o token abaixo e selecione o estado</li>
                <li>Clique em "Buscar Imóveis" e aguarde (1-3 minutos)</li>
              </ol>
              <p className="text-xs text-muted-foreground">A conta gratuita do Apify permite ~25 execuções/mês. Cada execução busca imóveis de um estado.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Token */}
      <Card className="border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Key className="h-4 w-4" />
            Token da API Apify
            {hasToken && (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-green-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                Salvo
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="token" className="text-xs text-muted-foreground">
              Cole seu token aqui — ele fica salvo no seu navegador. Você só precisa fazer isso uma vez.
            </Label>
            <Input
              id="token"
              type="password"
              placeholder="apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1.5 font-mono text-sm"
              data-testid="input-token"
            />
          </div>
          <a
            href="https://console.apify.com/account/integrations"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Abrir página do token no Apify
          </a>
        </CardContent>
      </Card>

      {/* Search Filters */}
      <Card className="border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Filtros de Busca
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Estado (obrigatório)</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger className="mt-1" data-testid="select-sync-estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map(uf => (
                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Cidade (opcional)</Label>
              <Input
                placeholder="Ex: SAO PAULO"
                value={cidade}
                onChange={(e) => setCidade(e.target.value.toUpperCase())}
                className="mt-1 text-sm"
                data-testid="input-sync-cidade"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Modalidade (opcional)</Label>
              <Select value={modalidade || "all"} onValueChange={(v) => setModalidade(v === "all" ? "" : v)}>
                <SelectTrigger className="mt-1" data-testid="select-sync-modalidade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="auction">Leilão</SelectItem>
                  <SelectItem value="direct">Compra Direta</SelectItem>
                  <SelectItem value="online">Venda Online</SelectItem>
                  <SelectItem value="bid">Licitação</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Sync Status */}
          {isRunning && syncStatus && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium">{syncStatus.message}</span>
              </div>
              {syncStatus.progress && syncStatus.total && (
                <Progress value={(syncStatus.progress / syncStatus.total) * 100} className="h-1.5" />
              )}
            </div>
          )}

          {syncStatus?.status === "completed" && !polling && (
            <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              {syncStatus.message}
            </div>
          )}

          {syncStatus?.status === "error" && !polling && (
            <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4" />
              {syncStatus.message}
            </div>
          )}

          <Button
            onClick={() => syncMutation.mutate()}
            disabled={!token.trim() || !estado || isRunning}
            className="w-full"
            data-testid="button-sync"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Buscar Imóveis
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Database Management */}
      <Card className="border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" />
            Gerenciar Dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Limpe os dados de exemplo ou dados antigos antes de sincronizar novos imóveis.
            Imóveis marcados como favorito serão mantidos.
          </p>
          <Button
            variant="outline"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            className="text-destructive hover:text-destructive"
            data-testid="button-clear-data"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {clearMutation.isPending ? "Limpando..." : "Limpar Dados (manter favoritos)"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
