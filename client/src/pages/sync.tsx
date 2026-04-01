import { useState, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useApifyToken } from "@/hooks/use-apify-token";
import {
  Key, Database, Trash2, ExternalLink, ShieldCheck, AlertCircle,
  Upload, FileSpreadsheet, CheckCircle2, Loader2, ChevronDown,
  ChevronRight, Globe, ArrowRight, FileUp, X, File, Smartphone
} from "lucide-react";

interface FileResult {
  filename: string;
  imported: number;
  updated: number;
  errors: number;
  status: "pending" | "uploading" | "done" | "error";
}

interface BatchResult {
  files: Array<{ filename: string; imported: number; updated: number; errors: number }>;
  totals: { imported: number; updated: number; errors: number; total: number };
  message: string;
}

export default function SyncPage() {
  const { toast } = useToast();
  const { token, setToken, hasToken } = useApifyToken();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [batchDone, setBatchDone] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showApify, setShowApify] = useState(false);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/ufs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/cidades"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sync/last"] });
  };

  const addFiles = useCallback((files: FileList | File[]) => {
    const csvFiles = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith(".csv")
    );
    if (csvFiles.length === 0) {
      toast({ title: "Formato inválido", description: "Selecione arquivos .csv", variant: "destructive" });
      return;
    }
    setSelectedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const newFiles = csvFiles.filter((f) => !existing.has(f.name));
      return [...prev, ...newFiles];
    });
    setBatchDone(false);
    setFileResults([]);
  }, [toast]);

  const removeFile = (name: string) => {
    setSelectedFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  }, [addFiles]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
    // Reset input so the same files can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const [uploadStatus, setUploadStatus] = useState("");

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    setBatchDone(false);
    setUploadStatus("Enviando arquivos...");
    setFileResults(selectedFiles.map((f) => ({
      filename: f.name, imported: 0, updated: 0, errors: 0, status: "uploading" as const,
    })));

    // Generous timeout: 3 minutes for large files (29K+ rows)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180_000);

    try {
      const formData = new FormData();
      const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
      for (const file of selectedFiles) {
        formData.append("files", file);
      }

      setUploadStatus(
        totalSize > 5 * 1024 * 1024
          ? "Processando arquivo grande... isso pode levar até 2 minutos"
          : "Processando..."
      );

      const res = await fetch("/api/import-csv-batch", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        let errorMsg = `Erro do servidor (${res.status})`;
        try {
          const err = await res.json();
          errorMsg = err.error || err.message || errorMsg;
        } catch {
          // Response wasn't JSON — use status text
          errorMsg = `Erro do servidor: ${res.status} ${res.statusText}`;
        }
        throw new Error(errorMsg);
      }

      const data: BatchResult = await res.json();

      setFileResults(
        data.files.map((f) => ({
          ...f,
          status: f.errors > 0 && f.imported === 0 && f.updated === 0 ? "error" as const : "done" as const,
        }))
      );

      setBatchDone(true);
      invalidateAll();
      toast({ title: "Importação concluída", description: data.message });
    } catch (err: any) {
      clearTimeout(timeoutId);
      let description = err.message;
      if (err.name === "AbortError") {
        description = "A importação demorou demais e foi cancelada. Tente com menos registros ou verifique sua conexão.";
      } else if (err.message === "Failed to fetch" || err.message === "Load failed") {
        description = "Falha na conexão com o servidor. Verifique sua internet e tente novamente.";
      }
      toast({ title: "Erro na importação", description, variant: "destructive" });
      setFileResults((prev) => prev.map((f) => ({ ...f, status: "error" as const })));
    } finally {
      setIsUploading(false);
      setUploadStatus("");
    }
  };

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/properties"),
    onSuccess: async (res) => {
      const data = await res.json();
      invalidateAll();
      toast({
        title: "Dados limpos",
        description: `${data.deleted} imóveis removidos. ${data.kept} favoritos mantidos.`,
      });
    },
  });

  const totalResults = fileResults.reduce(
    (acc, f) => ({
      imported: acc.imported + f.imported,
      updated: acc.updated + f.updated,
      errors: acc.errors + f.errors,
    }),
    { imported: 0, updated: 0, errors: 0 }
  );

  const uploadProgress = fileResults.length > 0
    ? (fileResults.filter((f) => f.status === "done" || f.status === "error").length / fileResults.length) * 100
    : 0;

  return (
    <div className="p-4 md:p-6 max-w-[600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-10 w-10 min-h-[44px] min-w-[44px]" />
        <div>
          <h1 className="text-lg font-semibold">Sincronizar</h1>
          <p className="text-sm text-muted-foreground">Importar imóveis da Caixa Econômica Federal</p>
        </div>
      </div>

      {/* Section 1: Sincronizar com a Caixa — Step-by-step */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Sincronizar com a Caixa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1 */}
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">1</span>
            <div className="space-y-2 flex-1">
              <p className="text-sm font-medium">Abra o site da Caixa</p>
              <p className="text-xs text-muted-foreground">
                Acesse a página de download de imóveis. Se aparecer um CAPTCHA, resolva-o normalmente.
              </p>
              <a
                href="https://venda-imoveis.caixa.gov.br/sistema/download-lista.asp"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="min-h-[44px]">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir Site da Caixa
                  <ArrowRight className="h-3 w-3 ml-2" />
                </Button>
              </a>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">2</span>
            <div>
              <p className="text-sm font-medium">Baixe os CSVs</p>
              <p className="text-xs text-muted-foreground">
                Selecione <strong>"Todos"</strong> para baixar todos os estados, ou escolha estados individuais. Clique em <strong>"Próximo"</strong> para baixar.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-3">
            <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">3</span>
            <div>
              <p className="text-sm font-medium">Faça upload aqui</p>
              <p className="text-xs text-muted-foreground">
                Arraste os arquivos ou use o botão abaixo. Aceita múltiplos arquivos de uma vez.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Area */}
      <Card className="border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileUp className="h-4 w-4" />
            Upload de Arquivos CSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Drag and drop zone */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
              ${dragActive
                ? "border-primary bg-primary/10"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
            <Upload className={`h-8 w-8 mx-auto mb-2 ${dragActive ? "text-primary" : "text-muted-foreground/50"}`} />
            <p className="text-sm font-medium">
              {dragActive ? "Solte os arquivos aqui" : "Arraste CSVs aqui ou toque para selecionar"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Aceita múltiplos arquivos .csv
            </p>
          </div>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">
                {selectedFiles.length} arquivo(s) selecionado(s)
              </p>
              {selectedFiles.map((file) => {
                const result = fileResults.find((r) => r.filename === file.name);
                return (
                  <div
                    key={file.name}
                    className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm"
                  >
                    <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-xs">{file.name}</span>
                    {result?.status === "done" && (
                      <span className="text-xs text-green-600 shrink-0">
                        {result.imported + result.updated} imóveis
                      </span>
                    )}
                    {result?.status === "error" && (
                      <span className="text-xs text-destructive shrink-0">Erro</span>
                    )}
                    {result?.status === "uploading" && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                    )}
                    {!isUploading && !batchDone && (
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(file.name); }}
                        className="p-0.5 rounded hover:bg-muted"
                      >
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Progress bar during upload */}
          {isUploading && (
            <div className="space-y-1.5">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {uploadStatus || "Importando..."}
              </p>
            </div>
          )}

          {/* Upload button */}
          {selectedFiles.length > 0 && !batchDone && (
            <Button
              onClick={uploadFiles}
              disabled={isUploading}
              className="w-full min-h-[44px]"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importando {selectedFiles.length} arquivo(s)...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar {selectedFiles.length} arquivo(s)
                </>
              )}
            </Button>
          )}

          {/* Results summary */}
          {batchDone && (
            <div className="p-3 bg-green-50 dark:bg-green-900/10 rounded-lg space-y-2" data-testid="panel-upload-success">
              <div className="flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium" data-testid="text-upload-result">
                    ✓ {totalResults.imported + totalResults.updated} imóveis recebidos e armazenados. Acesse o Painel e use os filtros para visualizar.
                  </p>
                  <p className="text-xs">
                    {totalResults.imported} novos, {totalResults.updated} atualizados
                    {totalResults.errors > 0 ? `, ${totalResults.errors} erros` : ""}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full min-h-[44px]"
                onClick={() => {
                  setSelectedFiles([]);
                  setFileResults([]);
                  setBatchDone(false);
                }}
                data-testid="button-import-more"
              >
                Importar mais arquivos
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Apify (Avançado — collapsed) */}
      <Collapsible open={showApify} onOpenChange={setShowApify}>
        <Card className="border-card-border">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Key className="h-4 w-4" />
                Avançado — Sincronizar via Apify
                {showApify ? (
                  <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground" />
                )}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Método alternativo usando a API do Apify para buscar imóveis automaticamente.
                Requer uma conta gratuita no Apify.com.
              </p>
              <div>
                <Label htmlFor="token" className="text-xs text-muted-foreground">
                  Token da API Apify
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
                  Token salvo. Use o Painel para iniciar uma busca via Apify.
                </div>
              )}
              {!hasToken && (
                <div className="p-2.5 bg-amber-50 dark:bg-amber-900/10 rounded-lg flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4" />
                  Sem token configurado.
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
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* iOS Shortcut tip */}
      <a href="/#/shortcut" className="block">
        <Card className="border-card-border hover:bg-muted/50 transition-colors cursor-pointer">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Dica: Crie um Atalho do iOS para sincronizar com um toque</p>
                <p className="text-xs text-muted-foreground">Veja o passo a passo</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          </CardContent>
        </Card>
      </a>

      {/* Section 4: Gerenciar Dados */}
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
            className="text-destructive hover:text-destructive min-h-[44px]"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {clearMutation.isPending ? "Limpando..." : "Limpar Dados (manter favoritos)"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
