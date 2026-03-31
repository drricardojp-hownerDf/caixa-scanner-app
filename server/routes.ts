import type { Express } from "express";
import type { Server } from "http";
import multer from "multer";
import { storage, type PropertyFilters } from "./storage";
import { syncFromApify, getSyncStatus } from "./apify";
import type { InsertProperty } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// In-memory last sync metadata
let lastSyncMeta: {
  lastSync: string;
  totalProperties: number;
  byState: Record<string, number>;
} | null = null;

function updateSyncMeta() {
  const stats = storage.getStats();
  lastSyncMeta = {
    lastSync: new Date().toISOString(),
    totalProperties: stats.total,
    byState: stats.porEstado,
  };
}

function processCSVBuffer(buffer: Buffer): { imported: number; updated: number; errors: number } {
  const content = buffer.toString("latin1");
  const lines = content.split(/\r?\n/);

  let dataStartIndex = 2;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (lines[i].includes("do im") || lines[i].includes("N°")) {
      dataStartIndex = i + 1;
      break;
    }
  }

  let imported = 0;
  let updated = 0;
  let errors = 0;

  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const fields = parseCsvRow(line);
      const property = transformCsvRow(fields);
      if (!property) { errors++; continue; }

      const existing = storage.findByIdImovel(property.idImovel);
      if (existing) {
        const { favorito, notas, ...updateData } = property;
        storage.updateProperty(existing.id, updateData);
        updated++;
      } else {
        storage.createProperty(property);
        imported++;
      }
    } catch {
      errors++;
    }
  }

  return { imported, updated, errors };
}

// --- CSV parsing helpers ---

function parseBrazilianNumber(value: string): number | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  // If value contains comma → Brazilian format: 368.191,37 → 368191.37
  if (trimmed.includes(",")) {
    const cleaned = trimmed.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  // No comma → standard decimal (e.g. 45.05 for discount)
  const num = parseFloat(trimmed);
  return isNaN(num) ? null : num;
}

function mapTipoVendaCsv(modalidade: string): string {
  const m = modalidade.trim().toLowerCase();
  if (m.includes("venda online")) return "ONLINE";
  if (m.includes("venda direta")) return "DIRECT";
  if (m.includes("leilão") || m.includes("leilao") || m.includes("sfi")) return "AUCTION";
  if (m.includes("licitação") || m.includes("licitacao")) return "BID";
  return "ONLINE";
}

function parseDescription(desc: string): {
  tipoImovel: string;
  areaTotal: number | null;
  areaPrivativa: number | null;
  areaTerreno: number | null;
  quartos: number | null;
  garagem: number | null;
} {
  const result = {
    tipoImovel: "Não informado",
    areaTotal: null as number | null,
    areaPrivativa: null as number | null,
    areaTerreno: null as number | null,
    quartos: null as number | null,
    garagem: null as number | null,
  };

  if (!desc) return result;

  // Type is the first word before comma
  const typeMatch = desc.match(/^\s*([^,]+)/);
  if (typeMatch) result.tipoImovel = typeMatch[1].trim();

  // Areas: "0.00 de área total", "167.60 de área privativa", "0.00 de área do terreno"
  const areaTotalMatch = desc.match(/([\d.]+)\s*de\s*[áa]rea\s*total/i);
  if (areaTotalMatch) {
    const v = parseFloat(areaTotalMatch[1]);
    result.areaTotal = v > 0 ? v : null;
  }

  const areaPrivMatch = desc.match(/([\d.]+)\s*de\s*[áa]rea\s*privativa/i);
  if (areaPrivMatch) {
    const v = parseFloat(areaPrivMatch[1]);
    result.areaPrivativa = v > 0 ? v : null;
  }

  const areaTerrenoMatch = desc.match(/([\d.]+)\s*de\s*[áa]rea\s*do\s*terreno/i);
  if (areaTerrenoMatch) {
    const v = parseFloat(areaTerrenoMatch[1]);
    result.areaTerreno = v > 0 ? v : null;
  }

  // Quartos: "3 qto(s)"
  const quartosMatch = desc.match(/(\d+)\s*qto\(s\)/i);
  if (quartosMatch) result.quartos = parseInt(quartosMatch[1]);

  // Garagem: "2 vaga(s) de garagem"
  const garagemMatch = desc.match(/(\d+)\s*vaga\(s\)\s*de\s*garagem/i);
  if (garagemMatch) result.garagem = parseInt(garagemMatch[1]);

  return result;
}

function buildTitulo(tipoImovel: string, endereco: string): string {
  // Extract first meaningful part of address (street + number)
  const parts = endereco.split(",");
  const street = parts[0]?.trim() || endereco.trim();
  // Get number if present in second part
  const numPart = parts[1]?.trim();
  let numStr = "";
  if (numPart) {
    const numMatch = numPart.match(/^N?\.\s*(\d+)/i) || numPart.match(/^(\d+)/);
    if (numMatch) numStr = `, ${numMatch[1]}`;
  }
  return `${tipoImovel} - ${street}${numStr}`;
}

function parseCsvRow(line: string): string[] {
  // Simple semicolon split — CSV from Caixa doesn't use quoted fields
  return line.split(";");
}

function transformCsvRow(fields: string[]): InsertProperty | null {
  // Expected columns (0-indexed):
  // 0: N° do imóvel, 1: UF, 2: Cidade, 3: Bairro, 4: Endereço,
  // 5: Preço, 6: Valor de avaliação, 7: Desconto, 8: Financiamento,
  // 9: Descrição, 10: Modalidade de venda, 11: Link de acesso
  if (fields.length < 10) return null;

  const idImovel = fields[0].trim();
  const uf = fields[1].trim();
  const cidade = fields[2].trim();
  const bairro = fields[3].trim();
  const endereco = fields[4].trim();
  const preco = parseBrazilianNumber(fields[5]);
  const valorAvaliacao = parseBrazilianNumber(fields[6]);
  const desconto = parseBrazilianNumber(fields[7]);
  const financiamento = fields[8]?.trim().toLowerCase();
  const descricao = fields[9]?.trim() || "";
  const modalidade = fields[10]?.trim() || "";
  const link = fields[11]?.trim() || "";

  if (!idImovel || !uf || !cidade) return null;

  const parsed = parseDescription(descricao);
  const tipoVenda = mapTipoVendaCsv(modalidade);
  const titulo = buildTitulo(parsed.tipoImovel, endereco);
  const aceitaFinanciamento = financiamento === "sim" ? 1 : 0;

  // Calculate viability scores (same logic as apify.ts)
  const area = parsed.areaPrivativa || parsed.areaTotal || 50;
  const valorCompra = preco || 0;
  const avaliacaoVal = valorAvaliacao || (valorCompra > 0 ? valorCompra * 1.3 : 0);
  const precoM2Mercado = avaliacaoVal && area > 0 ? (avaliacaoVal / area) * 1.1 : null;
  const precoAluguelM2 = precoM2Mercado ? precoM2Mercado * 0.005 : null;

  const bestPrice = valorCompra || avaliacaoVal || 0;
  const marketValue = precoM2Mercado && area ? precoM2Mercado * area : avaliacaoVal || bestPrice;

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

  const scoreGeral = Math.round(scoreFLIP * 0.4 + scoreReforma * 0.3 + scoreAluguel * 0.3);

  return {
    idImovel,
    tipoVenda,
    titulo,
    descricao: descricao || null,
    tipoImovel: parsed.tipoImovel,
    quartos: parsed.quartos,
    garagem: parsed.garagem,
    areaTotal: parsed.areaTotal,
    areaPrivativa: parsed.areaPrivativa,
    areaTerreno: parsed.areaTerreno,
    endereco,
    bairro: bairro || null,
    cidade,
    uf,
    cep: null,
    valorAvaliacao: valorAvaliacao,
    valorMinVenda: preco,
    valorMinVenda1Leilao: null,
    valorMinVenda2Leilao: null,
    desconto: desconto,
    aceitaFGTS: 0,
    aceitaFinanciamento: aceitaFinanciamento,
    urlImagem: null,
    fotos: null,
    linkEdital: null,
    linkMatricula: null,
    linkImovel: link || null,
    edital: null,
    leiloeiro: null,
    dataLeilao1: null,
    dataLeilao2: null,
    condominio: null,
    tributos: null,
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

export function registerRoutes(server: Server, app: Express) {
  // Get all properties with filters
  app.get("/api/properties", (req, res) => {
    const filters: PropertyFilters = {
      uf: req.query.uf as string | undefined,
      cidade: req.query.cidade as string | undefined,
      tipoImovel: req.query.tipoImovel as string | undefined,
      tipoVenda: req.query.tipoVenda as string | undefined,
      precoMin: req.query.precoMin ? Number(req.query.precoMin) : undefined,
      precoMax: req.query.precoMax ? Number(req.query.precoMax) : undefined,
      quartos: req.query.quartos ? Number(req.query.quartos) : undefined,
      areaMin: req.query.areaMin ? Number(req.query.areaMin) : undefined,
      descontoMin: req.query.descontoMin ? Number(req.query.descontoMin) : undefined,
      aceitaFGTS: req.query.aceitaFGTS === "true",
      aceitaFinanciamento: req.query.aceitaFinanciamento === "true",
      favoritos: req.query.favoritos === "true",
      orderBy: req.query.orderBy as string | undefined,
      orderDir: req.query.orderDir as string | undefined,
    };
    const props = storage.getProperties(filters);
    res.json(props);
  });

  // Get single property with analysis
  app.get("/api/properties/:id", (req, res) => {
    const prop = storage.getProperty(Number(req.params.id));
    if (!prop) return res.status(404).json({ error: "Imóvel não encontrado" });

    // Get market data for this property's location
    const market = storage.getMarketData(prop.cidade, prop.uf);

    // Calculate financial analysis
    const analysis = calculateAnalysis(prop, market);
    res.json({ property: prop, market, analysis });
  });

  // Toggle favorite
  app.post("/api/properties/:id/favorite", (req, res) => {
    const prop = storage.toggleFavorite(Number(req.params.id));
    if (!prop) return res.status(404).json({ error: "Imóvel não encontrado" });
    res.json(prop);
  });

  // Update notes
  app.patch("/api/properties/:id/notes", (req, res) => {
    const { notas } = req.body;
    const prop = storage.updateNotes(Number(req.params.id), notas);
    if (!prop) return res.status(404).json({ error: "Imóvel não encontrado" });
    res.json(prop);
  });

  // Get dashboard stats
  app.get("/api/stats", (_req, res) => {
    const stats = storage.getStats();
    res.json(stats);
  });

  // Get distinct UFs
  app.get("/api/ufs", (_req, res) => {
    const ufs = storage.getDistinctUFs();
    res.json(ufs);
  });

  // Get distinct cities (optionally by UF)
  app.get("/api/cidades", (req, res) => {
    const cidades = storage.getDistinctCidades(req.query.uf as string | undefined);
    res.json(cidades);
  });

  // Sync from Apify - start data collection
  app.post("/api/sync", async (req, res) => {
    const { token, estado, cidade, modalidade } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token da Apify é obrigatório" });
    }
    if (!estado) {
      return res.status(400).json({ error: "Selecione pelo menos um estado" });
    }

    // Don't await — run in background
    syncFromApify(token, estado, cidade, modalidade)
      .then(result => console.log("Sync completed:", result))
      .catch(err => console.error("Sync error:", err));

    res.json({ message: "Sincronização iniciada", status: "running" });
  });

  // Get sync status
  app.get("/api/sync/status", (_req, res) => {
    res.json(getSyncStatus());
  });

  // Import single CSV file
  app.post("/api/import-csv", upload.single("file"), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }

      const result = processCSVBuffer(req.file.buffer);
      updateSyncMeta();

      res.json({
        success: true,
        ...result,
        total: result.imported + result.updated,
        message: `${result.imported + result.updated} imóveis processados (${result.imported} novos, ${result.updated} atualizados${result.errors > 0 ? `, ${result.errors} erros` : ""})`,
      });
    } catch (err: any) {
      console.error("[CSV Import] Error:", err.message);
      res.status(500).json({ error: err.message || "Erro ao processar arquivo" });
    }
  });

  // Import multiple CSV files at once
  app.post("/api/import-csv-batch", upload.array("files", 30), (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "Nenhum arquivo enviado" });
      }

      const results: Array<{ filename: string; imported: number; updated: number; errors: number }> = [];
      let totalImported = 0;
      let totalUpdated = 0;
      let totalErrors = 0;

      for (const file of files) {
        try {
          const result = processCSVBuffer(file.buffer);
          results.push({ filename: file.originalname, ...result });
          totalImported += result.imported;
          totalUpdated += result.updated;
          totalErrors += result.errors;
        } catch (err: any) {
          results.push({ filename: file.originalname, imported: 0, updated: 0, errors: 1 });
          totalErrors++;
        }
      }

      updateSyncMeta();

      res.json({
        success: true,
        files: results,
        totals: {
          imported: totalImported,
          updated: totalUpdated,
          errors: totalErrors,
          total: totalImported + totalUpdated,
        },
        message: `${totalImported + totalUpdated} imóveis processados de ${files.length} arquivo(s) (${totalImported} novos, ${totalUpdated} atualizados${totalErrors > 0 ? `, ${totalErrors} erros` : ""})`,
      });
    } catch (err: any) {
      console.error("[CSV Batch Import] Error:", err.message);
      res.status(500).json({ error: err.message || "Erro ao processar arquivos" });
    }
  });

  // Get last sync metadata
  app.get("/api/sync/last", (_req, res) => {
    if (!lastSyncMeta) {
      // Build from current DB state if never synced this session
      const stats = storage.getStats();
      if (stats.total > 0) {
        res.json({
          lastSync: null,
          totalProperties: stats.total,
          byState: stats.porEstado,
        });
      } else {
        res.json({ lastSync: null, totalProperties: 0, byState: {} });
      }
      return;
    }
    res.json(lastSyncMeta);
  });

  // Clear all properties (for re-sync)
  app.delete("/api/properties", (_req, res) => {
    const all = storage.getProperties();
    let deleted = 0;
    for (const p of all) {
      if (p.favorito !== 1) { // Keep favorites
        storage.deleteProperty(p.id);
        deleted++;
      }
    }
    res.json({ deleted, kept: all.length - deleted });
  });
}

interface FinancialAnalysis {
  // FLIP strategy
  flip: {
    custoAquisicao: number;
    custoDocumentacao: number;
    custoTotal: number;
    valorVendaEstimado: number;
    lucroEstimado: number;
    roi: number;
    viable: boolean;
    label: string;
  };
  // Reform + Sell strategy
  reforma: {
    custoAquisicao: number;
    custoReforma: number;
    custoDocumentacao: number;
    custoTotal: number;
    valorVendaEstimado: number;
    lucroEstimado: number;
    roi: number;
    prazoMeses: number;
    viable: boolean;
    label: string;
  };
  // Long-term rental strategy
  aluguelLongo: {
    custoAquisicao: number;
    custoDocumentacao: number;
    custoTotal: number;
    aluguelMensal: number;
    despesasMensais: number;
    receitaLiquida: number;
    yieldAnual: number;
    paybackMeses: number;
    viable: boolean;
    label: string;
  };
  // Short-term rental (Airbnb) strategy
  aluguelCurto: {
    custoAquisicao: number;
    custoMobilia: number;
    custoTotal: number;
    receitaMensal: number;
    despesasMensais: number;
    receitaLiquida: number;
    yieldAnual: number;
    paybackMeses: number;
    viable: boolean;
    label: string;
  };
}

function calculateAnalysis(prop: any, market: any[]): FinancialAnalysis {
  const valorCompra = prop.valorMinVenda || prop.valorMinVenda2Leilao || prop.valorMinVenda1Leilao || prop.valorAvaliacao || 0;
  const area = prop.areaPrivativa || prop.areaTotal || 50;
  const valorAvaliacao = prop.valorAvaliacao || valorCompra * 1.3;

  // Market data - use actual or estimated
  const marketInfo = market.length > 0 ? market[0] : null;
  const precoM2Venda = prop.precoM2Mercado || (marketInfo?.precoM2Venda) || (valorAvaliacao / area) * 1.1;
  const precoM2Aluguel = prop.precoAluguelM2 || (marketInfo?.precoM2Aluguel) || precoM2Venda * 0.005;
  const precoM2AluguelCurta = (marketInfo?.precoM2AluguelCurta) || precoM2Aluguel * 2.5;
  const taxaOcupacao = (marketInfo?.taxaOcupacao) || 65;

  // Constants
  const taxaDocumentacao = 0.05; // 5% ITBI + registro + cartório
  const taxaCorretagemVenda = 0.06; // 6% corretagem na venda
  const custoReformaM2 = 800; // R$ 800/m2 reforma média
  const custoMobiliaM2 = 350; // R$ 350/m2 para mobíliar
  const iptuMensal = valorAvaliacao * 0.01 / 12; // ~1% ao ano
  const condominioMensal = prop.condominio === "full" ? area * 8 : area * 5;
  const seguroMensal = valorAvaliacao * 0.003 / 12;
  const manutencaoMensal = valorAvaliacao * 0.01 / 12;

  // === FLIP Strategy ===
  const flipCustoAquisicao = valorCompra;
  const flipCustoDocumentacao = valorCompra * taxaDocumentacao;
  const flipCustoTotal = flipCustoAquisicao + flipCustoDocumentacao;
  const flipValorVenda = precoM2Venda * area;
  const flipVendaLiquida = flipValorVenda * (1 - taxaCorretagemVenda);
  const flipLucro = flipVendaLiquida - flipCustoTotal;
  const flipRoi = flipCustoTotal > 0 ? (flipLucro / flipCustoTotal) * 100 : 0;

  // === Reform + Sell Strategy ===
  const reformaCustoReforma = area * custoReformaM2;
  const reformaCustoTotal = flipCustoAquisicao + flipCustoDocumentacao + reformaCustoReforma;
  const reformaValorVenda = precoM2Venda * area * 1.2; // 20% premium after reform
  const reformaVendaLiquida = reformaValorVenda * (1 - taxaCorretagemVenda);
  const reformaLucro = reformaVendaLiquida - reformaCustoTotal;
  const reformaRoi = reformaCustoTotal > 0 ? (reformaLucro / reformaCustoTotal) * 100 : 0;

  // === Long-term Rental Strategy ===
  const aluguelMensal = precoM2Aluguel * area;
  const despesasLongo = iptuMensal + seguroMensal + manutencaoMensal;
  const receitaLiquidaLongo = aluguelMensal - despesasLongo;
  const aluguelLongoCustoTotal = flipCustoTotal;
  const yieldLongo = aluguelLongoCustoTotal > 0 ? (receitaLiquidaLongo * 12 / aluguelLongoCustoTotal) * 100 : 0;
  const paybackLongo = receitaLiquidaLongo > 0 ? Math.ceil(aluguelLongoCustoTotal / receitaLiquidaLongo) : 999;

  // === Short-term Rental (Airbnb) Strategy ===
  const custoMobilia = area * custoMobiliaM2;
  const aluguelCurtoCustoTotal = flipCustoTotal + custoMobilia;
  const receitaBrutaCurta = precoM2AluguelCurta * area * (taxaOcupacao / 100);
  const despesasCurta = iptuMensal + condominioMensal + seguroMensal + manutencaoMensal + (receitaBrutaCurta * 0.15); // 15% plataforma
  const receitaLiquidaCurta = receitaBrutaCurta - despesasCurta;
  const yieldCurto = aluguelCurtoCustoTotal > 0 ? (receitaLiquidaCurta * 12 / aluguelCurtoCustoTotal) * 100 : 0;
  const paybackCurto = receitaLiquidaCurta > 0 ? Math.ceil(aluguelCurtoCustoTotal / receitaLiquidaCurta) : 999;

  function getLabel(roi: number, type: "flip" | "reform" | "rent"): string {
    if (type === "flip" || type === "reform") {
      if (roi >= 30) return "Excelente";
      if (roi >= 15) return "Bom";
      if (roi >= 5) return "Razoável";
      return "Baixo Retorno";
    }
    // rent yield
    if (roi >= 10) return "Excelente";
    if (roi >= 7) return "Bom";
    if (roi >= 4) return "Razoável";
    return "Baixo Retorno";
  }

  return {
    flip: {
      custoAquisicao: flipCustoAquisicao,
      custoDocumentacao: flipCustoDocumentacao,
      custoTotal: flipCustoTotal,
      valorVendaEstimado: flipVendaLiquida,
      lucroEstimado: flipLucro,
      roi: Math.round(flipRoi * 10) / 10,
      viable: flipRoi >= 15,
      label: getLabel(flipRoi, "flip"),
    },
    reforma: {
      custoAquisicao: flipCustoAquisicao,
      custoReforma: reformaCustoReforma,
      custoDocumentacao: flipCustoDocumentacao,
      custoTotal: reformaCustoTotal,
      valorVendaEstimado: reformaVendaLiquida,
      lucroEstimado: reformaLucro,
      roi: Math.round(reformaRoi * 10) / 10,
      prazoMeses: 6,
      viable: reformaRoi >= 15,
      label: getLabel(reformaRoi, "reform"),
    },
    aluguelLongo: {
      custoAquisicao: flipCustoAquisicao,
      custoDocumentacao: flipCustoDocumentacao,
      custoTotal: aluguelLongoCustoTotal,
      aluguelMensal: Math.round(aluguelMensal),
      despesasMensais: Math.round(despesasLongo),
      receitaLiquida: Math.round(receitaLiquidaLongo),
      yieldAnual: Math.round(yieldLongo * 10) / 10,
      paybackMeses: paybackLongo,
      viable: yieldLongo >= 6,
      label: getLabel(yieldLongo, "rent"),
    },
    aluguelCurto: {
      custoAquisicao: flipCustoAquisicao,
      custoMobilia: custoMobilia,
      custoTotal: aluguelCurtoCustoTotal,
      receitaMensal: Math.round(receitaBrutaCurta),
      despesasMensais: Math.round(despesasCurta),
      receitaLiquida: Math.round(receitaLiquidaCurta),
      yieldAnual: Math.round(yieldCurto * 10) / 10,
      paybackMeses: paybackCurto,
      viable: yieldCurto >= 8,
      label: getLabel(yieldCurto, "rent"),
    },
  };
}
