/**
 * Apify Integration — Fetches real property data from Caixa Econômica Federal
 */

import { storage } from "./storage";
import type { InsertProperty } from "@shared/schema";

const APIFY_BASE_URL = "https://api.apify.com/v2";

// Try actors in order - first one that works wins
const ACTORS = [
  "pizani~caixa-imoveis-scraper",             // most reliable, 27 users, 5.0 rating
  "giopasquale21~caixa-leilao-de-imoveis",  // pay-per-result fallback
];

const modalidadeMap: Record<string, string> = {
  "auction": "AUCTION", "bid": "BID", "online": "ONLINE", "direct": "DIRECT",
  "AUCTION": "AUCTION", "BID": "BID", "ONLINE": "ONLINE", "DIRECT": "DIRECT",
};

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

function parseDecimal(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    if (value.trim() === "") return null;
    const cleaned = value.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

function parsePercent(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace("%", "").replace(",", ".").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

function extractCep(address: string): string | null {
  const match = address.match(/CEP:\s*(\d{5}-?\d{3})/);
  return match ? match[1] : null;
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
  // Handle multiple actor output formats

  // --- Parse values ---
  const valorAvaliacao = 
    parseDecimal(item.valorAvaliacao) ||
    parseDecimal(item.valores?.valor_avaliacao);
  
  const valorMin1 = parseDecimal(item.valores?.valor_minimo_venda_1_leilao);
  const valorMin2 = parseDecimal(item.valores?.valor_minimo_venda_2_leilao);
  const valorMinVendaRaw = parseDecimal(item.valores?.valor_minimo_venda);
  const valorMinimoNew = parseDecimal(item.valorMinimo);
  const valorMinVenda = valorMinVendaRaw || valorMinimoNew || valorMin2 || valorMin1;

  const desconto = parsePercent(item.valores?.desconto) || parsePercent(item.desconto);
  
  // --- Parse areas ---
  const areaTotal = parseDecimal(item.area?.area_total) || parseDecimal(item.areaTotal);
  const areaPrivativa = parseDecimal(item.area?.area_privativa) || parseDecimal(item.areaPrivativa);
  const areaTerreno = parseDecimal(item.area?.area_terreno) || parseDecimal(item.areaTerreno);

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
    bairro: item.neighborhood || item.bairro || null,
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

async function tryRunActor(
  actorId: string,
  token: string,
  input: any,
): Promise<{ runId: string; datasetId: string } | null> {
  console.log(`[Apify] Trying actor: ${actorId} with input:`, JSON.stringify(input));
  
  try {
    const startResponse = await fetch(
      `${APIFY_BASE_URL}/acts/${actorId}/runs?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );

    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      console.log(`[Apify] Actor ${actorId} start failed: ${startResponse.status} - ${errorText}`);
      return null;
    }

    const runData = await startResponse.json();
    const runId = runData.data?.id;
    const datasetId = runData.data?.defaultDatasetId;

    if (!runId) {
      console.log(`[Apify] Actor ${actorId}: no runId returned`);
      return null;
    }

    console.log(`[Apify] Actor ${actorId} started. runId: ${runId}, datasetId: ${datasetId}`);
    return { runId, datasetId };
  } catch (err: any) {
    console.log(`[Apify] Actor ${actorId} exception: ${err.message}`);
    return null;
  }
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
    // Build input for primary actor (pizani)
    const inputPizani: any = { estado };
    if (cidadeNome) inputPizani.cidade_nome = cidadeNome;
    if (modalidade) inputPizani.modalidade = modalidade;

    // Build input for fallback actor (giopasquale21)
    const inputGio: any = { estado };
    if (cidadeNome) inputGio.cidade = cidadeNome;
    if (modalidade) {
      const modMap: Record<string, string[]> = {
        "auction": ["4"], "bid": ["5"], "online": ["7", "8"], "direct": ["6"],
      };
      if (modMap[modalidade]) inputGio.modalidade = modMap[modalidade];
    }

    // Try each actor until one works
    let runResult: { runId: string; datasetId: string } | null = null;
    const inputs = [inputPizani, inputGio];
    let usedActorIndex = -1;

    for (let i = 0; i < ACTORS.length; i++) {
      currentSyncStatus = {
        status: "running",
        message: `Conectando à fonte de dados (tentativa ${i + 1})...`,
      };
      runResult = await tryRunActor(ACTORS[i], token, inputs[i]);
      if (runResult) {
        usedActorIndex = i;
        break;
      }
    }

    if (!runResult) {
      throw new Error("Nenhum serviço de busca disponível. Verifique se o token está correto.");
    }

    const { runId, datasetId } = runResult;
    console.log(`[Apify] Using actor: ${ACTORS[usedActorIndex]}`);

    currentSyncStatus = {
      status: "running",
      message: "Coletando dados do site da Caixa...",
      runId,
    };

    // Poll for completion (max 10 minutes for large states like SP)
    let attempts = 0;
    const maxAttempts = 120; // 120 * 5s = 600s = 10 min
    let runStatus = "";

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      try {
        const statusResponse = await fetch(
          `${APIFY_BASE_URL}/actor-runs/${runId}?token=${token}`
        );
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          runStatus = statusData.data?.status;
          const stats = statusData.data?.stats;
          
          console.log(`[Apify] Run status: ${runStatus}, stats:`, JSON.stringify(stats || {}));
          
          if (runStatus === "SUCCEEDED") break;
          if (runStatus === "FAILED" || runStatus === "ABORTED" || runStatus === "TIMED-OUT") {
            throw new Error(`A busca falhou com status: ${runStatus}`);
          }
        }
      } catch (err: any) {
        if (err.message?.includes("falhou com status")) throw err;
        // Network error, continue polling
      }

      attempts++;
      const pct = Math.min(95, Math.round((attempts / maxAttempts) * 100));
      currentSyncStatus = {
        status: "running",
        message: `Coletando dados... (${pct}%) — pode levar alguns minutos`,
        runId,
        progress: attempts,
        total: maxAttempts,
      };
    }

    if (runStatus !== "SUCCEEDED") {
      throw new Error("Tempo esgotado. A busca demorou mais de 10 minutos. Tente com um estado menor ou filtre por cidade.");
    }

    // Fetch the dataset
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

    let items: any[] = await dataResponse.json();
    
    // Filter out warning/error messages that aren't real property data
    items = items.filter(item => !item.warning && (item.id_imovel || item.idImovel || item.titulo || item.valorAvaliacao || item.valores));
    
    console.log(`[Apify] Received ${items?.length || 0} valid items from dataset`);
    if (items && items.length > 0) {
      console.log(`[Apify] Sample item keys:`, Object.keys(items[0]));
      console.log(`[Apify] Sample item:`, JSON.stringify(items[0]).substring(0, 500));
    }
    
    if (!items || items.length === 0) {
      currentSyncStatus = {
        status: "completed",
        message: "Nenhum imóvel encontrado com os filtros selecionados.",
      };
      return { success: true, count: 0, message: "Nenhum imóvel encontrado" };
    }

    // Transform and save
    let savedCount = 0;
    let errorCount = 0;
    for (const item of items) {
      try {
        const property = transformApifyItem(item);
        if (property.cidade && property.uf) {
          // Check if property already exists (by idImovel)
          const existing = storage.findByIdImovel(property.idImovel);
          if (existing) {
            storage.updateProperty(existing.id, property);
          } else {
            storage.createProperty(property);
          }
          savedCount++;
        }
      } catch (err) {
        errorCount++;
        if (errorCount <= 3) console.error("[Apify] Erro ao processar imóvel:", err);
      }
    }

    const msg = `${savedCount} imóveis sincronizados com sucesso!${errorCount > 0 ? ` (${errorCount} com erro)` : ""}`;
    currentSyncStatus = {
      status: "completed",
      message: msg,
    };

    return { success: true, count: savedCount, message: msg };

  } catch (error: any) {
    console.error("[Apify] Sync error:", error.message);
    currentSyncStatus = {
      status: "error",
      message: error.message || "Erro desconhecido",
    };
    return { success: false, count: 0, message: error.message || "Erro desconhecido" };
  }
}
