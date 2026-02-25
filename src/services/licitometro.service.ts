import axios, { AxiosInstance } from 'axios';
import { Tender } from '../types/index.js';
import { tenderService } from './tender.service.js';

// Campos reales del modelo Licitacion de LICITOMETRO.AR (FastAPI + MongoDB)
// Fuente: https://github.com/martinsantos/licitometro/blob/main/backend/models/licitacion.py
interface LicitometroTender {
  id: string;
  id_licitacion?: string;
  title: string;
  objeto?: string;
  organization?: string;
  budget?: number;
  currency?: string;
  status?: string;           // active, closed, awarded
  estado?: string;           // vigente, vencida, prorrogada, archivada
  publication_date?: string;
  opening_date?: string;
  expiration_date?: string;
  jurisdiccion?: string;
  category?: string;
  tipo_procedimiento?: string;
}

interface LicitometroSearchParams {
  q?: string;
  estado?: string;
  jurisdiccion?: string;
  rubro?: string;
  organismo?: string;
  fecha_desde?: string;
  fecha_hasta?: string;
  monto_min?: number;
  monto_max?: number;
  page?: number;
  limit?: number;
}

// Respuesta paginada real de GET /api/licitaciones
interface LicitometroResponse {
  items: LicitometroTender[];
  paginacion: {
    page: number;
    size: number;
    total: number;
  };
}

interface SyncResult {
  synced: number;
  errors: number;
  total: number;
  message: string;
}

export interface HistoricalEquivalent {
  id: string;
  number: string;
  title: string;
  agency: string;
  region: string;
  category: string;
  status: string;
  closingDate: string;
  budgetOriginal: number;
  budgetAdjusted: number;
  currency: string;
  inflationFactor: number;
}

export class LicitometroService {
  private client: AxiosInstance;
  private apiUrl: string;
  private apiKey: string;
  private lastSync: Date | null = null;

  constructor() {
    this.apiUrl = process.env.LICITOMETRO_API_URL || 'https://licitometro.ar/api';
    this.apiKey = process.env.LICITOMETRO_API_KEY || '';

    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
      }
    });
  }

  // Mapea estados reales de LICITOMETRO a valores internos de cotizAR
  private mapStatus(estado: string): 'abierta' | 'cerrada' | 'adjudicada' | 'desierta' {
    const statusMap: Record<string, 'abierta' | 'cerrada' | 'adjudicada' | 'desierta'> = {
      // Valores reales de LICITOMETRO
      'vigente': 'abierta',
      'active': 'abierta',
      'prorrogada': 'abierta',
      'vencida': 'cerrada',
      'closed': 'cerrada',
      'awarded': 'adjudicada',
      'archivada': 'desierta',
      // Compatibilidad con valores anteriores
      'abierta': 'abierta',
      'abierto': 'abierta',
      'en_curso': 'abierta',
      'publicada': 'abierta',
      'cerrada': 'cerrada',
      'cerrado': 'cerrada',
      'adjudicada': 'adjudicada',
      'adjudicado': 'adjudicada',
      'desierta': 'desierta',
      'desierto': 'desierta',
      'fracasada': 'desierta',
    };
    return statusMap[estado?.toLowerCase()] || 'abierta';
  }

  private mapCurrency(moneda: string): 'ARS' | 'USD' {
    if (moneda?.toUpperCase() === 'USD' || moneda?.toUpperCase() === 'DOL') return 'USD';
    return 'ARS';
  }

  private normalizeCategory(rubro: string): string {
    if (!rubro) return 'General';
    const lower = rubro.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const categoryMap: Array<{ keywords: string[]; category: string }> = [
      { keywords: ['obra', 'construccion', 'refaccion', 'edilicio', 'civil', 'vial', 'hidraulic'], category: 'Obras' },
      { keywords: ['servicio', 'limpieza', 'mantenimiento', 'vigilancia', 'seguridad', 'catering', 'logistic'], category: 'Servicios' },
      { keywords: ['suministro', 'compra', 'adquisicion', 'provision', 'insumo', 'alimento', 'medicamento'], category: 'Suministros' },
      { keywords: ['consultoria', 'asesoria', 'estudio', 'auditoria', 'proyecto', 'relevamiento'], category: 'Consultoria' },
      { keywords: ['tecnologia', 'informatica', 'software', 'hardware', 'sistema', 'computacion', 'redes', 'telecomunicacion'], category: 'Tecnologia' },
      { keywords: ['salud', 'medic', 'hospital', 'sanitari', 'farmac'], category: 'Salud' },
      { keywords: ['educacion', 'capacitacion', 'formacion', 'escuel'], category: 'Educacion' },
      { keywords: ['transporte', 'vehiculo', 'flota', 'logistic', 'flete'], category: 'Transporte' },
    ];

    for (const { keywords, category } of categoryMap) {
      if (keywords.some(kw => lower.includes(kw))) {
        return category;
      }
    }

    return rubro;
  }

  // Mapea los campos reales de LICITOMETRO al tipo interno Tender de cotizAR
  private mapTenderFromLicitometro(lt: LicitometroTender): Tender {
    return {
      id: `lm-${lt.id}`,
      number: lt.id_licitacion || lt.id || '',
      title: lt.title || '',
      description: lt.objeto || lt.title || '',
      agency: lt.organization || '',
      region: lt.jurisdiccion || '',
      category: this.normalizeCategory(lt.category || ''),
      status: this.mapStatus(lt.estado || lt.status || ''),
      openingDate: lt.publication_date || new Date().toISOString(),
      closingDate: lt.expiration_date || lt.opening_date || new Date().toISOString(),
      budget: lt.budget || 0,
      currency: this.mapCurrency(lt.currency || 'ARS'),
      requirements: [],
      documents: [],
      terms: {
        deliveryTime: '',
        placeOfDelivery: '',
        warranty: '',
        validityOfOffer: 60
      }
    };
  }

  async search(params: LicitometroSearchParams): Promise<{ tenders: Tender[]; total: number }> {
    try {
      // Params reales de la API LICITOMETRO (FastAPI)
      const response = await this.client.get<LicitometroResponse>('/licitaciones', {
        params: {
          q: params.q,
          status: params.estado,          // estado → status
          category: params.rubro,         // rubro → category
          jurisdiccion: params.jurisdiccion,
          budget_min: params.monto_min,   // monto_min → budget_min
          budget_max: params.monto_max,   // monto_max → budget_max
          fecha_desde: params.fecha_desde,
          fecha_hasta: params.fecha_hasta,
          page: params.page || 1,
          size: params.limit || 20,       // limit → size
        }
      });

      const items = response.data.items || [];
      const tenders = items.map(lt => this.mapTenderFromLicitometro(lt));
      return { tenders, total: response.data.paginacion?.total || tenders.length };
    } catch (error) {
      console.error('Error buscando en LICITOMETRO:', error);
      return { tenders: [], total: 0 };
    }
  }

  async getById(id: string): Promise<Tender | null> {
    try {
      const response = await this.client.get<LicitometroTender>(`/licitaciones/${id}`);
      return this.mapTenderFromLicitometro(response.data);
    } catch (error) {
      console.error(`Error obteniendo licitacion ${id} de LICITOMETRO:`, error);
      return null;
    }
  }

  async sync(params?: LicitometroSearchParams): Promise<SyncResult> {
    const result: SyncResult = { synced: 0, errors: 0, total: 0, message: '' };

    try {
      const searchParams = params || { estado: 'vigente', limit: 50 };
      const { tenders, total } = await this.search(searchParams);
      result.total = total;

      for (const tender of tenders) {
        try {
          const existing = await tenderService.getById(tender.id);
          if (existing) {
            await tenderService.update(tender.id, tender);
          } else {
            await tenderService.create(tender);
          }
          result.synced++;
        } catch {
          result.errors++;
        }
      }

      this.lastSync = new Date();
      result.message = `Sincronizacion completada: ${result.synced} licitaciones sincronizadas, ${result.errors} errores. Total en LICITOMETRO: ${result.total}`;
    } catch (error) {
      result.message = `Error de conexion con LICITOMETRO.AR: ${error instanceof Error ? error.message : 'Error desconocido'}. Usando datos locales.`;
    }

    return result;
  }

  getStatus(): { configured: boolean; apiUrl: string; lastSync: string | null } {
    return {
      configured: !!this.apiKey,
      apiUrl: this.apiUrl,
      lastSync: this.lastSync?.toISOString() || null
    };
  }

  async getScraperHealth(): Promise<Record<string, unknown>> {
    try {
      const response = await this.client.get('/health', { timeout: 10000 });
      return response.data as Record<string, unknown>;
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : 'No se pudo conectar con licitometro.ar',
        timestamp: new Date().toISOString()
      };
    }
  }

  async getScraperConfigs(): Promise<Record<string, unknown>[]> {
    try {
      const response = await this.client.get('/scraper-configs', { timeout: 10000 });
      return Array.isArray(response.data) ? response.data : [];
    } catch {
      return [];
    }
  }

  async getJurisdicciones(): Promise<string[]> {
    try {
      const response = await this.client.get<string[]>('/meta/jurisdicciones');
      return response.data;
    } catch {
      return [
        'CABA', 'Buenos Aires', 'Cordoba', 'Santa Fe', 'Mendoza',
        'Tucuman', 'Entre Rios', 'Salta', 'Misiones', 'Chaco',
        'Corrientes', 'Santiago del Estero', 'San Juan', 'Jujuy',
        'Rio Negro', 'Neuquen', 'Formosa', 'Chubut', 'San Luis',
        'Catamarca', 'La Rioja', 'La Pampa', 'Santa Cruz',
        'Tierra del Fuego', 'Nacional'
      ];
    }
  }

  /**
   * Obtiene las licitaciones marcadas como favoritas en LICITOMETRO.AR.
   *
   * Flujo real (verificado en https://github.com/martinsantos/licitometro):
   *   1. GET /licitaciones/favorites  →  string[]  (lista de IDs, endpoint público sin auth)
   *   2. Para cada ID: GET /licitaciones/{id}  →  LicitometroTender
   *   3. Mapea al tipo interno Tender y retorna
   *
   * El usuario marca favoritas en https://licitometro.ar/licitaciones. Los favoritos
   * son globales (no por usuario) en la DB de LICITOMETRO (colección db.favorites).
   */
  async getFavorites(): Promise<{ tenders: Tender[]; error?: string }> {
    try {
      // Paso 1: Obtener lista de IDs favoritos (endpoint público, sin autenticación)
      const idsResponse = await this.client.get<string[]>('/licitaciones/favorites', {
        timeout: 15000
      });

      const ids: string[] = Array.isArray(idsResponse.data) ? idsResponse.data : [];

      if (ids.length === 0) {
        return { tenders: [] };
      }

      // Paso 2: Fetch full tender data para cada ID (máximo 20 en paralelo)
      const batchIds = ids.slice(0, 20);
      const tenderPromises = batchIds.map(id =>
        this.client.get<LicitometroTender>(`/licitaciones/${id}`)
          .then(r => this.mapTenderFromLicitometro(r.data))
          .catch(() => null)
      );

      const results = await Promise.all(tenderPromises);
      const tenders = results.filter((t): t is Tender => t !== null);
      return { tenders };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      console.error('Error obteniendo favoritos de LICITOMETRO:', msg);
      return {
        tenders: [],
        error: `No se pudieron obtener los favoritos de LICITOMETRO.AR: ${msg}`
      };
    }
  }

  /**
   * Extrae las primeras palabras clave del título de una licitación para buscar equivalentes históricos.
   */
  private extractKeywords(title: string): string {
    // Stopwords comunes para filtrar
    const stopwords = new Set([
      'de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'o', 'a', 'para',
      'por', 'con', 'sin', 'un', 'una', 'se', 'al', 'lo', 'que', 'su', 'sus'
    ]);
    const words = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopwords.has(w));
    // Tomar las primeras 4 palabras clave con más de 4 caracteres
    return words.slice(0, 4).join(' ');
  }

  /**
   * Busca licitaciones históricas equivalentes (vencidas/archivadas) en LICITOMETRO.AR
   * para analizar antecedentes de competencia. Ajusta los montos por inflación.
   * @param tender - tender actual para buscar equivalentes
   * @param annualInflation - tasa de inflación anual (ej: 2.1 = 210%)
   */
  async searchHistoricalEquivalents(
    tender: { title: string; category: string; agency: string; region: string; budget: number },
    annualInflation: number = 2.1
  ): Promise<HistoricalEquivalent[]> {
    const keywords = this.extractKeywords(tender.title);
    const results: HistoricalEquivalent[] = [];

    // Buscar en estados vencidos reales de LICITOMETRO ('vencida', 'archivada')
    const estados = ['vencida', 'archivada'];
    const searches = estados.map(estado =>
      this.search({
        q: keywords,
        estado,
        rubro: tender.category,
        limit: 10
      }).catch(() => ({ tenders: [], total: 0 }))
    );

    const allResults = await Promise.all(searches);
    const seen = new Set<string>();

    for (const { tenders } of allResults) {
      for (const t of tenders) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);

        // Calcular ajuste por inflación según antigüedad
        const closingYear = new Date(t.closingDate).getFullYear();
        const currentYear = new Date().getFullYear();
        const yearsElapsed = Math.max(0, currentYear - closingYear);
        // Factor de ajuste acumulado: (1 + inflacion_anual) ^ años
        const inflationFactor = Math.pow(1 + annualInflation, yearsElapsed);
        const budgetAdjusted = Math.round(t.budget * inflationFactor);

        results.push({
          id: t.id,
          number: t.number,
          title: t.title,
          agency: t.agency,
          region: t.region,
          category: t.category,
          status: t.status,
          closingDate: t.closingDate,
          budgetOriginal: t.budget,
          budgetAdjusted,
          currency: t.currency,
          inflationFactor: Math.round(inflationFactor * 100) / 100
        });
      }
    }

    // Ordenar por fecha de cierre descendente (más recientes primero)
    return results
      .sort((a, b) => new Date(b.closingDate).getTime() - new Date(a.closingDate).getTime())
      .slice(0, 15);
  }

  async getRubros(): Promise<string[]> {
    try {
      const response = await this.client.get<string[]>('/meta/rubros');
      return response.data;
    } catch {
      return [
        'Servicios', 'Obras', 'Suministros', 'Consultoria',
        'Tecnologia', 'Salud', 'Educacion', 'Transporte',
        'Alimentos', 'Limpieza', 'Seguridad', 'Mantenimiento'
      ];
    }
  }
}

export const licitometroService = new LicitometroService();
