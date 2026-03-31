import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { useApifyToken } from "@/hooks/use-apify-token";
import {
  Key, Database, Trash2, ExternalLink, ShieldCheck, Info, AlertCircle
} from "lucide-react";

export default function SyncPage() {
  const { toast } = useToast();
  const { token, setToken, hasToken } = useApifyToken();

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

  return (
    <div className="p-4 md:p-6 max-w-[600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-10 w-10 min-h-[44px] min-w-[44px]" />
        <div>
          <h1 className="text-lg font-semibold">Configurações</h1>
          <p className="text-sm text-muted-foreground">Token da API e gerenciamento de dados</p>
        </div>
      </div>

      {/* Info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">Como funciona</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Crie uma conta gratuita no <a href="https://apify.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">Apify.com</a></li>
                <li>Copie seu <strong>API Token</strong> na página de <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" className="text-primary underline">Integrações</a></li>
                <li>Cole o token abaixo — ele fica salvo no seu navegador</li>
                <li>Volte ao <strong>Painel</strong> e use o botão <strong>Atualizar</strong></li>
              </ol>
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
              Cole seu token aqui — ele fica salvo no seu navegador automaticamente.
            </Label>
            <Input
              id="token"
              type="password"
              placeholder="apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1.5 font-mono text-sm"
            />
          </div>
          {hasToken && (
            <div className="p-2.5 bg-green-50 dark:bg-green-900/10 rounded-lg flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
              <ShieldCheck className="h-4 w-4" />
              Token salvo com sucesso. Volte ao Painel para buscar imóveis.
            </div>
          )}
          {!hasToken && (
            <div className="p-2.5 bg-amber-50 dark:bg-amber-900/10 rounded-lg flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              Sem token. Cole acima para habilitar a busca de imóveis.
            </div>
          )}
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
            Limpe os dados antigos ou de exemplo. Imóveis marcados como favorito serão mantidos.
          </p>
          <Button
            variant="outline"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {clearMutation.isPending ? "Limpando..." : "Limpar Dados (manter favoritos)"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
