import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const properties = sqliteTable("properties", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  idImovel: text("id_imovel").notNull(),
  tipoVenda: text("tipo_venda").notNull(), // AUCTION, BID, ONLINE, DIRECT
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  tipoImovel: text("tipo_imovel").notNull(), // Casa, Apartamento, Terreno
  quartos: integer("quartos"),
  garagem: integer("garagem"),
  areaTotal: real("area_total"),
  areaPrivativa: real("area_privativa"),
  areaTerreno: real("area_terreno"),
  endereco: text("endereco").notNull(),
  bairro: text("bairro"),
  cidade: text("cidade").notNull(),
  uf: text("uf").notNull(),
  cep: text("cep"),
  valorAvaliacao: real("valor_avaliacao"),
  valorMinVenda: real("valor_min_venda"),
  valorMinVenda1Leilao: real("valor_min_venda_1_leilao"),
  valorMinVenda2Leilao: real("valor_min_venda_2_leilao"),
  desconto: real("desconto"), // percentage
  aceitaFGTS: integer("aceita_fgts").default(0),
  aceitaFinanciamento: integer("aceita_financiamento").default(0),
  urlImagem: text("url_imagem"),
  fotos: text("fotos"), // JSON array of photo URLs
  linkEdital: text("link_edital"),
  linkMatricula: text("link_matricula"),
  linkImovel: text("link_imovel"),
  edital: text("edital"),
  leiloeiro: text("leiloeiro"),
  dataLeilao1: text("data_leilao_1"),
  dataLeilao2: text("data_leilao_2"),
  condominio: text("condominio"), // full, partial, none
  tributos: text("tributos"), // buyer, seller
  precoM2Mercado: real("preco_m2_mercado"), // market price per sqm
  precoAluguelM2: real("preco_aluguel_m2"), // rent price per sqm
  // Financial analysis scores
  scoreFLIP: real("score_flip"),
  scoreReforma: real("score_reforma"),
  scoreAluguel: real("score_aluguel"),
  scoreGeral: real("score_geral"),
  favorito: integer("favorito").default(0),
  notas: text("notas"),
  dataColeta: text("data_coleta"),
});

export const marketData = sqliteTable("market_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cidade: text("cidade").notNull(),
  uf: text("uf").notNull(),
  bairro: text("bairro"),
  tipoImovel: text("tipo_imovel"),
  precoM2Venda: real("preco_m2_venda"),
  precoM2Aluguel: real("preco_m2_aluguel"),
  precoM2AluguelCurta: real("preco_m2_aluguel_curta"), // short stay
  taxaOcupacao: real("taxa_ocupacao"), // occupancy rate %
  tendencia: text("tendencia"), // up, down, stable
});

export const insertPropertySchema = createInsertSchema(properties).omit({ id: true });
export const insertMarketDataSchema = createInsertSchema(marketData).omit({ id: true });

export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type MarketData = typeof marketData.$inferSelect;
export type InsertMarketData = z.infer<typeof insertMarketDataSchema>;
