import type { Express } from "express";
import type { Server } from "http";
import { storage, type PropertyFilters } from "./storage";

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
