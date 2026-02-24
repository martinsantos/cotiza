import { MarketData, CurrencyData, InflationData } from '../types/index.js';
import https from 'https';

// APIs públicas argentinas — sin auth, sin costo
const DOLAR_API_URL = 'https://dolarapi.com/v1/dolares';
const INDEC_IPC_URL = 'https://apis.datos.gob.ar/series/api/series/?ids=148.3_INIVELNAL_DICI_M_26:percent_change&limit=1&sort=desc';

function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

export class MarketService {
  private materialPrices: Map<string, MarketData> = new Map();
  private currencies: Map<string, CurrencyData> = new Map();
  private inflation: InflationData | null = null;
  private lastUpdate: string | null = null;
  private fetchPromise: Promise<void> | null = null;

  constructor() {
    this.loadStaticMaterials();
    this.loadFallbackEconomicData();
    // Actualizar datos reales al arrancar (no bloquea)
    this.updateMarketData().catch(() => {});
  }

  // ── Materiales: precios estáticos actualizados (sin API disponible) ──────
  private loadStaticMaterials(): void {
    const now = new Date().toISOString();
    // Precios feb-2026 aproximados
    const materials: MarketData[] = [
      { materialCode: 'AC-001', name: 'Acero constructivo', currentPrice: 1850000, previousPrice: 1700000, unit: 'tonelada', currency: 'ARS', lastUpdated: now, trend: 'up', source: 'referencia mercado' },
      { materialCode: 'CE-001', name: 'Cemento Portland', currentPrice: 95000, previousPrice: 88000, unit: 'tonelada', currency: 'ARS', lastUpdated: now, trend: 'up', source: 'referencia mercado' },
      { materialCode: 'HI-001', name: 'Hierro redondo 12mm', currentPrice: 62000, previousPrice: 58000, unit: 'barra 12m', currency: 'ARS', lastUpdated: now, trend: 'up', source: 'referencia mercado' },
      { materialCode: 'LO-001', name: 'Ladrillo hueco 18x18x33', currentPrice: 12500, previousPrice: 11800, unit: 'unidad', currency: 'ARS', lastUpdated: now, trend: 'up', source: 'referencia mercado' },
      { materialCode: 'PE-001', name: 'Pintura látex interior', currentPrice: 38000, previousPrice: 35000, unit: 'balde 20L', currency: 'ARS', lastUpdated: now, trend: 'up', source: 'referencia mercado' },
      { materialCode: 'PL-001', name: 'Placa de yeso 1.20x2.40', currentPrice: 28000, previousPrice: 27000, unit: 'unidad', currency: 'ARS', lastUpdated: now, trend: 'stable', source: 'referencia mercado' },
      { materialCode: 'CA-001', name: 'Cable unipolar 2.5mm', currentPrice: 5800, previousPrice: 5400, unit: 'metro', currency: 'ARS', lastUpdated: now, trend: 'up', source: 'referencia mercado' },
      { materialCode: 'TU-001', name: 'Tubo PVC 110mm', currentPrice: 14500, previousPrice: 13800, unit: 'metro', currency: 'ARS', lastUpdated: now, trend: 'up', source: 'referencia mercado' },
    ];
    materials.forEach(m => this.materialPrices.set(m.materialCode, m));
  }

  // ── Datos económicos base (fallback si las APIs fallan) ──────────────────
  private loadFallbackEconomicData(): void {
    const now = new Date().toISOString();
    this.currencies.set('USD/ARS Oficial', {
      pair: 'USD/ARS Oficial',
      buy: 1065,
      sell: 1065,
      lastUpdated: now
    });
    this.currencies.set('USD/ARS Blue', {
      pair: 'USD/ARS Blue',
      buy: 1175,
      sell: 1185,
      lastUpdated: now
    });
    this.currencies.set('USD/ARS MEP', {
      pair: 'USD/ARS MEP',
      buy: 1140,
      sell: 1145,
      lastUpdated: now
    });
    // Inflación feb-2026 (estimada)
    this.inflation = {
      period: 'Febrero 2026',
      monthly: 2.4,
      annual: 65.5,
      source: 'INDEC estimado',
      lastUpdated: now
    };
    this.lastUpdate = now;
  }

  // ── Fetch real desde dolarapi.com ────────────────────────────────────────
  private async fetchDolares(): Promise<void> {
    try {
      const data = await fetchJson(DOLAR_API_URL) as Array<{
        nombre: string; compra: number; venta: number; actualizado: string;
      }>;
      if (!Array.isArray(data)) return;

      const nameMap: Record<string, string> = {
        'Oficial': 'USD/ARS Oficial',
        'Blue': 'USD/ARS Blue',
        'Bolsa': 'USD/ARS MEP',
        'Contado con liquidación': 'USD/ARS CCL',
        'Mayorista': 'USD/ARS Mayorista',
        'Cripto': 'USD/ARS Cripto',
      };

      for (const d of data) {
        const pairName = nameMap[d.nombre] || `USD/ARS ${d.nombre}`;
        this.currencies.set(pairName, {
          pair: pairName,
          buy: d.compra,
          sell: d.venta,
          lastUpdated: d.actualizado || new Date().toISOString()
        });
      }
      console.log(`[MarketService] ${data.length} cotizaciones cargadas de dolarapi.com`);
    } catch (err) {
      console.warn('[MarketService] dolarapi.com no disponible, usando valores de fallback');
    }
  }

  // ── Fetch inflación del INDEC (datos abiertos) ───────────────────────────
  private async fetchInflacion(): Promise<void> {
    try {
      const data = await fetchJson(INDEC_IPC_URL) as {
        data?: Array<[string, number]>;
        meta?: Array<{ description?: string }>;
      };
      if (!data?.data?.[0]) return;

      const [fecha, valor] = data.data[0];
      const [year, month] = fecha.split('-');
      const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      const mesNombre = meses[parseInt(month, 10) - 1] || month;

      // Calcular anual acumulando los últimos 12 meses (si vienen disponibles)
      let annual = 0;
      if (Array.isArray(data.data) && data.data.length >= 12) {
        annual = data.data.slice(0, 12).reduce((acc: number, [, v]: [string, number]) => acc * (1 + v / 100), 1);
        annual = Math.round((annual - 1) * 1000) / 10;
      }

      this.inflation = {
        period: `${mesNombre} ${year}`,
        monthly: Math.round(valor * 10) / 10,
        annual: annual || this.inflation?.annual || 65.5,
        source: 'INDEC - datos.gob.ar',
        lastUpdated: new Date().toISOString()
      };
      console.log(`[MarketService] Inflación INDEC: ${valor}% (${mesNombre} ${year})`);
    } catch (err) {
      console.warn('[MarketService] INDEC API no disponible, usando inflación estimada');
    }
  }

  // ── API pública ──────────────────────────────────────────────────────────

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
    // Evitar múltiples fetches simultáneos
    if (this.fetchPromise) {
      await this.fetchPromise;
      return { success: true, message: 'Actualización en curso completada' };
    }

    this.fetchPromise = Promise.all([
      this.fetchDolares(),
      this.fetchInflacion()
    ]).then(() => {
      this.lastUpdate = new Date().toISOString();
      // Actualizar materiales con timestamp
      this.materialPrices.forEach(m => {
        m.lastUpdated = this.lastUpdate!;
      });
    }).finally(() => {
      this.fetchPromise = null;
    });

    await this.fetchPromise;
    return {
      success: true,
      message: `Datos actualizados: ${new Date(this.lastUpdate!).toLocaleString('es-AR')}`
    };
  }

  async getEconomicContext(): Promise<{
    inflation: InflationData | null;
    currencies: CurrencyData[];
    summary: string;
  }> {
    const currencies = Array.from(this.currencies.values());
    const oficial = currencies.find(c => c.pair.includes('Oficial'));
    const blue = currencies.find(c => c.pair.includes('Blue'));
    const lastUpdate = this.lastUpdate
      ? new Date(this.lastUpdate).toLocaleString('es-AR')
      : 'N/A';

    return {
      inflation: this.inflation,
      currencies,
      summary: `Contexto Económico Actual (${lastUpdate}):
- Inflación mensual: ${this.inflation?.monthly ?? 'N/A'}% (${this.inflation?.source ?? ''})
- Inflación anual: ${this.inflation?.annual ?? 'N/A'}%
- Dólar Oficial: $${oficial?.sell ?? 'N/A'} ARS
- Dólar Blue: $${blue?.sell ?? 'N/A'} ARS

Recomendaciones para cotizar:
- Considerar ajuste por inflación mensual esperada en el plazo del contrato
- Evaluar insumos importados con tipo de cambio MEP o CCL
- Incluir cláusula de redeterminación de precios en contratos +6 meses
- Usar dólar oficial para contratos en USD con el Estado`.trim()
    };
  }

  async calculateInflationAdjustment(
    baseAmount: number,
    months: number,
    inflationRate?: number
  ): Promise<{ adjustedAmount: number; inflationRate: number; months: number }> {
    const monthlyRate = inflationRate || (this.inflation?.monthly || 2.4) / 100;
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
