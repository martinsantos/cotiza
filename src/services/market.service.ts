import { MarketData, CurrencyData, InflationData } from '../types/index.js';
import { getDb } from '../db/index.js';
import { dolarService } from './dolar.service.js';
import { logger } from '../utils/logger.js';

export class MarketService {
  async getMaterialPrices(category?: string): Promise<MarketData[]> {
    const db = getDb();
    let rows: any[];
    if (category) {
      rows = db.prepare('SELECT * FROM market_materials WHERE name LIKE ? COLLATE NOCASE').all(`%${category}%`);
    } else {
      rows = db.prepare('SELECT * FROM market_materials').all();
    }
    return rows.map((r: any) => ({
      materialCode: r.material_code,
      name: r.name,
      currentPrice: r.current_price,
      previousPrice: r.previous_price,
      unit: r.unit,
      currency: r.currency,
      lastUpdated: r.last_updated,
      trend: r.trend,
      source: r.source,
    }));
  }

  async getMaterialByCode(code: string): Promise<MarketData | null> {
    const db = getDb();
    const r = db.prepare('SELECT * FROM market_materials WHERE material_code = ?').get(code) as any;
    if (!r) return null;
    return {
      materialCode: r.material_code,
      name: r.name,
      currentPrice: r.current_price,
      previousPrice: r.previous_price,
      unit: r.unit,
      currency: r.currency,
      lastUpdated: r.last_updated,
      trend: r.trend,
      source: r.source,
    };
  }

  async getCurrencies(): Promise<CurrencyData[]> {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM market_currencies').all() as any[];
    return rows.map(r => ({
      pair: r.pair,
      buy: r.buy,
      sell: r.sell,
      lastUpdated: r.last_updated,
    }));
  }

  async getInflation(): Promise<InflationData | null> {
    const db = getDb();
    const r = db.prepare('SELECT * FROM market_inflation ORDER BY id DESC LIMIT 1').get() as any;
    if (!r) return null;
    return {
      period: r.period,
      monthly: r.monthly,
      annual: r.annual,
      source: r.source,
      lastUpdated: r.last_updated,
    };
  }

  async updateMarketData(): Promise<{ success: boolean; message: string }> {
    const updates: string[] = [];
    const errors: string[] = [];

    // 1. Fetch real currency rates
    try {
      const rates = await dolarService.fetchRates();
      if (rates.length > 0) {
        updates.push(`${rates.length} cotizaciones actualizadas`);
      }
    } catch (err) {
      logger.error('Error fetching currency rates:', { error: (err as Error).message });
      errors.push(`Cotizaciones: ${(err as Error).message}`);
    }

    // 2. Fetch real inflation data
    try {
      const inflation = await dolarService.fetchInflation();
      if (inflation) {
        updates.push(`Inflación ${inflation.period}: ${inflation.monthly}% mensual`);

        // 3. Adjust material prices by monthly inflation
        const db = getDb();
        const monthlyFactor = inflation.monthly / 100;
        if (monthlyFactor > 0) {
          db.prepare(`
            UPDATE market_materials
            SET previous_price = current_price,
                current_price = ROUND(current_price * (1 + ?), 0),
                trend = CASE
                  WHEN ? > 0.01 THEN 'up'
                  WHEN ? < -0.01 THEN 'down'
                  ELSE 'stable'
                END,
                last_updated = datetime('now')
            WHERE last_updated < datetime('now', '-1 day') OR last_updated IS NULL
          `).run(monthlyFactor, monthlyFactor, monthlyFactor);
          updates.push('Precios de materiales ajustados por inflación');
        }
      }
    } catch (err) {
      logger.error('Error fetching inflation data:', { error: (err as Error).message });
      errors.push(`Inflación: ${(err as Error).message}`);
    }

    const success = errors.length === 0;
    const message = success
      ? `Datos de mercado actualizados: ${updates.join(', ')}`
      : `Actualización parcial: ${updates.join(', ')}. Errores: ${errors.join(', ')}`;

    return { success, message };
  }

  async getEconomicContext(): Promise<{
    inflation: InflationData | null;
    currencies: CurrencyData[];
    summary: string;
  }> {
    const inflation = await this.getInflation();
    const currencies = await this.getCurrencies();
    const usdArs = currencies.find(c => c.pair === 'USD/ARS');

    return {
      inflation,
      currencies,
      summary: `
Contexto Económico Actual:
- Inflación mensual: ${inflation?.monthly || 'N/A'}%
- Inflación anual: ${inflation?.annual || 'N/A'}%
- Dólar Oficial: $${usdArs?.buy || 'N/A'}
- Dólar Blue: $${usdArs?.sell || 'N/A'}

Recomendaciones:
- Considerar ajuste de precios por inflación esperada
- Evaluar tipo de cambio para insumos importados
- Monitorear evolución de costos de materiales
      `.trim()
    };
  }

  async calculateInflationAdjustment(
    baseAmount: number,
    months: number,
    inflationRate?: number
  ): Promise<{
    adjustedAmount: number;
    inflationRate: number;
    months: number;
  }> {
    const inflation = await this.getInflation();
    const monthlyRate = inflationRate || (inflation?.monthly || 15) / 100;
    const adjustedAmount = baseAmount * Math.pow(1 + monthlyRate, months);

    return {
      adjustedAmount: Math.round(adjustedAmount),
      inflationRate: monthlyRate * 100,
      months
    };
  }

  getLastUpdate(): string | null {
    const db = getDb();
    // Get the max last_updated from any market table
    const matRow = db.prepare('SELECT MAX(last_updated) as lu FROM market_materials').get() as any;
    const curRow = db.prepare('SELECT MAX(last_updated) as lu FROM market_currencies').get() as any;
    const infRow = db.prepare('SELECT MAX(last_updated) as lu FROM market_inflation').get() as any;

    const dates = [matRow?.lu, curRow?.lu, infRow?.lu].filter(Boolean);
    if (dates.length === 0) return null;

    return dates.sort().reverse()[0];
  }
}

export const marketService = new MarketService();
