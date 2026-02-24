import { Tender, CompetitiveAnalysis, HistoricalBid, Competitor, Benchmark, CompetitiveScore, CompetitiveConfig } from '../types/index.js';
import { getConfig } from '../config/index.js';

export class CompetitiveService {
  private historicalBids: HistoricalBid[] = [];
  private competitors: Competitor[] = [];

  constructor() {
    this.initializeSampleData();
  }

  private initializeSampleData() {
    // Sample historical bids
    this.historicalBids = [
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

    // Sample competitors
    this.competitors = [
      {
        name: 'Empresa A SA',
        winRate: 0.35,
        averageBid: 47000000,
        zone: 'CABA'
      },
      {
        name: 'Empresa B SA',
        winRate: 0.28,
        averageBid: 49000000,
        zone: 'CABA'
      },
      {
        name: 'Empresa C SA',
        winRate: 0.22,
        averageBid: 51000000,
        zone: 'Buenos Aires'
      },
      {
        name: 'Empresa D SA',
        winRate: 0.15,
        averageBid: 44000000,
        zone: 'CABA'
      }
    ];
  }

  async analyze(tender: Tender, competitiveCfg?: Partial<CompetitiveConfig>): Promise<CompetitiveAnalysis> {
    const cfg: CompetitiveConfig = { ...getConfig().competitive, ...(competitiveCfg || {}) };

    // Merge custom competitors from config into the sample set
    const configCompetitors: Competitor[] = (cfg.customCompetitors || []).map(c => ({
      name: c.name, winRate: c.winRate, averageBid: c.averageBid, zone: c.zone
    }));

    // Merge custom historical bids from config
    const configHistorical: HistoricalBid[] = (cfg.historicalBids || []).map(b => ({
      tenderId: b.tenderId, category: b.category, amount: b.amount,
      winner: b.won, year: b.year
    }));

    if (configCompetitors.length > 0) this.competitors = [...configCompetitors, ...this.competitors.slice(0, 4)];
    if (configHistorical.length > 0) this.historicalBids = [...configHistorical, ...this.historicalBids];

    const historicalData = this.getHistoricalBids(tender.category);
    const competitors = this.getCompetitors(tender.region);
    const benchmark = this.calculateBenchmark(tender, historicalData);
    const score = this.calculateScore(tender);

    return {
      tenderId: tender.id,
      historicalData,
      competitors,
      benchmark,
      score
    };
  }

  private getHistoricalBids(category: string): HistoricalBid[] {
    const lowerCategory = category.toLowerCase();
    const byCategory = this.historicalBids.filter(bid =>
      bid.year >= 2022 && bid.category.toLowerCase() === lowerCategory
    );
    // Fall back to all recent bids if no category match
    if (byCategory.length === 0) {
      return this.historicalBids.filter(bid => bid.year >= 2022).slice(0, 10);
    }
    return byCategory.slice(0, 10);
  }

  private getCompetitors(region: string): Competitor[] {
    // Return all competitors or filter by region
    return this.competitors.filter(c => 
      c.zone === region || c.zone === 'CABA'
    );
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
    // Base score
    let priceScore = 50;
    let technicalScore = 50;
    let experienceScore = 50;

    // Price analysis
    const budgetRatio = tender.budget / 10000000; // Normalize
    if (budgetRatio > 10) {
      priceScore = 60;
    } else if (budgetRatio > 5) {
      priceScore = 55;
    }

    // Technical score based on days until close
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

    // Experience score based on requirements
    const hasTechnicalRequirements = tender.requirements.some(
      r => r.type === 'technical' && r.mandatory
    );
    if (hasTechnicalRequirements) {
      experienceScore = 55;
    }

    const total = Math.round((priceScore * 0.4 + technicalScore * 0.3 + experienceScore * 0.3));

    return {
      total,
      priceScore,
      technicalScore,
      experienceScore
    };
  }

  async getPriceRecommendation(
    tender: Tender,
    benchmark: Benchmark,
    margin?: number
  ): Promise<{
    minimum: number;
    recommended: number;
    maximum: number;
    strategy: string;
    marginUsed: number;
  }> {
    const effectiveMargin = margin ?? getConfig().competitive.targetMarginPct ?? 15;
    const minPrice = benchmark.lowestWinningPrice;
    const avgPrice = benchmark.averageMarketPrice;
    const maxPrice = benchmark.highestWinningPrice;

    // Calculate prices with margin
    const minimum = Math.round(minPrice * (1 - effectiveMargin / 100));
    const recommended = Math.round(avgPrice * (1 - Math.max(effectiveMargin - 5, 0) / 100));
    const maximum = Math.round(maxPrice * (1 - Math.max(effectiveMargin - 10, 0) / 100));

    // Determine strategy
    let strategy = 'COMPETITIVO';
    if (recommended < tender.budget * 0.80) {
      strategy = 'AGRESIVO — precio muy por debajo del presupuesto';
    } else if (recommended < tender.budget * 0.90) {
      strategy = 'COMPETITIVO — buen margen respecto al presupuesto';
    } else if (recommended <= tender.budget) {
      strategy = 'CONSERVADOR — precio cerca del presupuesto oficial';
    } else {
      strategy = '⚠️ EXCEDE PRESUPUESTO — revisar costos';
    }

    return {
      minimum,
      recommended,
      maximum,
      strategy,
      marginUsed: effectiveMargin
    };
  }

  async getCompetitorAnalysis(region: string): Promise<{
    competitors: Competitor[];
    marketShare: { name: string; share: number }[];
    recommendations: string[];
  }> {
    const activeCompetitors = this.getCompetitors(region);
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

    return {
      competitors: activeCompetitors,
      marketShare,
      recommendations
    };
  }

  async getHistoricalReport(tenderType: string): Promise<{
    totalBids: number;
    averageWinningPrice: number;
    winningRate: number;
    trends: { year: number; averagePrice: number; count: number }[];
  }> {
    const bids = this.historicalBids.filter(b => b.year >= 2020);
    
    const totalBids = bids.length;
    const winningBids = bids.filter(b => b.winner);
    const winningRate = totalBids > 0 ? winningBids.length / totalBids : 0;

    const avgWinning = winningBids.length > 0
      ? winningBids.reduce((sum, b) => sum + b.amount, 0) / winningBids.length
      : 0;

    // Calculate trends by year
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

    return {
      totalBids,
      averageWinningPrice: avgWinning,
      winningRate,
      trends
    };
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

    // Price factor
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

    // Historical winning prices
    if (bidAmount <= benchmark.lowestWinningPrice) {
      probability += 15;
      factors.push({ name: 'Precio histórico ganador', impact: 15 });
    }

    // Days factor
    const daysUntilClose = Math.ceil(
      (new Date(tender.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilClose > 21) {
      probability += 5;
      factors.push({ name: 'Tiempo充足', impact: 5 });
    }

    // Clamp probability
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
