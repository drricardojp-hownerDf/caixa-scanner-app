import { pgTable, text, integer, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  idImovel: text("id_imovel").notNull(),
  tipoVenda: text("tipo_venda").notNull(), // AUCTION, BID, ONLINE, DIRECT
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  tipoImovel: text("tipo_imovel").notNull(), // Casa, Apartamento, Terreno
  quartos: integer("quartos"),
  garagem: integer("garagem"),
  areaTotal: doublePrecision("area_total"),
  areaPrivativa: doublePrecision("area_privativa"),
  areaTerreno: doublePrecision("area_terreno"),
  endereco: text("endereco").notNull(),
  bairro: text("bairro"),
  cidade: text("cidade").notNull(),
  uf: text("uf").notNull(),
  cep: text("cep"),
  valorAvaliacao: doublePrecision("valor_avaliacao"),
  valorMinVenda: doublePrecision("valor_min_venda"),
  valorMinVenda1Leilao: doublePrecision("valor_min_venda_1_leilao"),
  valorMinVenda2Leilao: doublePrecision("valor_min_venda_2_leilao"),
  desconto: doublePrecision("desconto"), // percentage
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
  precoM2Mercado: doublePrecision("preco_m2_mercado"), // market price per sqm
  precoAluguelM2: doublePrecision("preco_aluguel_m2"), // rent price per sqm
  // Financial analysis scores
  scoreFLIP: doublePrecision("score_flip"),
  scoreReforma: doublePrecision("score_reforma"),
  scoreAluguel: doublePrecision("score_aluguel"),
  scoreGeral: doublePrecision("score_geral"),
  favorito: integer("favorito").default(0),
  notas: text("notas"),
  dataColeta: text("data_coleta"),
});

export const marketData = pgTable("market_data", {
  id: serial("id").primaryKey(),
  cidade: text("cidade").notNull(),
  uf: text("uf").notNull(),
  bairro: text("bairro"),
  tipoImovel: text("tipo_imovel"),
  precoM2Venda: doublePrecision("preco_m2_venda"),
  precoM2Aluguel: doublePrecision("preco_m2_aluguel"),
  precoM2AluguelCurta: doublePrecision("preco_m2_aluguel_curta"), // short stay
  taxaOcupacao: doublePrecision("taxa_ocupacao"), // occupancy rate %
  tendencia: text("tendencia"), // up, down, stable
});

export const insertPropertySchema = createInsertSchema(properties).omit({ id: true });
export const insertMarketDataSchema = createInsertSchema(marketData).omit({ id: true });

export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type MarketData = typeof marketData.$inferSelect;
export type InsertMarketData = z.infer<typeof insertMarketDataSchema>;
