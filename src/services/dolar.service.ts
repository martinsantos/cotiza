import axios from 'axios';
import { CurrencyData } from '../types/index.js';
import { getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

const DOLAR_API_URL = process.env.DOLAR_API_URL || 'https://dolarapi.com/v1';
const BCRA_API_URL = process.env.BCRA_API_URL || 'https://api.bcra.gob.ar';

export class DolarService {
  async fetchRates(): Promise<CurrencyData[]> {
    const results: CurrencyData[] = [];

    // Try DolarAPI first (most reliable, no auth needed)
    try {
      const [oficial, blue] = await withRetry(
        () => Promise.all([
          axios.get(`${DOLAR_API_URL}/dolares/oficial`, { timeout: 10000 }),
          axios.get(`${DOLAR_API_URL}/dolares/blue`, { timeout: 10000 }),
        ]),
        3,
        1000,
        'DolarAPI fetch rates'
      );

      const now = new Date().toISOString();

      if (oficial.data) {
        results.push({
          pair: 'USD/ARS',
          buy: oficial.data.compra || 0,
          sell: oficial.data.venta || 0,
          lastUpdated: now,
        });
      }

      if (blue.data) {
        results.push({
          pair: 'USD/ARS-BLUE',
          buy: blue.data.compra || 0,
          sell: blue.data.venta || 0,
          lastUpdated: now,
        });
      }

      // Try EUR
      try {
        const euro = await axios.get(`${DOLAR_API_URL}/cotizaciones/eur`, { timeout: 10000 });
        if (euro.data) {
          results.push({
            pair: 'EUR/ARS',
            buy: euro.data.compra || 0,
            sell: euro.data.venta || 0,
            lastUpdated: now,
          });
        }
      } catch {
        // EUR not critical
      }

    } catch (err) {
      logger.warn('DolarAPI failed, trying BCRA fallback:', { error: (err as Error).message });
      // BCRA fallback
      try {
        const [buyRes, sellRes] = await withRetry(
          () => Promise.all([
            axios.get(`${BCRA_API_URL}/estadisticas/v2.0/DatosVariable/4/Ultimos/1`, { timeout: 10000 }),
            axios.get(`${BCRA_API_URL}/estadisticas/v2.0/DatosVariable/5/Ultimos/1`, { timeout: 10000 }),
          ]),
          3,
          1000,
          'BCRA fallback fetch rates'
        );
        const buyData = buyRes.data?.results?.[0];
        const sellData = sellRes.data?.results?.[0];
        if (buyData || sellData) {
          results.push({
            pair: 'USD/ARS',
            buy: buyData?.valor || 0,
            sell: sellData?.valor || 0,
            lastUpdated: new Date().toISOString(),
          });
        }
      } catch (bcraErr) {
        logger.error('BCRA API also failed:', { error: (bcraErr as Error).message });
      }
    }

    // Persist to DB
    if (results.length > 0) {
      const db = getDb();
      const upsert = db.prepare(`
        INSERT OR REPLACE INTO market_currencies (pair, buy, sell, last_updated, source)
        VALUES (?, ?, ?, ?, ?)
      `);
      const saveAll = db.transaction(() => {
        for (const rate of results) {
          upsert.run(rate.pair, rate.buy, rate.sell, rate.lastUpdated, 'dolarapi.com');
        }
      });
      saveAll();
    }

    return results;
  }

  async fetchInflation(): Promise<{ period: string; monthly: number; annual: number } | null> {
    try {
      // BCRA variable 27 = IPC monthly variation
      const response = await withRetry(
        () => axios.get(
          `${BCRA_API_URL}/estadisticas/v2.0/DatosVariable/27/Ultimos/1`,
          { timeout: 10000 }
        ),
        3,
        1000,
        'BCRA inflation fetch'
      );
      const data = response.data?.results?.[0];
      if (data) {
        const monthly = data.valor || 0;
        const result = {
          period: data.fecha || new Date().toISOString().slice(0, 7),
          monthly,
          annual: Math.round(((Math.pow(1 + monthly / 100, 12) - 1) * 100) * 10) / 10,
        };

        // Persist
        const db = getDb();
        db.prepare(`
          INSERT INTO market_inflation (period, monthly, annual, source, last_updated)
          VALUES (?, ?, ?, 'BCRA', datetime('now'))
        `).run(result.period, result.monthly, result.annual);

        return result;
      }
    } catch (err) {
      logger.warn('BCRA inflation API failed:', { error: (err as Error).message });
    }
    return null;
  }
}

export const dolarService = new DolarService();
