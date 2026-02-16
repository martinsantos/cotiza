import { MarketData, CurrencyData, InflationData } from '../types/index.js';

export class MarketService {
  private materialPrices: Map<string, MarketData> = new Map();
  private currencies: Map<string, CurrencyData> = new Map();
  private inflation: InflationData | null = null;
  private lastUpdate: string | null = null;

  constructor() {
    this.initializeSampleData();
  }

  private initializeSampleData() {
    // Sample material prices
    const materials: MarketData[] = [
      {
        materialCode: 'AC-001',
        name: 'Acero constructivo',
        currentPrice: 285000,
        previousPrice: 275000,
        unit: 'tonelada',
        currency: 'ARS',
        lastUpdated: new Date().toISOString(),
        trend: 'up',
        source: 'construya.com'
      },
      {
        materialCode: 'CE-001',
        name: 'Cemento Portland',
        currentPrice: 12500,
        previousPrice: 12000,
        unit: 'tonelada',
        currency: 'ARS',
        lastUpdated: new Date().toISOString(),
        trend: 'up',
        source: 'construya.com'
      },
      {
        materialCode: 'HI-001',
        name: 'Hierro redondo 12mm',
        currentPrice: 9500,
        previousPrice: 9200,
        unit: 'barra 12m',
        currency: 'ARS',
        lastUpdated: new Date().toISOString(),
        trend: 'up',
        source: 'construya.com'
      },
      {
        materialCode: 'LO-001',
        name: 'Ladrillo hueco 18x18x33',
        currentPrice: 1800,
        previousPrice: 1750,
        unit: 'unidad',
        currency: 'ARS',
        lastUpdated: new Date().toISOString(),
        trend: 'stable',
        source: 'construya.com'
      },
      {
        materialCode: 'PE-001',
        name: 'Pintura látex interior',
        currentPrice: 5800,
        previousPrice: 5500,
        unit: 'balde 20L',
        currency: 'ARS',
        lastUpdated: new Date().toISOString(),
        trend: 'up',
        source: 'construya.com'
      },
      {
        materialCode: 'PL-001',
        name: 'Placa de yeso 1.20x2.40',
        currentPrice: 4200,
        previousPrice: 4300,
        unit: 'unidad',
        currency: 'ARS',
        lastUpdated: new Date().toISOString(),
        trend: 'down',
        source: 'construya.com'
      },
      {
        materialCode: 'CA-001',
        name: 'Cable unipolar 2.5mm',
        currentPrice: 850,
        previousPrice: 800,
        unit: 'metro',
        currency: 'ARS',
        lastUpdated: new Date().toISOString(),
        trend: 'up',
        source: 'construya.com'
      },
      {
        materialCode: 'TU-001',
        name: 'Tubo PVC 110mm',
        currentPrice: 2100,
        previousPrice: 2000,
        unit: 'metro',
        currency: 'ARS',
        lastUpdated: new Date().toISOString(),
        trend: 'up',
        source: 'construya.com'
      }
    ];

    materials.forEach(m => this.materialPrices.set(m.materialCode, m));

    // Sample currency data
    this.currencies.set('USD/ARS', {
      pair: 'USD/ARS',
      buy: 1045,
      sell: 1070,
      lastUpdated: new Date().toISOString()
    });

    this.currencies.set('EUR/ARS', {
      pair: 'EUR/ARS',
      buy: 1130,
      sell: 1165,
      lastUpdated: new Date().toISOString()
    });

    // Sample inflation data
    this.inflation = {
      period: 'Enero 2024',
      monthly: 15.8,
      annual: 254.2,
      source: 'INDEC',
      lastUpdated: new Date().toISOString()
    };

    this.lastUpdate = new Date().toISOString();
  }

  async getMaterialPrices(category?: string): Promise<MarketData[]> {
    if (category) {
      return Array.from(this.materialPrices.values()).filter(
        m => m.name.toLowerCase().includes(category.toLowerCase())
      );
    }
    return Array.from(this.materialPrices.values());
  }

  async getMaterialByCode(code: string): Promise<MarketData | null> {
    return this.materialPrices.get(code) || null;
  }

  async getCurrencies(): Promise<CurrencyData[]> {
    return Array.from(this.currencies.values());
  }

  async getInflation(): Promise<InflationData | null> {
    return this.inflation;
  }

  async updateMarketData(): Promise<{ success: boolean; message: string }> {
    // In a real implementation, this would fetch from external APIs
    // For now, we just return success
    this.lastUpdate = new Date().toISOString();
    return {
      success: true,
      message: 'Market data updated successfully'
    };
  }

  async getEconomicContext(): Promise<{
    inflation: InflationData | null;
    currencies: CurrencyData[];
    summary: string;
  }> {
    return {
      inflation: this.inflation,
      currencies: Array.from(this.currencies.values()),
      summary: `
Contexto Económico Actual:
- Inflación mensual: ${this.inflation?.monthly || 'N/A'}%
- Inflación anual: ${this.inflation?.annual || 'N/A'}%
- Dólar Oficial: $${this.currencies.get('USD/ARS')?.buy || 'N/A'}
- Dólar Blue: $${this.currencies.get('USD/ARS')?.sell || 'N/A'}

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
    const monthlyRate = inflationRate || (this.inflation?.monthly || 15) / 100;
    const adjustedAmount = baseAmount * Math.pow(1 + monthlyRate, months);

    return {
      adjustedAmount: Math.round(adjustedAmount),
      inflationRate: monthlyRate * 100,
      months
    };
  }

  getLastUpdate(): string | null {
    return this.lastUpdate;
  }
}

export const marketService = new MarketService();
