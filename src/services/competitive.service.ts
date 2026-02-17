import { Tender, CompetitiveAnalysis, HistoricalBid, Competitor, Benchmark, CompetitiveScore } from '../types/index.js';
import { getDb } from '../db/index.js';

export class CompetitiveService {
  async analyze(tender: Tender): Promise<CompetitiveAnalysis> {
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
    const db = getDb();
    const rows = db.prepare('SELECT * FROM historical_bids WHERE year >= 2022').all() as any[];
    return rows.slice(0, 10).map(r => ({
      tenderId: r.tender_id,
      amount: r.amount,
      winner: r.winner === 1,
      year: r.year,
    }));
  }

  private getCompetitors(region: string): Competitor[] {
    const db = getDb();
    const rows = db.prepare(
      "SELECT * FROM competitors WHERE zone = ? OR zone = 'CABA'"
    ).all(region) as any[];
    return rows.map(r => ({
      name: r.name,
      winRate: r.win_rate,
      averageBid: r.average_bid,
      zone: r.zone,
    }));
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

    // Calculate prices with margin
    const minimum = Math.round(minPrice * (1 - margin / 100));
    const recommended = Math.round(avgPrice * (1 - (margin - 5) / 100));
    const maximum = Math.round(maxPrice * (1 - (margin - 10) / 100));

    // Determine strategy
    let strategy = 'COMPETITIVO';
    if (recommended < tender.budget * 0.85) {
      strategy = 'AGRESIVO - Puede bajar precio';
    } else if (recommended > tender.budget * 0.95) {
      strategy = 'CONSERVADOR - Considere aumentar precio';
    }

    return {
      minimum,
      recommended,
      maximum,
      strategy
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
    const db = getDb();
    const rows = db.prepare('SELECT * FROM historical_bids WHERE year >= 2020').all() as any[];
    const bids: HistoricalBid[] = rows.map(r => ({
      tenderId: r.tender_id,
      amount: r.amount,
      winner: r.winner === 1,
      year: r.year,
    }));

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
