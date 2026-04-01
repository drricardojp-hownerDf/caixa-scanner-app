import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ArrowLeft, Smartphone, Lightbulb, Info } from "lucide-react";

const steps = [
  {
    title: 'Passo 1 — Abrir URL',
    search: 'Abrir URL',
    description: (
      <>
        Pesquise por <strong>"Abrir URL"</strong> e adicione a ação. Defina a URL como:
        <code className="block mt-1.5 p-2 bg-muted rounded text-xs break-all">
          https://venda-imoveis.caixa.gov.br/sistema/download-lista.asp
        </code>
        <span className="block mt-1 text-xs text-muted-foreground">
          Isso abre o Safari na página de download da Caixa, onde você seleciona o estado e baixa o CSV.
        </span>
      </>
    ),
  },
  {
    title: 'Passo 2 — Aguardar Retorno',
    search: 'Aguardar Retorno',
    description: (
      <>
        Pesquise por <strong>"Aguardar Retorno"</strong> e adicione a ação. Nenhuma configuração necessária.
        <span className="block mt-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-xs">
          <strong>ℹ Importante:</strong> Depois de baixar o CSV no Safari, volte ao app Atalhos — o atalho continuará automaticamente.
        </span>
      </>
    ),
  },
  {
    title: 'Passo 3 — Selecionar Arquivo',
    search: 'Selecionar Arquivo',
    description: (
      <>
        Pesquise por <strong>"Selecionar Arquivo"</strong> e adicione a ação. Ative o toggle{" "}
        <strong>"Selecionar Múltiplos"</strong> para poder importar vários CSVs de uma vez.
      </>
    ),
  },
  {
    title: 'Passo 4 — Obter Conteúdo do URL',
    search: 'Obter Conteúdo do URL',
    description: (
      <>
        Pesquise por <strong>"Obter Conteúdo do URL"</strong> e adicione a ação. Esta é a etapa mais detalhada — configure assim:
        <ol className="mt-2 space-y-1.5 text-xs text-muted-foreground list-none">
          <li className="flex gap-2">
            <span className="font-bold text-foreground shrink-0">1.</span>
            <span>
              Defina <strong className="text-foreground">URL</strong> como:{" "}
              <code className="bg-muted px-1 py-0.5 rounded break-all">
                https://caixa-scanner-production-f24a.up.railway.app/api/import-csv-batch
              </code>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-foreground shrink-0">2.</span>
            <span>
              Altere <strong className="text-foreground">Método</strong> para: <strong className="text-foreground">POST</strong>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-foreground shrink-0">3.</span>
            <span>
              Defina <strong className="text-foreground">Corpo da Requisição</strong> como: <strong className="text-foreground">Formulário</strong>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-foreground shrink-0">4.</span>
            <span>
              Toque em <strong className="text-foreground">"Adicionar Novo Campo"</strong>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-foreground shrink-0">5.</span>
            <span>
              Defina a chave como: <code className="bg-muted px-1 py-0.5 rounded">files</code>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold text-foreground shrink-0">6.</span>
            <span>
              No valor, toque e selecione a variável <strong className="text-foreground">"Arquivos Selecionados"</strong> do Passo 3
            </span>
          </li>
        </ol>
      </>
    ),
  },
  {
    title: 'Passo 5 — Mostrar Conteúdo',
    search: 'Mostrar Conteúdo',
    description: (
      <>
        Pesquise por <strong>"Mostrar Conteúdo"</strong> e adicione a ação. Nenhuma configuração necessária — ela exibe automaticamente a resposta do servidor com o total de imóveis importados.
        <span className="block mt-1 text-xs text-muted-foreground italic">
          Nota: no iOS 26 essa ação se chama "Mostrar Conteúdo" (antes era "Mostrar Resultado").
        </span>
      </>
    ),
  },
];

export default function ShortcutGuidePage() {
  return (
    <div className="p-4 md:p-6 max-w-[600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-10 w-10 min-h-[44px] min-w-[44px]" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold">Atalho iOS — Importação Rápida</h1>
          <p className="text-sm text-muted-foreground">Crie um atalho para sincronizar com um toque</p>
        </div>
      </div>

      {/* Back button */}
      <Link href="/">
        <Button variant="ghost" size="sm" className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao Painel
        </Button>
      </Link>

      {/* Intro */}
      <p className="text-sm text-muted-foreground">
        Este atalho automatiza o processo: abre o site da Caixa, aguarda você baixar o CSV, e importa automaticamente para o app. São apenas <strong className="text-foreground">5 passos simples</strong>.
      </p>

      {/* Compatibility note */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <span>Compatível com <strong className="text-foreground">iOS 26+</strong> — nomes das ações atualizados para a interface Liquid Glass.</span>
      </div>

      {/* Steps */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Passo a passo
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Abra o app <strong>Atalhos</strong> → toque <strong>+</strong> → nomeie como <strong>"Caixa Scanner Sync"</strong> e adicione as ações abaixo.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="flex items-center justify-center h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div className="space-y-1 flex-1 min-w-0">
                <p className="text-sm font-medium">{step.title}</p>
                <div className="text-xs text-muted-foreground">{step.description}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Tips */}
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10">
        <CardContent className="pt-4 pb-4 space-y-2">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm text-amber-800 dark:text-amber-300">
              <p>
                <strong>Dica:</strong> para encontrar cada ação, toque em "Adicionar Ação" e pesquise pelo nome entre aspas (ex: "Aguardar Retorno").
              </p>
              <p>
                Adicione o atalho à Tela Inicial para acesso rápido com um toque.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
