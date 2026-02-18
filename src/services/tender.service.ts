import { Tender, TenderRequirement, TenderDocument, TenderTerms, LegalFramework, PaymentTerms, Guarantees } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export class TenderService {
  private tenders: Map<string, Tender> = new Map();

  constructor() {
    // Initialize with sample data
    this.initializeSampleData();
  }

  private initializeSampleData() {
    const sampleTenders: Tender[] = [
      {
        id: 'lic-001',
        number: 'CD-2024-001',
        title: 'Servicio de Limpieza Integral para Edificios Públicos',
        description: 'Contratación de servicio de limpieza integral para 10 edificios públicos de la Ciudad de Buenos Aires',
        agency: 'Ministerio de Hábitat y Desarrollo Urbano',
        region: 'CABA',
        category: 'Servicios',
        status: 'abierta',
        openingDate: '2026-01-20T10:00:00Z',
        closingDate: '2026-03-10T23:59:59Z',
        budget: 50000000,
        currency: 'ARS',
        requirements: [
          {
            id: 'req-001',
            type: 'technical',
            description: 'Experiencia mínima de 5 años en servicios similares',
            mandatory: true,
            weight: 20
          },
          {
            id: 'req-002',
            type: 'technical',
            description: 'Certificación ISO 9001 vigente',
            mandatory: true,
            weight: 15
          },
          {
            id: 'req-003',
            type: 'commercial',
            description: 'Precio ofertado dentro del presupuesto',
            mandatory: true,
            weight: 40
          },
          {
            id: 'req-004',
            type: 'legal',
            description: 'Inscripción en el Registro Nacional de Constructores',
            mandatory: true,
            weight: 10
          },
          {
            id: 'req-005',
            type: 'administrative',
            description: 'Documentación completa según pliego',
            mandatory: true,
            weight: 15
          }
        ],
        documents: [
          {
            id: 'doc-001',
            name: 'Pliego de Bases y Condiciones',
            type: 'pdf',
            url: 'https://example.com/pliego.pdf'
          },
          {
            id: 'doc-002',
            name: 'Especificaciones Técnicas',
            type: 'pdf',
            url: 'https://example.com/especificaciones.pdf'
          }
        ],
        terms: {
          deliveryTime: '12 meses',
          placeOfDelivery: 'Edificios públicos CABA',
          warranty: '6 meses',
          validityOfOffer: 90
        },
        legalFramework: {
          law: 'Ley Nacional de Compras y Contrataciones',
          decree: 'Decreto 1023/2001',
          regulation: 'Régimen de Contrataciones de la Administración Pública Nacional'
        },
        paymentTerms: {
          type: 'mensual',
          advance: 20,
          milestones: [
            { milestone: 'Mes 1', percentage: 10 },
            { milestone: 'Mes 6', percentage: 40 },
            { milestone: 'Mes 12', percentage: 50 }
          ]
        },
        guarantees: {
          offer: { percentage: 5, amount: 2500000 },
          performance: { percentage: 10, amount: 5000000 },
          technical: { percentage: 5, amount: 2500000 }
        }
      },
      {
        id: 'lic-002',
        number: 'OB-2024-015',
        title: 'Obra de Refacción Integral Hospital Regional',
        description: 'Refacción completa del Hospital Regional de La Plata incluyendo obra civil, electricidad, plumbing y climatización',
        agency: 'Ministerio de Salud',
        region: 'Buenos Aires',
        category: 'Obras',
        status: 'abierta',
        openingDate: '2026-02-01T10:00:00Z',
        closingDate: '2026-03-22T23:59:59Z',
        budget: 250000000,
        currency: 'ARS',
        requirements: [
          {
            id: 'req-006',
            type: 'technical',
            description: 'Certificación categoria A en registro de constructores',
            mandatory: true,
            weight: 25
          },
          {
            id: 'req-007',
            type: 'technical',
            description: 'Antecedentes de obras de similar magnitud',
            mandatory: true,
            weight: 20
          },
          {
            id: 'req-008',
            type: 'commercial',
            description: 'Oferta económica dentro del presupuesto oficial',
            mandatory: true,
            weight: 35
          },
          {
            id: 'req-009',
            type: 'legal',
            description: 'Seguro de riesgo de trabajo vigente',
            mandatory: true,
            weight: 10
          },
          {
            id: 'req-010',
            type: 'administrative',
            description: 'Garantía de oferta según pliego',
            mandatory: true,
            weight: 10
          }
        ],
        documents: [
          {
            id: 'doc-003',
            name: 'Pliego Técnico',
            type: 'pdf',
            url: 'https://example.com/pliego-tecnico.pdf'
          }
        ],
        terms: {
          deliveryTime: '18 meses',
          placeOfDelivery: 'Hospital Regional La Plata',
          warranty: '12 meses',
          validityOfOffer: 90
        },
        legalFramework: {
          law: 'Ley de Obras Públicas',
          decree: 'Decreto 691/2016',
          regulation: 'Régimen de Contrataciones de Obras Públicas'
        },
        paymentTerms: {
          type: 'avance',
          advance: 15,
          milestones: [
            { milestone: '25% avance', percentage: 25 },
            { milestone: '50% avance', percentage: 25 },
            { milestone: '75% avance', percentage: 25 },
            { milestone: 'Entrega definitiva', percentage: 25 }
          ]
        },
        guarantees: {
          offer: { percentage: 2, amount: 5000000 },
          performance: { percentage: 5, amount: 12500000 },
          technical: { percentage: 5, amount: 12500000 }
        }
      },
      {
        id: 'lic-003',
        number: 'SUM-2024-008',
        title: 'Suministro de Equipamiento Informático',
        description: 'Adquisición de 500 computadoras de escritorio, 100 notebooks y 50 servidores para dependencias públicas',
        agency: 'Ministerio de Modernización',
        region: 'CABA',
        category: 'Suministros',
        status: 'abierta',
        openingDate: '2026-02-10T10:00:00Z',
        closingDate: '2026-02-25T23:59:59Z',
        budget: 180000000,
        currency: 'ARS',
        requirements: [
          {
            id: 'req-011',
            type: 'technical',
            description: 'Equipos con certificación IRAM o equivalente',
            mandatory: true,
            weight: 20
          },
          {
            id: 'req-012',
            type: 'technical',
            description: 'Soporte técnico local 24/7',
            mandatory: true,
            weight: 15
          },
          {
            id: 'req-013',
            type: 'commercial',
            description: 'Precio por debajo del presupuesto',
            mandatory: true,
            weight: 45
          },
          {
            id: 'req-014',
            type: 'legal',
            description: 'Habilitación comercial vigente',
            mandatory: true,
            weight: 10
          },
          {
            id: 'req-015',
            type: 'administrative',
            description: 'Garantía mínima de 3 años',
            mandatory: true,
            weight: 10
          }
        ],
        documents: [],
        terms: {
          deliveryTime: '60 días',
          placeOfDelivery: 'Dependencias del Ministerio',
          warranty: '36 meses',
          validityOfOffer: 60
        },
        legalFramework: {
          law: 'Ley de Compras Electrónicas',
          decree: 'Decreto 1149/2007',
          regulation: 'Sistema Electrónico de Contrataciones'
        },
        paymentTerms: {
          type: 'entrega',
          advance: 0,
          milestones: [
            { milestone: 'Entrega 50%', percentage: 50 },
            { milestone: 'Entrega 100% + OK', percentage: 50 }
          ]
        },
        guarantees: {
          offer: { percentage: 2, amount: 3600000 },
          performance: { percentage: 10, amount: 18000000 },
          technical: { amount: 0, percentage: 0 }
        }
      }
    ];

    sampleTenders.forEach(tender => {
      this.tenders.set(tender.id, tender);
    });
  }

  async search(query: string): Promise<Tender[]> {
    const results: Tender[] = [];
    const lowerQuery = query.toLowerCase();

    this.tenders.forEach(tender => {
      if (
        tender.title.toLowerCase().includes(lowerQuery) ||
        tender.description.toLowerCase().includes(lowerQuery) ||
        tender.agency.toLowerCase().includes(lowerQuery) ||
        tender.category.toLowerCase().includes(lowerQuery) ||
        tender.region.toLowerCase().includes(lowerQuery)
      ) {
        results.push(tender);
      }
    });

    return results;
  }

  async getById(id: string): Promise<Tender | null> {
    return this.tenders.get(id) || null;
  }

  async list(filters?: {
    status?: string;
    category?: string;
    region?: string;
    agency?: string;
  }): Promise<Tender[]> {
    let results = Array.from(this.tenders.values());

    if (filters) {
      if (filters.status) {
        results = results.filter(t => t.status === filters.status);
      }
      if (filters.category) {
        results = results.filter(t => t.category.toLowerCase() === filters.category!.toLowerCase());
      }
      if (filters.region) {
        results = results.filter(t => t.region.toLowerCase() === filters.region!.toLowerCase());
      }
      if (filters.agency) {
        results = results.filter(t => t.agency.toLowerCase().includes(filters.agency!.toLowerCase()));
      }
    }

    return results;
  }

  async create(tenderData: Partial<Tender>): Promise<Tender> {
    const tender: Tender = {
      id: `lic-${uuidv4().slice(0, 8)}`,
      number: tenderData.number || '',
      title: tenderData.title || '',
      description: tenderData.description || '',
      agency: tenderData.agency || '',
      region: tenderData.region || '',
      category: tenderData.category || 'Servicios',
      status: tenderData.status || 'abierta',
      openingDate: tenderData.openingDate || new Date().toISOString(),
      closingDate: tenderData.closingDate || new Date().toISOString(),
      budget: tenderData.budget || 0,
      currency: tenderData.currency || 'ARS',
      requirements: tenderData.requirements || [],
      documents: tenderData.documents || [],
      terms: tenderData.terms || {
        deliveryTime: '',
        placeOfDelivery: '',
        validityOfOffer: 60
      }
    };

    this.tenders.set(tender.id, tender);
    return tender;
  }

  async update(id: string, data: Partial<Tender>): Promise<Tender | null> {
    const existing = this.tenders.get(id);
    if (!existing) return null;

    const updated = { ...existing, ...data };
    this.tenders.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.tenders.delete(id);
  }

  async getCategories(): Promise<string[]> {
    const categories = new Set<string>();
    this.tenders.forEach(t => categories.add(t.category));
    return Array.from(categories);
  }

  async getRegions(): Promise<string[]> {
    const regions = new Set<string>();
    this.tenders.forEach(t => regions.add(t.region));
    return Array.from(regions);
  }

  async getAgencies(): Promise<string[]> {
    const agencies = new Set<string>();
    this.tenders.forEach(t => agencies.add(t.agency));
    return Array.from(agencies);
  }
}

export const tenderService = new TenderService();
