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

  private mapTenderFromLicitometro(lt: LicitometroTender): Tender {
    return {
      id: `lm-${lt.id}`,
      number: lt.numero || '',
      title: lt.titulo || '',
      description: lt.descripcion || '',
      agency: lt.organismo || '',
      region: lt.jurisdiccion || '',
      category: lt.rubro || 'General',
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
