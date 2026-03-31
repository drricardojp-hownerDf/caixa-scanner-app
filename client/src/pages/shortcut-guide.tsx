import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ArrowLeft, Smartphone, Lightbulb } from "lucide-react";

const steps = [
  {
    title: 'Crie um novo Atalho',
    description: (
      <>
        Abra o app <strong>Atalhos</strong> → toque <strong>+</strong> para criar um novo atalho → nomeie como{" "}
        <strong>"Caixa Scanner Sync"</strong>
      </>
    ),
  },
  {
    title: 'Adicione "Abrir URL"',
    description: (
      <>
        Adicione a ação <strong>"Abrir URL"</strong> → defina a URL como:
        <code className="block mt-1.5 p-2 bg-muted rounded text-xs break-all">
          https://venda-imoveis.caixa.gov.br/sistema/download-lista.asp
        </code>
      </>
    ),
  },
  {
    title: 'Adicione "Aguardar"',
    description: (
      <>
        Adicione a ação <strong>"Aguardar"</strong> → toque em <strong>"Mostrar Mais"</strong>, ative{" "}
        <strong>"Mostrar em notificação"</strong> com o texto:
        <span className="block mt-1 text-xs italic text-muted-foreground">
          "Toque aqui quando terminar de baixar o CSV"
        </span>
      </>
    ),
  },
  {
    title: 'Adicione "Selecionar Arquivo"',
    description: (
      <>
        Adicione a ação <strong>"Selecionar Arquivo"</strong> → ative <strong>"Selecionar múltiplos"</strong>
      </>
    ),
  },
  {
    title: 'Adicione "Obter Conteúdo de URL"',
    description: (
      <>
        Adicione a ação <strong>"Obter Conteúdo de URL"</strong> e configure:
        <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground list-none">
          <li>
            <strong className="text-foreground">URL:</strong>{" "}
            <code className="bg-muted px-1 py-0.5 rounded break-all">
              https://caixa-scanner-production-f24a.up.railway.app/api/import-csv-batch
            </code>
          </li>
          <li><strong className="text-foreground">Método:</strong> POST</li>
          <li><strong className="text-foreground">Corpo da Requisição:</strong> Formulário</li>
          <li>
            <strong className="text-foreground">Adicionar campo:</strong> chave = <code className="bg-muted px-1 py-0.5 rounded">files</code>, valor = variável <em>"Arquivos Selecionados"</em> do passo 4
          </li>
        </ul>
      </>
    ),
  },
  {
    title: 'Adicione "Obter Valor do Dicionário"',
    description: (
      <>
        Adicione a ação <strong>"Obter Valor do Dicionário"</strong> → chave = <code className="bg-muted px-1 py-0.5 rounded">message</code>
      </>
    ),
  },
  {
    title: 'Adicione "Mostrar Notificação"',
    description: (
      <>
        Adicione a ação <strong>"Mostrar Notificação"</strong>:
        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground list-none">
          <li><strong className="text-foreground">Título:</strong> Caixa Scanner</li>
          <li><strong className="text-foreground">Corpo:</strong> valor do dicionário do passo 6</li>
        </ul>
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

      {/* Steps */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Passo a passo
          </CardTitle>
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

      {/* Tip */}
      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Adicione o atalho à Tela Inicial para acesso rápido com um toque
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
