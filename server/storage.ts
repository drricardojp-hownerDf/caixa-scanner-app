import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { properties, marketData, type Property, type InsertProperty, type MarketData, type InsertMarketData } from "@shared/schema";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ...(process.env.DATABASE_URL ? {} : {
    host: "localhost",
    port: 5432,
    database: "caixa_scanner",
    user: "postgres",
    password: "postgres",
  }),
});

const db = drizzle(pool);

export async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS properties (
      id SERIAL PRIMARY KEY,
      id_imovel TEXT NOT NULL,
      tipo_venda TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT,
      tipo_imovel TEXT NOT NULL,
      quartos INTEGER,
      garagem INTEGER,
      area_total DOUBLE PRECISION,
      area_privativa DOUBLE PRECISION,
      area_terreno DOUBLE PRECISION,
      endereco TEXT NOT NULL,
      bairro TEXT,
      cidade TEXT NOT NULL,
      uf TEXT NOT NULL,
      cep TEXT,
      valor_avaliacao DOUBLE PRECISION,
      valor_min_venda DOUBLE PRECISION,
      valor_min_venda_1_leilao DOUBLE PRECISION,
      valor_min_venda_2_leilao DOUBLE PRECISION,
      desconto DOUBLE PRECISION,
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
      preco_m2_mercado DOUBLE PRECISION,
      preco_aluguel_m2 DOUBLE PRECISION,
      score_flip DOUBLE PRECISION,
      score_reforma DOUBLE PRECISION,
      score_aluguel DOUBLE PRECISION,
      score_geral DOUBLE PRECISION,
      favorito INTEGER DEFAULT 0,
      notas TEXT,
      data_coleta TEXT
    );

    CREATE TABLE IF NOT EXISTS market_data (
      id SERIAL PRIMARY KEY,
      cidade TEXT NOT NULL,
      uf TEXT NOT NULL,
      bairro TEXT,
      tipo_imovel TEXT,
      preco_m2_venda DOUBLE PRECISION,
      preco_m2_aluguel DOUBLE PRECISION,
      preco_m2_aluguel_curta DOUBLE PRECISION,
      taxa_ocupacao DOUBLE PRECISION,
      tendencia TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_properties_id_imovel ON properties(id_imovel);
    CREATE INDEX IF NOT EXISTS idx_properties_uf ON properties(uf);
    CREATE INDEX IF NOT EXISTS idx_properties_cidade ON properties(cidade);
    CREATE INDEX IF NOT EXISTS idx_properties_tipo_imovel ON properties(tipo_imovel);
    CREATE INDEX IF NOT EXISTS idx_properties_desconto ON properties(desconto);
    CREATE INDEX IF NOT EXISTS idx_properties_favorito ON properties(favorito);
  `);
}

export interface PropertyFilters {
  uf?: string;
  cidade?: string;
  bairro?: string;
  tipoImovel?: string;
  tipoVenda?: string;
  precoMin?: number;
  precoMax?: number;
  quartos?: number;
  areaMin?: number;
  descontoMin?: number;
  garagemMin?: number;
  condominio?: string;
  aceitaFGTS?: boolean;
  aceitaFinanciamento?: boolean;
  favoritos?: boolean;
  orderBy?: string;
  orderDir?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult {
  data: Property[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface IStorage {
  getProperties(filters?: PropertyFilters): Promise<PaginatedResult>;
  getProperty(id: number): Promise<Property | undefined>;
  findByIdImovel(idImovel: string): Promise<Property | undefined>;
  createProperty(data: InsertProperty): Promise<Property>;
  updateProperty(id: number, data: Partial<InsertProperty>): Promise<Property | undefined>;
  deleteProperty(id: number): Promise<void>;
  toggleFavorite(id: number): Promise<Property | undefined>;
  updateNotes(id: number, notas: string): Promise<Property | undefined>;
  getMarketData(cidade: string, uf: string): Promise<MarketData[]>;
  createMarketData(data: InsertMarketData): Promise<MarketData>;
  getStats(): Promise<{
    total: number;
    porModalidade: Record<string, number>;
    porEstado: Record<string, number>;
    descontoMedio: number;
    valorMedioAvaliacao: number;
  }>;
  getDistinctUFs(): Promise<string[]>;
  getDistinctCidades(uf?: string): Promise<string[]>;
  getDistinctBairros(uf?: string, cidade?: string): Promise<string[]>;
  getDistinctTiposImovel(): Promise<string[]>;
}

export class DatabaseStorage implements IStorage {
  async getProperties(filters?: PropertyFilters): Promise<PaginatedResult> {
    const conditions: any[] = [];

    if (filters?.uf) conditions.push(eq(properties.uf, filters.uf));
    if (filters?.cidade) conditions.push(eq(properties.cidade, filters.cidade));
    if (filters?.bairro) conditions.push(eq(properties.bairro, filters.bairro));
    if (filters?.tipoImovel) conditions.push(eq(properties.tipoImovel, filters.tipoImovel));
    if (filters?.tipoVenda) conditions.push(eq(properties.tipoVenda, filters.tipoVenda));
    if (filters?.precoMin) conditions.push(gte(properties.valorMinVenda, filters.precoMin));
    if (filters?.precoMax) conditions.push(lte(properties.valorMinVenda, filters.precoMax));
    if (filters?.quartos) conditions.push(gte(properties.quartos, filters.quartos));
    if (filters?.areaMin) conditions.push(gte(properties.areaTotal, filters.areaMin));
    if (filters?.descontoMin) conditions.push(gte(properties.desconto, filters.descontoMin));
    if (filters?.garagemMin) conditions.push(gte(properties.garagem, filters.garagemMin));
    if (filters?.condominio === "sim") conditions.push(sql`${properties.condominio} IS NOT NULL AND ${properties.condominio} != ''`);
    if (filters?.condominio === "nao") conditions.push(sql`(${properties.condominio} IS NULL OR ${properties.condominio} = '')`);
    if (filters?.aceitaFGTS) conditions.push(eq(properties.aceitaFGTS, 1));
    if (filters?.aceitaFinanciamento) conditions.push(eq(properties.aceitaFinanciamento, 1));
    if (filters?.favoritos) conditions.push(eq(properties.favorito, 1));

    let orderClause: any = desc(properties.desconto);
    if (filters?.orderBy === "preco") {
      orderClause = filters.orderDir === "desc" ? desc(properties.valorMinVenda) : asc(properties.valorMinVenda);
    } else if (filters?.orderBy === "desconto") {
      orderClause = filters.orderDir === "asc" ? asc(properties.desconto) : desc(properties.desconto);
    } else if (filters?.orderBy === "score") {
      orderClause = filters.orderDir === "asc" ? asc(properties.scoreGeral) : desc(properties.scoreGeral);
    } else if (filters?.orderBy === "area") {
      orderClause = filters.orderDir === "asc" ? asc(properties.areaTotal) : desc(properties.areaTotal);
    }

    const page = filters?.page && filters.page > 0 ? filters.page : 1;
    const pageSize = filters?.pageSize && filters.pageSize > 0 ? filters.pageSize : 10;
    const offset = (page - 1) * pageSize;

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let totalResult;
    if (whereClause) {
      [totalResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(properties).where(whereClause);
    } else {
      [totalResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(properties);
    }
    const total = Number(totalResult?.count ?? 0);

    let data: Property[];
    if (whereClause) {
      data = await db.select().from(properties).where(whereClause).orderBy(orderClause).limit(pageSize).offset(offset);
    } else {
      data = await db.select().from(properties).orderBy(orderClause).limit(pageSize).offset(offset);
    }

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getProperty(id: number): Promise<Property | undefined> {
    const [row] = await db.select().from(properties).where(eq(properties.id, id));
    return row;
  }

  async findByIdImovel(idImovel: string): Promise<Property | undefined> {
    const [row] = await db.select().from(properties).where(eq(properties.idImovel, idImovel));
    return row;
  }

  async createProperty(data: InsertProperty): Promise<Property> {
    const [row] = await db.insert(properties).values(data).returning();
    return row;
  }

  async updateProperty(id: number, data: Partial<InsertProperty>): Promise<Property | undefined> {
    const [row] = await db.update(properties).set(data).where(eq(properties.id, id)).returning();
    return row;
  }

  async deleteProperty(id: number): Promise<void> {
    await db.delete(properties).where(eq(properties.id, id));
  }

  async toggleFavorite(id: number): Promise<Property | undefined> {
    const prop = await this.getProperty(id);
    if (!prop) return undefined;
    const [row] = await db.update(properties)
      .set({ favorito: prop.favorito === 1 ? 0 : 1 })
      .where(eq(properties.id, id))
      .returning();
    return row;
  }

  async updateNotes(id: number, notas: string): Promise<Property | undefined> {
    const [row] = await db.update(properties)
      .set({ notas })
      .where(eq(properties.id, id))
      .returning();
    return row;
  }

  async getMarketData(cidade: string, uf: string): Promise<MarketData[]> {
    return await db.select().from(marketData)
      .where(and(eq(marketData.cidade, cidade), eq(marketData.uf, uf)));
  }

  async createMarketData(data: InsertMarketData): Promise<MarketData> {
    const [row] = await db.insert(marketData).values(data).returning();
    return row;
  }

  async getStats(): Promise<{
    total: number;
    porModalidade: Record<string, number>;
    porEstado: Record<string, number>;
    descontoMedio: number;
    valorMedioAvaliacao: number;
  }> {
    const [countResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(properties);
    const total = Number(countResult?.count ?? 0);

    const [avgResult] = await db.select({
      avgDesconto: sql<number>`AVG(desconto)`,
      avgValor: sql<number>`AVG(valor_avaliacao)`,
    }).from(properties);

    const byModalidade = await db.select({
      tipo: properties.tipoVenda,
      count: sql<number>`COUNT(*)`,
    }).from(properties).groupBy(properties.tipoVenda);

    const byEstado = await db.select({
      uf: properties.uf,
      count: sql<number>`COUNT(*)`,
    }).from(properties).groupBy(properties.uf);

    const porModalidade: Record<string, number> = {};
    for (const r of byModalidade) porModalidade[r.tipo] = Number(r.count);

    const porEstado: Record<string, number> = {};
    for (const r of byEstado) porEstado[r.uf] = Number(r.count);

    return {
      total,
      porModalidade,
      porEstado,
      descontoMedio: Number(avgResult?.avgDesconto ?? 0),
      valorMedioAvaliacao: Number(avgResult?.avgValor ?? 0),
    };
  }

  async getDistinctUFs(): Promise<string[]> {
    const rows = await db.selectDistinct({ uf: properties.uf }).from(properties).orderBy(properties.uf);
    return rows.map(r => r.uf);
  }

  async getDistinctCidades(uf?: string): Promise<string[]> {
    if (uf) {
      const rows = await db.selectDistinct({ cidade: properties.cidade })
        .from(properties)
        .where(eq(properties.uf, uf))
        .orderBy(properties.cidade);
      return rows.map(r => r.cidade);
    }
    const rows = await db.selectDistinct({ cidade: properties.cidade }).from(properties).orderBy(properties.cidade);
    return rows.map(r => r.cidade);
  }

  async getDistinctBairros(uf?: string, cidade?: string): Promise<string[]> {
    const conditions: any[] = [
      sql`${properties.bairro} IS NOT NULL`,
      sql`${properties.bairro} != ''`,
    ];
    if (uf) conditions.push(eq(properties.uf, uf));
    if (cidade) conditions.push(eq(properties.cidade, cidade));

    const rows = await db.selectDistinct({ bairro: properties.bairro })
      .from(properties)
      .where(and(...conditions))
      .orderBy(properties.bairro);
    return rows.map(r => r.bairro!);
  }

  async getDistinctTiposImovel(): Promise<string[]> {
    const rows = await db.selectDistinct({ tipoImovel: properties.tipoImovel })
      .from(properties)
      .where(and(
        sql`${properties.tipoImovel} IS NOT NULL`,
        sql`${properties.tipoImovel} != ''`,
      ))
      .orderBy(properties.tipoImovel);
    return rows.map(r => r.tipoImovel);
  }
}

export const storage = new DatabaseStorage();

export { pool };
