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

  private getFallbackTenders(params: LicitometroSearchParams): LicitometroTender[] {
    const now = new Date();
    const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

    const base: LicitometroTender[] = [
      {
        id: 'fb-001',
        numero: 'LP-2026-0045',
        titulo: 'Servicio de Limpieza y Mantenimiento de Espacios Públicos',
        descripcion: 'Contratación del servicio integral de limpieza y mantenimiento de plazas, parques y espacios verdes del municipio.',
        organismo: 'Ministerio de Espacio Público e Higiene Urbana',
        jurisdiccion: 'CABA',
        rubro: 'Servicios de limpieza',
        estado: 'abierta',
        fecha_publicacion: daysFromNow(-10),
        fecha_apertura: daysFromNow(25),
        monto_estimado: 48000000,
        moneda: 'ARS',
        requisitos: [
          { id: 'r1', tipo: 'technical', descripcion: 'Experiencia mínima de 3 años en servicios similares', obligatorio: true, peso: 25 },
          { id: 'r2', tipo: 'commercial', descripcion: 'Precio dentro del presupuesto oficial', obligatorio: true, peso: 40 },
          { id: 'r3', tipo: 'legal', descripcion: 'Habilitación municipal vigente', obligatorio: true, peso: 20 },
        ]
      },
      {
        id: 'fb-002',
        numero: 'CD-2026-0112',
        titulo: 'Adquisición de Equipamiento Informático para Dependencias Públicas',
        descripcion: 'Compra de 300 computadoras de escritorio, 80 laptops y equipamiento periférico para modernización de oficinas públicas.',
        organismo: 'Secretaría de Modernización del Estado',
        jurisdiccion: 'Nacional',
        rubro: 'Tecnología informática',
        estado: 'abierta',
        fecha_publicacion: daysFromNow(-5),
        fecha_apertura: daysFromNow(18),
        monto_estimado: 125000000,
        moneda: 'ARS',
        requisitos: [
          { id: 'r4', tipo: 'technical', descripcion: 'Equipos con certificación IRAM o equivalente internacional', obligatorio: true, peso: 20 },
          { id: 'r5', tipo: 'technical', descripcion: 'Soporte técnico en sitio 8x5', obligatorio: true, peso: 15 },
          { id: 'r6', tipo: 'commercial', descripcion: 'Precio unitario competitivo', obligatorio: true, peso: 45 },
        ]
      },
      {
        id: 'fb-003',
        numero: 'OB-2026-0031',
        titulo: 'Obra de Ampliación y Refacción de Hospital Provincial',
        descripcion: 'Ampliación del ala norte y refacción integral de instalaciones eléctricas, sanitarias y de climatización del Hospital General.',
        organismo: 'Ministerio de Salud de la Provincia',
        jurisdiccion: 'Buenos Aires',
        rubro: 'Construcción y obra civil',
        estado: 'abierta',
        fecha_publicacion: daysFromNow(-15),
        fecha_apertura: daysFromNow(40),
        monto_estimado: 380000000,
        moneda: 'ARS',
        requisitos: [
          { id: 'r7', tipo: 'technical', descripcion: 'Categoría A en Registro de Constructores', obligatorio: true, peso: 25 },
          { id: 'r8', tipo: 'technical', descripcion: 'Antecedentes en obras hospitalarias', obligatorio: true, peso: 20 },
          { id: 'r9', tipo: 'commercial', descripcion: 'Oferta dentro del presupuesto oficial', obligatorio: true, peso: 35 },
        ]
      },
      {
        id: 'fb-004',
        numero: 'CO-2026-0088',
        titulo: 'Consultoría para Modernización del Sistema de Gestión Tributaria',
        descripcion: 'Servicios de consultoría especializada para el diseño, desarrollo e implementación de un nuevo sistema de gestión tributaria municipal.',
        organismo: 'Agencia de Recaudación y Control Aduanero',
        jurisdiccion: 'CABA',
        rubro: 'Consultoria y servicios profesionales',
        estado: 'abierta',
        fecha_publicacion: daysFromNow(-3),
        fecha_apertura: daysFromNow(30),
        monto_estimado: 95000000,
        moneda: 'ARS',
        requisitos: [
          { id: 'r10', tipo: 'technical', descripcion: 'Experiencia en implementación de sistemas tributarios', obligatorio: true, peso: 30 },
          { id: 'r11', tipo: 'technical', descripcion: 'Equipo técnico con certificaciones en seguridad informática', obligatorio: true, peso: 20 },
          { id: 'r12', tipo: 'commercial', descripcion: 'Precio competitivo por etapa', obligatorio: true, peso: 35 },
        ]
      },
      {
        id: 'fb-005',
        numero: 'SUM-2026-0207',
        titulo: 'Suministro de Medicamentos e Insumos Hospitalarios',
        descripcion: 'Provisión de medicamentos esenciales, insumos descartables y material de diagnóstico para hospitales de la red pública provincial.',
        organismo: 'Ministerio de Salud de Córdoba',
        jurisdiccion: 'Cordoba',
        rubro: 'Salud y medicamentos',
        estado: 'abierta',
        fecha_publicacion: daysFromNow(-8),
        fecha_apertura: daysFromNow(22),
        monto_estimado: 210000000,
        moneda: 'ARS',
        requisitos: [
          { id: 'r13', tipo: 'technical', descripcion: 'Habilitación ANMAT vigente para comercialización', obligatorio: true, peso: 30 },
          { id: 'r14', tipo: 'technical', descripcion: 'Stock mínimo garantizado en depósito propio', obligatorio: true, peso: 20 },
          { id: 'r15', tipo: 'commercial', descripcion: 'Precio referencial PAMI o inferior', obligatorio: true, peso: 40 },
        ]
      },
      {
        id: 'fb-006',
        numero: 'LP-2026-0019',
        titulo: 'Contratación de Servicio de Transporte Escolar',
        descripcion: 'Servicio de transporte escolar para alumnos con discapacidad de 45 establecimientos educativos durante el ciclo lectivo 2026.',
        organismo: 'Dirección General de Educación',
        jurisdiccion: 'Santa Fe',
        rubro: 'Transporte y logística',
        estado: 'abierta',
        fecha_publicacion: daysFromNow(-12),
        fecha_apertura: daysFromNow(15),
        monto_estimado: 72000000,
        moneda: 'ARS',
        requisitos: [
          { id: 'r16', tipo: 'technical', descripcion: 'Flota propia con habilitación para transporte especial', obligatorio: true, peso: 35 },
          { id: 'r17', tipo: 'legal', descripcion: 'Seguro de transporte de pasajeros vigente', obligatorio: true, peso: 25 },
          { id: 'r18', tipo: 'commercial', descripcion: 'Tarifa por km competitiva', obligatorio: true, peso: 30 },
        ]
      },
      {
        id: 'fb-007',
        numero: 'CD-2026-0155',
        titulo: 'Provisión de Alimentos para Comedores Escolares',
        descripcion: 'Suministro de alimentos frescos, secos y elaborados para comedores de escuelas públicas de la región.',
        organismo: 'Ministerio de Educación de Tucumán',
        jurisdiccion: 'Tucuman',
        rubro: 'Alimentos y bebidas',
        estado: 'abierta',
        fecha_publicacion: daysFromNow(-6),
        fecha_apertura: daysFromNow(20),
        monto_estimado: 35000000,
        moneda: 'ARS',
        requisitos: [
          { id: 'r19', tipo: 'technical', descripcion: 'Habilitación bromatológica municipal y provincial', obligatorio: true, peso: 30 },
          { id: 'r20', tipo: 'technical', descripcion: 'Plan de Análisis de Peligros y Puntos Críticos de Control (APPCC)', obligatorio: false, peso: 15 },
          { id: 'r21', tipo: 'commercial', descripcion: 'Precio por canasta semanal dentro del estimado', obligatorio: true, peso: 45 },
        ]
      },
      {
        id: 'fb-008',
        numero: 'OB-2026-0044',
        titulo: 'Pavimentación y Repavimentación de Calles Urbanas',
        descripcion: 'Trabajos de pavimentación con carpeta asfáltica en calles de tierra y repavimentación de vías deterioradas en zona norte.',
        organismo: 'Secretaría de Obras Públicas Municipal',
        jurisdiccion: 'Mendoza',
        rubro: 'Obras viales y transporte',
        estado: 'abierta',
        fecha_publicacion: daysFromNow(-20),
        fecha_apertura: daysFromNow(35),
        monto_estimado: 290000000,
        moneda: 'ARS',
        requisitos: [
          { id: 'r22', tipo: 'technical', descripcion: 'Inscripción en Registro de Contratistas Viales', obligatorio: true, peso: 25 },
          { id: 'r23', tipo: 'technical', descripcion: 'Planta asfáltica propia o contrato de uso', obligatorio: true, peso: 20 },
          { id: 'r24', tipo: 'commercial', descripcion: 'Precio por m² competitivo', obligatorio: true, peso: 40 },
        ]
      },
    ];

    let filtered = [...base];

    if (params.q) {
      const q = params.q.toLowerCase();
      filtered = filtered.filter(t =>
        t.titulo.toLowerCase().includes(q) ||
        t.descripcion.toLowerCase().includes(q) ||
        t.organismo.toLowerCase().includes(q) ||
        t.rubro.toLowerCase().includes(q)
      );
    }
    if (params.estado) {
      filtered = filtered.filter(t => t.estado === params.estado);
    }
    if (params.jurisdiccion) {
      filtered = filtered.filter(t => t.jurisdiccion.toLowerCase().includes(params.jurisdiccion!.toLowerCase()));
    }
    if (params.rubro) {
      filtered = filtered.filter(t => t.rubro.toLowerCase().includes(params.rubro!.toLowerCase()));
    }
    if (params.organismo) {
      filtered = filtered.filter(t => t.organismo.toLowerCase().includes(params.organismo!.toLowerCase()));
    }
    if (params.monto_min !== undefined) {
      filtered = filtered.filter(t => t.monto_estimado >= params.monto_min!);
    }
    if (params.monto_max !== undefined) {
      filtered = filtered.filter(t => t.monto_estimado <= params.monto_max!);
    }

    const page = params.page || 1;
    const limit = params.limit || 20;
    const start = (page - 1) * limit;
    return filtered.slice(start, start + limit);
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
      console.warn('LICITOMETRO API no disponible, usando datos de muestra:', (error as Error).message);
      const fallback = this.getFallbackTenders(params);
      return { tenders: fallback.map(lt => this.mapTenderFromLicitometro(lt)), total: fallback.length };
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
