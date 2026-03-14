import { Tender, CompetitiveAnalysis, HistoricalBid, Competitor, Benchmark, CompetitiveScore } from '../types/index.js';
import { licitometroService as defaultLicitometroService, LicitometroService, HistoricalEquivalent } from './licitometro.service.js';

export class CompetitiveService {
  private licitometroService: LicitometroService;

  constructor(licitometroService?: LicitometroService) {
    this.licitometroService = licitometroService ?? defaultLicitometroService;
  }

  async analyze(tender: Tender): Promise<CompetitiveAnalysis> {
    // Try to get real historical data from LICITOMETRO.AR
    let historicalData: HistoricalBid[];
    let dataSource: 'real' | 'mock' = 'real';

    try {
      const equivalents = await this.licitometroService.searchHistoricalEquivalents({
        title: tender.title,
        category: tender.category,
        agency: tender.agency,
        region: tender.region,
        budget: tender.budget
      });

      if (equivalents.length > 0) {
        // Map real historical equivalents to HistoricalBid format
        historicalData = equivalents.map((eq: HistoricalEquivalent) => ({
          tenderId: eq.id,
          category: eq.category,
          amount: eq.budgetAdjusted || eq.budgetOriginal,
          winner: eq.status === 'adjudicada',
          year: new Date(eq.closingDate).getFullYear()
        }));
      } else {
        // No real data found — fall back to mock with disclaimer
        dataSource = 'mock';
        historicalData = this.getMockHistoricalBids(tender.category);
      }
    } catch {
      dataSource = 'mock';
      historicalData = this.getMockHistoricalBids(tender.category);
    }

    const competitors = this.getDefaultCompetitors(tender.region);
    const benchmark = this.calculateBenchmark(tender, historicalData);
    const score = this.calculateScore(tender);

    const analysis: CompetitiveAnalysis = {
      tenderId: tender.id,
      historicalData,
      competitors,
      benchmark,
      score
    };

    // Attach data source disclaimer via metadata (non-breaking addition)
    (analysis as any).dataSource = dataSource;
    (analysis as any).disclaimer = dataSource === 'mock'
      ? 'No se encontraron antecedentes históricos reales en LICITOMETRO.AR para esta licitación. Los datos mostrados son estimaciones de referencia.'
      : `Análisis basado en ${historicalData.length} licitaciones históricas de LICITOMETRO.AR. Los competidores son una estimación de mercado.`;

    return analysis;
  }

  private getMockHistoricalBids(category: string): HistoricalBid[] {
    const allBids: HistoricalBid[] = [
      { tenderId: 'lic-001', category: 'Servicios', amount: 45000000, winner: true, year: 2023 },
      { tenderId: 'lic-001', category: 'Servicios', amount: 48000000, winner: false, year: 2023 },
      { tenderId: 'lic-001', category: 'Servicios', amount: 52000000, winner: false, year: 2023 },
      { tenderId: 'lic-002', category: 'Obras', amount: 230000000, winner: true, year: 2023 },
      { tenderId: 'lic-002', category: 'Obras', amount: 245000000, winner: false, year: 2023 },
      { tenderId: 'lic-003', category: 'Suministros', amount: 165000000, winner: true, year: 2023 },
      { tenderId: 'lic-003', category: 'Suministros', amount: 175000000, winner: false, year: 2023 },
      { tenderId: 'lic-003', category: 'Suministros', amount: 180000000, winner: false, year: 2023 },
      { tenderId: 'lic-001', category: 'Servicios', amount: 42000000, winner: true, year: 2022 },
      { tenderId: 'lic-001', category: 'Servicios', amount: 45000000, winner: false, year: 2022 }
    ];

    const lowerCategory = category.toLowerCase();
    const byCategory = allBids.filter(bid =>
      bid.year >= 2022 && bid.category.toLowerCase() === lowerCategory
    );
    if (byCategory.length === 0) {
      return allBids.filter(bid => bid.year >= 2022).slice(0, 10);
    }
    return byCategory.slice(0, 10);
  }

  private getDefaultCompetitors(region: string): Competitor[] {
    const competitors: Competitor[] = [
      { name: 'Empresa A SA', winRate: 0.35, averageBid: 47000000, zone: 'CABA' },
      { name: 'Empresa B SA', winRate: 0.28, averageBid: 49000000, zone: 'CABA' },
      { name: 'Empresa C SA', winRate: 0.22, averageBid: 51000000, zone: 'Buenos Aires' },
      { name: 'Empresa D SA', winRate: 0.15, averageBid: 44000000, zone: 'CABA' }
    ];
    return competitors.filter(c => c.zone === region || c.zone === 'CABA');
  }

  private calculateBenchmark(tender: Tender, historical: HistoricalBid[]): Benchmark {
    const winningBids = historical.filter(b => b.winner);

    if (winningBids.length === 0) {
      return {
        averageMarketPrice: tender.budget * 0.9,
        lowestWinningPrice: tender.budget * 0.85,
        highestWinningPrice: tender.budget * 0.95
      };
    }

    const prices = winningBids.map(b => b.amount);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    return {
      averageMarketPrice: avgPrice,
      lowestWinningPrice: minPrice,
      highestWinningPrice: maxPrice
    };
  }

  private calculateScore(tender: Tender): CompetitiveScore {
    let priceScore = 50;
    let technicalScore = 50;
    let experienceScore = 50;

    const budgetRatio = tender.budget / 10000000;
    if (budgetRatio > 10) {
      priceScore = 60;
    } else if (budgetRatio > 5) {
      priceScore = 55;
    }

    const daysUntilClose = Math.ceil(
      (new Date(tender.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilClose > 30) {
      technicalScore = 60;
    } else if (daysUntilClose > 14) {
      technicalScore = 55;
    } else if (daysUntilClose < 7) {
      technicalScore = 40;
    }

    const hasTechnicalRequirements = tender.requirements.some(
      r => r.type === 'technical' && r.mandatory
    );
    if (hasTechnicalRequirements) {
      experienceScore = 55;
    }

    const total = Math.round((priceScore * 0.4 + technicalScore * 0.3 + experienceScore * 0.3));

    return { total, priceScore, technicalScore, experienceScore };
  }

  async getPriceRecommendation(
    tender: Tender,
    benchmark: Benchmark,
    margin: number = 15
  ): Promise<{
    minimum: number;
    recommended: number;
    maximum: number;
    strategy: string;
  }> {
    const minPrice = benchmark.lowestWinningPrice;
    const avgPrice = benchmark.averageMarketPrice;
    const maxPrice = benchmark.highestWinningPrice;

    const minimum = Math.round(minPrice * (1 - margin / 100));
    const recommended = Math.round(avgPrice * (1 - (margin - 5) / 100));
    const maximum = Math.round(maxPrice * (1 - (margin - 10) / 100));

    let strategy = 'COMPETITIVO';
    if (recommended < tender.budget * 0.85) {
      strategy = 'AGRESIVO - Puede bajar precio';
    } else if (recommended > tender.budget * 0.95) {
      strategy = 'CONSERVADOR - Considere aumentar precio';
    }

    return { minimum, recommended, maximum, strategy };
  }

  async getCompetitorAnalysis(region: string): Promise<{
    competitors: Competitor[];
    marketShare: { name: string; share: number }[];
    recommendations: string[];
  }> {
    const activeCompetitors = this.getDefaultCompetitors(region);
    const totalWins = activeCompetitors.reduce((sum, c) => sum + c.winRate, 0);

    const marketShare = activeCompetitors.map(c => ({
      name: c.name,
      share: Math.round((c.winRate / totalWins) * 100)
    }));

    const recommendations = [
      `Principales competidores en la zona: ${activeCompetitors.map(c => c.name).join(', ')}`,
      `Tasa de victorias promedio del mercado: ${Math.round(totalWins * 100 / activeCompetitors.length)}%`,
      'Investigar estrategias de precios de competidores exitosos',
      'Identificar diferenciales competitivos'
    ];

    return { competitors: activeCompetitors, marketShare, recommendations };
  }

  async getHistoricalReport(tenderType: string): Promise<{
    totalBids: number;
    averageWinningPrice: number;
    winningRate: number;
    trends: { year: number; averagePrice: number; count: number }[];
  }> {
    const bids = this.getMockHistoricalBids(tenderType);

    const totalBids = bids.length;
    const winningBids = bids.filter(b => b.winner);
    const winningRate = totalBids > 0 ? winningBids.length / totalBids : 0;

    const avgWinning = winningBids.length > 0
      ? winningBids.reduce((sum, b) => sum + b.amount, 0) / winningBids.length
      : 0;

    const yearGroups = new Map<number, number[]>();
    winningBids.forEach(b => {
      const prices = yearGroups.get(b.year) || [];
      prices.push(b.amount);
      yearGroups.set(b.year, prices);
    });

    const trends = Array.from(yearGroups.entries()).map(([year, prices]) => ({
      year,
      averagePrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      count: prices.length
    }));

    return { totalBids, averageWinningPrice: avgWinning, winningRate, trends };
  }

  async calculateWinProbability(
    tender: Tender,
    bidAmount: number,
    benchmark: Benchmark
  ): Promise<{
    probability: number;
    factors: { name: string; impact: number }[];
    advice: string;
  }> {
    const factors: { name: string; impact: number }[] = [];
    let probability = 50;

    const priceRatio = bidAmount / tender.budget;
    if (priceRatio <= 0.9) {
      probability += 20;
      factors.push({ name: 'Precio competitivo', impact: 20 });
    } else if (priceRatio <= 0.95) {
      probability += 10;
      factors.push({ name: 'Precio adecuado', impact: 10 });
    } else if (priceRatio > 1.0) {
      probability -= 30;
      factors.push({ name: 'Precio excede presupuesto', impact: -30 });
    }

    if (bidAmount <= benchmark.lowestWinningPrice) {
      probability += 15;
      factors.push({ name: 'Precio histórico ganador', impact: 15 });
    }

    const daysUntilClose = Math.ceil(
      (new Date(tender.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilClose > 21) {
      probability += 5;
      factors.push({ name: 'Tiempo suficiente', impact: 5 });
    }

    probability = Math.max(5, Math.min(95, probability));

    let advice = '';
    if (probability >= 70) {
      advice = 'Oferta fuerte - Prosiga con la presentación';
    } else if (probability >= 50) {
      advice = 'Oferta moderada - Considere optimizar precio';
    } else {
      advice = 'Oferta débil - Revise estrategia';
    }

    return { probability, factors, advice };
  }
}

export const competitiveService = new CompetitiveService();
