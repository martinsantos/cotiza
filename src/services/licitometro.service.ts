import axios, { AxiosInstance } from 'axios';
import { Tender } from '../types/index.js';
import { tenderService } from './tender.service.js';

interface LicitometroTender {
  id: string;
  numero: string;
  titulo: string;
  descripcion: string;
  organismo: string;
  jurisdiccion: string;
  rubro: string;
  estado: string;
  fecha_publicacion: string;
  fecha_apertura: string;
  monto_estimado: number;
  moneda: string;
  requisitos?: Array<{
    id: string;
    tipo: string;
    descripcion: string;
    obligatorio: boolean;
    peso?: number;
  }>;
  documentos?: Array<{
    id: string;
    nombre: string;
    tipo: string;
    url: string;
  }>;
  condiciones?: {
    plazo_entrega: string;
    lugar_entrega: string;
    garantia: string;
    vigencia_oferta: number;
  };
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

interface LicitometroResponse {
  data: LicitometroTender[];
  total: number;
  page: number;
  totalPages: number;
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

  private mapStatus(estado: string): 'abierta' | 'cerrada' | 'adjudicada' | 'desierta' {
    const statusMap: Record<string, 'abierta' | 'cerrada' | 'adjudicada' | 'desierta'> = {
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

  private mapTenderFromLicitometro(lt: LicitometroTender): Tender {
    return {
      id: `lm-${lt.id}`,
      number: lt.numero || '',
      title: lt.titulo || '',
      description: lt.descripcion || '',
      agency: lt.organismo || '',
      region: lt.jurisdiccion || '',
      category: this.normalizeCategory(lt.rubro),
      status: this.mapStatus(lt.estado),
      openingDate: lt.fecha_publicacion || new Date().toISOString(),
      closingDate: lt.fecha_apertura || new Date().toISOString(),
      budget: lt.monto_estimado || 0,
      currency: this.mapCurrency(lt.moneda),
      requirements: (lt.requisitos || []).map(r => ({
        id: r.id || `req-${Math.random().toString(36).slice(2, 8)}`,
        type: (r.tipo as 'technical' | 'commercial' | 'legal' | 'administrative') || 'technical',
        description: r.descripcion || '',
        mandatory: r.obligatorio !== false,
        weight: r.peso || 10
      })),
      documents: (lt.documentos || []).map(d => ({
        id: d.id || `doc-${Math.random().toString(36).slice(2, 8)}`,
        name: d.nombre || '',
        type: d.tipo || 'pdf',
        url: d.url || ''
      })),
      terms: {
        deliveryTime: lt.condiciones?.plazo_entrega || '',
        placeOfDelivery: lt.condiciones?.lugar_entrega || '',
        warranty: lt.condiciones?.garantia || '',
        validityOfOffer: lt.condiciones?.vigencia_oferta || 60
      }
    };
  }

  async search(params: LicitometroSearchParams): Promise<{ tenders: Tender[]; total: number }> {
    try {
      const response = await this.client.get<LicitometroResponse>('/licitaciones', {
        params: {
          q: params.q,
          estado: params.estado,
          jurisdiccion: params.jurisdiccion,
          rubro: params.rubro,
          organismo: params.organismo,
          fecha_desde: params.fecha_desde,
          fecha_hasta: params.fecha_hasta,
          monto_min: params.monto_min,
          monto_max: params.monto_max,
          page: params.page || 1,
          limit: params.limit || 20
        }
      });

      const tenders = response.data.data.map(lt => this.mapTenderFromLicitometro(lt));
      return { tenders, total: response.data.total };
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
      const searchParams = params || { estado: 'abierta', limit: 50 };
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
   * Obtiene las licitaciones marcadas como favoritas por el usuario en LICITOMETRO.AR.
   * Requiere LICITOMETRO_API_KEY configurada. Llama a GET /favoritos en la API de LICITOMETRO.
   */
  async getFavorites(): Promise<{ tenders: Tender[]; error?: string }> {
    if (!this.apiKey) {
      return {
        tenders: [],
        error: 'LICITOMETRO_API_KEY no configurada. Configure la variable de entorno para ver sus favoritos.'
      };
    }
    try {
      // El endpoint de favoritos de LICITOMETRO.AR devuelve los tenders favoritos del usuario autenticado
      const response = await this.client.get<LicitometroTender[] | { data: LicitometroTender[] }>('/favoritos', {
        timeout: 15000
      });

      // El endpoint puede retornar un array directo o un objeto { data: [...] }
      const raw = response.data;
      const items: LicitometroTender[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { data: LicitometroTender[] }).data)
          ? (raw as { data: LicitometroTender[] }).data
          : [];

      const tenders = items.map(lt => this.mapTenderFromLicitometro(lt));
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
   * Busca licitaciones históricas equivalentes (vencidas/adjudicadas/desiertas) en LICITOMETRO.AR
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

    // Buscar en múltiples estados de licitaciones vencidas
    const estados = ['cerrada', 'adjudicada', 'desierta'];
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
