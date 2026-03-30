import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { properties, marketData, type Property, type InsertProperty, type MarketData, type InsertMarketData } from "@shared/schema";
import { eq, like, and, gte, lte, desc, asc, sql } from "drizzle-orm";

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

// Create tables if not exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_imovel TEXT NOT NULL,
    tipo_venda TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    tipo_imovel TEXT NOT NULL,
    quartos INTEGER,
    garagem INTEGER,
    area_total REAL,
    area_privativa REAL,
    area_terreno REAL,
    endereco TEXT NOT NULL,
    bairro TEXT,
    cidade TEXT NOT NULL,
    uf TEXT NOT NULL,
    cep TEXT,
    valor_avaliacao REAL,
    valor_min_venda REAL,
    valor_min_venda_1_leilao REAL,
    valor_min_venda_2_leilao REAL,
    desconto REAL,
    aceita_fgts INTEGER DEFAULT 0,
    aceita_financiamento INTEGER DEFAULT 0,
    url_imagem TEXT,
    fotos TEXT,
    link_edital TEXT,
    link_matricula TEXT,
    link_imovel TEXT,
    edital TEXT,
    leiloeiro TEXT,
    data_leilao_1 TEXT,
    data_leilao_2 TEXT,
    condominio TEXT,
    tributos TEXT,
    preco_m2_mercado REAL,
    preco_aluguel_m2 REAL,
    score_flip REAL,
    score_reforma REAL,
    score_aluguel REAL,
    score_geral REAL,
    favorito INTEGER DEFAULT 0,
    notas TEXT,
    data_coleta TEXT
  );

  CREATE TABLE IF NOT EXISTS market_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cidade TEXT NOT NULL,
    uf TEXT NOT NULL,
    bairro TEXT,
    tipo_imovel TEXT,
    preco_m2_venda REAL,
    preco_m2_aluguel REAL,
    preco_m2_aluguel_curta REAL,
    taxa_ocupacao REAL,
    tendencia TEXT
  );
`);

export interface PropertyFilters {
  uf?: string;
  cidade?: string;
  tipoImovel?: string;
  tipoVenda?: string;
  precoMin?: number;
  precoMax?: number;
  quartos?: number;
  areaMin?: number;
  descontoMin?: number;
  aceitaFGTS?: boolean;
  aceitaFinanciamento?: boolean;
  favoritos?: boolean;
  orderBy?: string;
  orderDir?: string;
}

export interface IStorage {
  getProperties(filters?: PropertyFilters): Property[];
  getProperty(id: number): Property | undefined;
  createProperty(data: InsertProperty): Property;
  updateProperty(id: number, data: Partial<InsertProperty>): Property | undefined;
  deleteProperty(id: number): void;
  toggleFavorite(id: number): Property | undefined;
  updateNotes(id: number, notas: string): Property | undefined;
  getMarketData(cidade: string, uf: string): MarketData[];
  createMarketData(data: InsertMarketData): MarketData;
  getStats(): {
    total: number;
    porModalidade: Record<string, number>;
    porEstado: Record<string, number>;
    descontoMedio: number;
    valorMedioAvaliacao: number;
  };
  getDistinctUFs(): string[];
  getDistinctCidades(uf?: string): string[];
}

export class DatabaseStorage implements IStorage {
  getProperties(filters?: PropertyFilters): Property[] {
    const conditions: any[] = [];

    if (filters?.uf) conditions.push(eq(properties.uf, filters.uf));
    if (filters?.cidade) conditions.push(eq(properties.cidade, filters.cidade));
    if (filters?.tipoImovel) conditions.push(eq(properties.tipoImovel, filters.tipoImovel));
    if (filters?.tipoVenda) conditions.push(eq(properties.tipoVenda, filters.tipoVenda));
    if (filters?.precoMin) conditions.push(gte(properties.valorMinVenda, filters.precoMin));
    if (filters?.precoMax) conditions.push(lte(properties.valorMinVenda, filters.precoMax));
    if (filters?.quartos) conditions.push(gte(properties.quartos, filters.quartos));
    if (filters?.areaMin) conditions.push(gte(properties.areaTotal, filters.areaMin));
    if (filters?.descontoMin) conditions.push(gte(properties.desconto, filters.descontoMin));
    if (filters?.aceitaFGTS) conditions.push(eq(properties.aceitaFGTS, 1));
    if (filters?.aceitaFinanciamento) conditions.push(eq(properties.aceitaFinanciamento, 1));
    if (filters?.favoritos) conditions.push(eq(properties.favorito, 1));

    let orderClause: any = desc(properties.desconto);
    if (filters?.orderBy === "preco") {
      orderClause = filters.orderDir === "desc" ? desc(properties.valorMinVenda) : asc(properties.valorMinVenda);
    } else if (filters?.orderBy === "desconto") {
      orderClause = filters.orderDir === "asc" ? asc(properties.desconto) : desc(properties.desconto);
    } else if (filters?.orderBy === "score") {
      orderClause = desc(properties.scoreGeral);
    } else if (filters?.orderBy === "area") {
      orderClause = desc(properties.areaTotal);
    }

    if (conditions.length > 0) {
      return db.select().from(properties).where(and(...conditions)).orderBy(orderClause).all();
    }
    return db.select().from(properties).orderBy(orderClause).all();
  }

  getProperty(id: number): Property | undefined {
    return db.select().from(properties).where(eq(properties.id, id)).get();
  }

  createProperty(data: InsertProperty): Property {
    return db.insert(properties).values(data).returning().get();
  }

  updateProperty(id: number, data: Partial<InsertProperty>): Property | undefined {
    return db.update(properties).set(data).where(eq(properties.id, id)).returning().get();
  }

  deleteProperty(id: number): void {
    db.delete(properties).where(eq(properties.id, id)).run();
  }

  toggleFavorite(id: number): Property | undefined {
    const prop = this.getProperty(id);
    if (!prop) return undefined;
    return db.update(properties)
      .set({ favorito: prop.favorito === 1 ? 0 : 1 })
      .where(eq(properties.id, id))
      .returning()
      .get();
  }

  updateNotes(id: number, notas: string): Property | undefined {
    return db.update(properties)
      .set({ notas })
      .where(eq(properties.id, id))
      .returning()
      .get();
  }

  getMarketData(cidade: string, uf: string): MarketData[] {
    return db.select().from(marketData)
      .where(and(eq(marketData.cidade, cidade), eq(marketData.uf, uf)))
      .all();
  }

  createMarketData(data: InsertMarketData): MarketData {
    return db.insert(marketData).values(data).returning().get();
  }

  getStats() {
    const allProps = db.select().from(properties).all();
    const total = allProps.length;
    const porModalidade: Record<string, number> = {};
    const porEstado: Record<string, number> = {};
    let descontoTotal = 0;
    let descontoCount = 0;
    let valorTotal = 0;
    let valorCount = 0;

    for (const p of allProps) {
      porModalidade[p.tipoVenda] = (porModalidade[p.tipoVenda] || 0) + 1;
      porEstado[p.uf] = (porEstado[p.uf] || 0) + 1;
      if (p.desconto) { descontoTotal += p.desconto; descontoCount++; }
      if (p.valorAvaliacao) { valorTotal += p.valorAvaliacao; valorCount++; }
    }

    return {
      total,
      porModalidade,
      porEstado,
      descontoMedio: descontoCount > 0 ? descontoTotal / descontoCount : 0,
      valorMedioAvaliacao: valorCount > 0 ? valorTotal / valorCount : 0,
    };
  }

  getDistinctUFs(): string[] {
    const rows = sqlite.prepare("SELECT DISTINCT uf FROM properties ORDER BY uf").all() as { uf: string }[];
    return rows.map(r => r.uf);
  }

  getDistinctCidades(uf?: string): string[] {
    if (uf) {
      const rows = sqlite.prepare("SELECT DISTINCT cidade FROM properties WHERE uf = ? ORDER BY cidade").all(uf) as { cidade: string }[];
      return rows.map(r => r.cidade);
    }
    const rows = sqlite.prepare("SELECT DISTINCT cidade FROM properties ORDER BY cidade").all() as { cidade: string }[];
    return rows.map(r => r.cidade);
  }
}

export const storage = new DatabaseStorage();
