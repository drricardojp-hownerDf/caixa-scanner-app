/**
 * Apify Integration — Fetches real property data from Caixa Econômica Federal
 * 
 * Uses the Apify Actor "pizani/caixa-imoveis-scraper" via REST API.
 * The user provides their Apify API token through the app settings.
 * 
 * Flow:
 * 1. User enters Apify token + selects state/city filters
 * 2. Backend calls Apify to run the actor
 * 3. Waits for completion, fetches dataset
 * 4. Transforms data to our schema and saves to SQLite
 */

import { storage } from "./storage";
import type { InsertProperty } from "@shared/schema";

const APIFY_BASE_URL = "https://api.apify.com/v2";
// Primary: free pay-per-result actor
const ACTOR_ID = "giopasquale21~caixa-leilao-de-imoveis";
// Fallback: subscription-based actor (requires $10/mo plan)
const ACTOR_ID_ALT = "pizani~caixa-imoveis-scraper";

// Map Apify modalidade values to our tipoVenda
const modalidadeMap: Record<string, string> = {
  "auction": "AUCTION",
  "bid": "BID",
  "online": "ONLINE",
  "direct": "DIRECT",
  "AUCTION": "AUCTION",
  "BID": "BID",
  "ONLINE": "ONLINE",
  "DIRECT": "DIRECT",
};

interface ApifyRunInput {
  estado?: string;
  cidade?: string;
  cidade_nome?: string;
  modalidade?: string | string[];
  tipo_imovel?: string;
  tipoImovel?: string;
  faixa_valor?: string;
  descontoMinimo?: number;
  maxItems?: number;
}

interface SyncStatus {
  status: "idle" | "running" | "completed" | "error";
  message: string;
  progress?: number;
  total?: number;
  runId?: string;
}

let currentSyncStatus: SyncStatus = {
  status: "idle",
  message: "Pronto para sincronizar",
};

export function getSyncStatus(): SyncStatus {
  return { ...currentSyncStatus };
}

function parseDecimal(value: string | null | undefined): number | null {
  if (!value || value.trim() === "") return null;
  // Handle Brazilian number format: "250.000,00" -> 250000.00
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parsePercent(value: string | null | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace("%", "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractCep(address: string): string | null {
  const match = address.match(/CEP:\s*(\d{5}-?\d{3})/);
  return match ? match[1] : null;
}

function extractBairro(address: string, neighborhood?: string): string | null {
  if (neighborhood) return neighborhood;
  // Try to extract bairro from address pattern: "..., BAIRRO - CEP:..."
  const match = address.match(/,\s*([^,]+)\s*-\s*CEP:/);
  return match ? match[1].trim() : null;
}

function mapModalidade(mod: string | undefined): string {
  if (!mod) return "AUCTION";
  const lower = mod.toLowerCase();
  if (lower.includes("leil") || lower.includes("auction") || lower.includes("sfi")) return "AUCTION";
  if (lower.includes("licita") || lower.includes("bid") || lower.includes("concorr")) return "BID";
  if (lower.includes("online") || lower.includes("venda online")) return "ONLINE";
  if (lower.includes("diret") || lower.includes("direct") || lower.includes("far")) return "DIRECT";
  return modalidadeMap[mod] || "AUCTION";
}

function transformApifyItem(item: any): InsertProperty {
  // Handle BOTH actor output formats:
  // Format A (pizani): item.valores.valor_avaliacao, item.area.area_total, etc.
  // Format B (giopasquale21): item.valorAvaliacao, item.valorMinimo, item.desconto, etc.

  // --- Parse values ---
  const valorAvaliacao = 
    (typeof item.valorAvaliacao === "number" ? item.valorAvaliacao : null) ||
    parseDecimal(item.valores?.valor_avaliacao) ||
    parseDecimal(item.valorAvaliacao);
  
  const valorMin1 = parseDecimal(item.valores?.valor_minimo_venda_1_leilao);
  const valorMin2 = parseDecimal(item.valores?.valor_minimo_venda_2_leilao);
  const valorMinVendaRaw = parseDecimal(item.valores?.valor_minimo_venda);
  const valorMinimoNew = typeof item.valorMinimo === "number" ? item.valorMinimo : parseDecimal(item.valorMinimo);
  const valorMinVenda = valorMinVendaRaw || valorMinimoNew || valorMin2 || valorMin1;

  const descontoRaw = parsePercent(item.valores?.desconto);
  const descontoNew = typeof item.desconto === "number" ? item.desconto : parsePercent(item.desconto);
  const desconto = descontoRaw || descontoNew;
  
  // --- Parse areas ---
  const areaTotal = parseDecimal(item.area?.area_total) || (typeof item.areaTotal === "number" ? item.areaTotal : null);
  const areaPrivativa = parseDecimal(item.area?.area_privativa) || (typeof item.areaPrivativa === "number" ? item.areaPrivativa : null);
  const areaTerreno = parseDecimal(item.area?.area_terreno) || (typeof item.areaTerreno === "number" ? item.areaTerreno : null);

  // --- Tipo venda ---
  const tipoVenda = mapModalidade(item.tipo_venda || item.modalidade);

  // --- Address ---
  const address = item.address || item.endereco || item.informacoes_leilao?.endereco || "";
  
  // --- Auction dates ---
  let dataLeilao1: string | null = null;
  let dataLeilao2: string | null = null;
  if (item.informacoes_leilao?.datas) {
    for (const d of item.informacoes_leilao.datas) {
      if (d.ordem === "1º") dataLeilao1 = `${d.data} ${d.hora || ""}`.trim();
      if (d.ordem === "2º") dataLeilao2 = `${d.data} ${d.hora || ""}`.trim();
    }
  }

  // --- Estimate market price ---
  const area = areaPrivativa || areaTotal || 50;
  const precoM2Mercado = valorAvaliacao && area > 0 ? (valorAvaliacao / area) * 1.1 : null;
  const precoAluguelM2 = precoM2Mercado ? precoM2Mercado * 0.005 : null;

  // --- Calculate viability scores ---
  const bestPrice = valorMinVenda || valorAvaliacao || 0;
  const marketValue = precoM2Mercado && area ? precoM2Mercado * area : valorAvaliacao || bestPrice;

  let scoreFLIP = 0;
  let scoreReforma = 0;
  let scoreAluguel = 0;

  if (bestPrice > 0 && marketValue > 0) {
    const margin = (marketValue - bestPrice) / bestPrice;
    scoreFLIP = Math.min(100, Math.max(0, margin * 100));
    scoreReforma = Math.min(100, Math.max(0, (margin - 0.15) * 120));
    
    if (precoAluguelM2 && area) {
      const monthlyRent = precoAluguelM2 * area;
      const yieldAnnual = (monthlyRent * 12) / (bestPrice * 1.05);
      scoreAluguel = Math.min(100, Math.max(0, yieldAnnual * 1000));
    }
  }

  const scoreGeral = Math.round((scoreFLIP * 0.4 + scoreReforma * 0.3 + scoreAluguel * 0.3));

  return {
    idImovel: item.id_imovel || item.idImovel || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tipoVenda,
    titulo: item.titulo || item.nome_empreendimento || "Imóvel Caixa",
    descricao: item.descricao || item.informacoes_leilao?.descricao || null,
    tipoImovel: item.informacoes_principais?.tipo_imovel || item.tipoImovel || "Não informado",
    quartos: item.informacoes_principais?.quartos || item.quartos || null,
    garagem: item.informacoes_principais?.garagem || item.garagem || null,
    areaTotal,
    areaPrivativa,
    areaTerreno,
    endereco: address,
    bairro: item.neighborhood || item.bairro || extractBairro(address) || null,
    cidade: item.city || item.cidade || "",
    uf: item.uf || item.estado || "",
    cep: extractCep(address) || null,
    valorAvaliacao,
    valorMinVenda,
    valorMinVenda1Leilao: valorMin1,
    valorMinVenda2Leilao: valorMin2,
    desconto,
    aceitaFGTS: (item.accepts_fgts === 1 || item.aceitaFGTS === 1) ? 1 : 0,
    aceitaFinanciamento: (item.accepts_financing === 1 || item.aceitaFinanciamento === 1) ? 1 : 0,
    urlImagem: item.url_imagem || item.urlImagem || (item.fotos && item.fotos.length > 0 ? item.fotos[0] : null),
    fotos: item.fotos ? JSON.stringify(item.fotos) : null,
    linkEdital: item.auction_notice_link || item.urlEdital || null,
    linkMatricula: item.link_matricula || null,
    linkImovel: item.link || item.linkImovel || null,
    edital: item.informacoes_leilao?.edital || null,
    leiloeiro: item.informacoes_leilao?.leiloeiro || null,
    dataLeilao1,
    dataLeilao2,
    condominio: item.informacoes_leilao?.condominio || null,
    tributos: item.informacoes_leilao?.tributos || null,
    precoM2Mercado,
    precoAluguelM2,
    scoreFLIP: Math.round(scoreFLIP),
    scoreReforma: Math.round(scoreReforma),
    scoreAluguel: Math.round(scoreAluguel),
    scoreGeral,
    favorito: 0,
    notas: null,
    dataColeta: new Date().toISOString(),
  };
}

export async function syncFromApify(
  token: string,
  estado: string,
  cidadeNome?: string,
  modalidade?: string,
): Promise<{ success: boolean; count: number; message: string }> {
  
  currentSyncStatus = {
    status: "running",
    message: `Buscando imóveis em ${estado}${cidadeNome ? ` - ${cidadeNome}` : ""}...`,
  };

  try {
    // Build input parameters for giopasquale21 actor
    const input: ApifyRunInput = { estado };
    if (cidadeNome) input.cidade = cidadeNome;
    if (modalidade) {
      // Map our modalidade values to the actor's format
      const modMap: Record<string, string[]> = {
        "auction": ["4"],    // Leilão SFI Edital Único
        "bid": ["5"],        // Licitação Aberta
        "online": ["7", "8"], // Venda Online + Venda Direta Online
        "direct": ["6"],     // Venda Direta FAR
      };
      if (modMap[modalidade]) input.modalidade = modMap[modalidade];
    }

    // Start the actor run
    const startResponse = await fetch(
      `${APIFY_BASE_URL}/acts/${ACTOR_ID}/runs?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      throw new Error(`Erro ao iniciar busca: ${startResponse.status} - ${errorText}`);
    }

    const runData = await startResponse.json();
    const runId = runData.data?.id;

    if (!runId) {
      throw new Error("Não foi possível obter o ID da execução");
    }

    currentSyncStatus = {
      status: "running",
      message: "Coletando dados do site da Caixa...",
      runId,
    };

    // Poll for completion (max 5 minutes)
    let attempts = 0;
    const maxAttempts = 60; // 60 * 5s = 300s = 5 min
    let runStatus = "";

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusResponse = await fetch(
        `${APIFY_BASE_URL}/actor-runs/${runId}?token=${token}`
      );
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        runStatus = statusData.data?.status;
        
        if (runStatus === "SUCCEEDED") break;
        if (runStatus === "FAILED" || runStatus === "ABORTED" || runStatus === "TIMED-OUT") {
          throw new Error(`A busca falhou com status: ${runStatus}`);
        }
      }

      attempts++;
      currentSyncStatus = {
        status: "running",
        message: `Coletando dados... (${Math.round((attempts / maxAttempts) * 100)}%)`,
        runId,
        progress: attempts,
        total: maxAttempts,
      };
    }

    if (runStatus !== "SUCCEEDED") {
      throw new Error("Tempo esgotado. A busca demorou mais de 5 minutos.");
    }

    // Fetch the dataset
    const datasetId = runData.data?.defaultDatasetId;
    if (!datasetId) {
      throw new Error("Dataset não encontrado");
    }

    currentSyncStatus = {
      status: "running",
      message: "Processando resultados...",
      runId,
    };

    const dataResponse = await fetch(
      `${APIFY_BASE_URL}/datasets/${datasetId}/items?token=${token}&format=json`
    );

    if (!dataResponse.ok) {
      throw new Error("Erro ao baixar resultados");
    }

    const items: any[] = await dataResponse.json();
    
    if (!items || items.length === 0) {
      currentSyncStatus = {
        status: "completed",
        message: "Nenhum imóvel encontrado com os filtros selecionados.",
      };
      return { success: true, count: 0, message: "Nenhum imóvel encontrado" };
    }

    // Transform and save
    let savedCount = 0;
    for (const item of items) {
      try {
        const property = transformApifyItem(item);
        if (property.cidade && property.uf) {
          // Check if property already exists (by idImovel)
          const existing = storage.getProperties().find(p => p.idImovel === property.idImovel);
          if (existing) {
            // Update existing
            storage.updateProperty(existing.id, property);
          } else {
            storage.createProperty(property);
          }
          savedCount++;
        }
      } catch (err) {
        console.error("Erro ao processar imóvel:", err);
      }
    }

    currentSyncStatus = {
      status: "completed",
      message: `${savedCount} imóveis sincronizados com sucesso!`,
    };

    return { success: true, count: savedCount, message: `${savedCount} imóveis sincronizados` };

  } catch (error: any) {
    currentSyncStatus = {
      status: "error",
      message: error.message || "Erro desconhecido",
    };
    return { success: false, count: 0, message: error.message || "Erro desconhecido" };
  }
}
