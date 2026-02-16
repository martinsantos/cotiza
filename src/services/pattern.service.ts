import { PatternBundle, PatternSection, PricePattern } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export class PatternService {
  private patterns: Map<string, PatternBundle> = new Map();
  private searchIndex: Map<string, string[]> = new Map();

  constructor() {
    this.initializeSamplePatterns();
  }

  private initializeSamplePatterns() {
    const samplePatterns: PatternBundle[] = [
      {
        id: 'pattern-001',
        tenderType: 'servicios_limpieza',
        sections: [
          {
            name: 'Experiencia de la Empresa',
            content: 'Nuestra empresa cuenta con más de XX años de experiencia en el sector de limpieza...',
            order: 1
          },
          {
            name: 'Metodología de Trabajo',
            content: 'El servicio se realizará siguiendo los más altos estándares de calidad...',
            order: 2
          },
          {
            name: 'Plan de Trabajo',
            content: 'El plan de trabajo contempla las siguientes fases: organización, ejecución, control y cierre...',
            order: 3
          },
          {
            name: 'Recursos Humanos',
            content: 'Disponemos de personal capacitado y motivado...',
            order: 4
          },
          {
            name: 'Equipos y Materiales',
            content: 'Contamos con equipamiento de última tecnología...',
            order: 5
          }
        ],
        commonTexts: [
          'certificación ISO 9001',
          'personal capacitado',
          'equipamiento adecuado',
          'control de calidad',
          'informes periódicos'
        ],
        templates: [
          'template_experiencia.pdf',
          'template_metodologia.pdf'
        ],
        pricePatterns: {
          averageMarkup: 18,
          typicalDiscount: 5,
          commonPaymentTerms: ['mensual']
        },
        formats: ['PDF', 'DOCX'],
        usageCount: 25,
        successRate: 0.72
      },
      {
        id: 'pattern-002',
        tenderType: 'obra_publica',
        sections: [
          {
            name: 'Capacidad Técnica',
            content: 'Nuestra empresa cuenta con capacidad técnica y recursos necesarios...',
            order: 1
          },
          {
            name: 'Experiencia en Obras Similares',
            content: 'Hemos ejecutado exitosamente obras de similar naturaleza y magnitud...',
            order: 2
          },
          {
            name: 'Plan de Gestión de Obra',
            content: 'El plan de gestión contempla todos los aspectos de la obra...',
            order: 3
          },
          {
            name: 'Cronograma de Ejecución',
            content: 'El cronograma se desarrollará en las siguientes etapas...',
            order: 4
          },
          {
            name: 'Equipamiento y Maquinaria',
            content: 'Disponemos de toda la maquinaria y equipamiento necesario...',
            order: 5
          },
          {
            name: 'Recursos Humanos',
            content: 'Contamos con personal técnico y obrero capacitado...',
            order: 6
          },
          {
            name: 'Seguridad e Higiene',
            content: 'Cumplimentamos todas las normas de seguridad e higiene...',
            order: 7
          }
        ],
        commonTexts: [
          'categoría A',
          'registro de constructores',
          'obra de similar magnitud',
          'certificación de calidad',
          'seguro de riesgo'
        ],
        templates: [
          'template_obra.pdf',
          'template_cronograma.xlsx'
        ],
        pricePatterns: {
          averageMarkup: 15,
          typicalDiscount: 3,
          commonPaymentTerms: ['avance']
        },
        formats: ['PDF', 'XLSX'],
        usageCount: 18,
        successRate: 0.65
      },
      {
        id: 'pattern-003',
        tenderType: 'suministro',
        sections: [
          {
            name: 'Descripción del Producto',
            content: 'Los productos ofrecidos cumplen con todas las especificaciones técnicas...',
            order: 1
          },
          {
            name: 'Garantía y Soporte',
            content: 'Ofrecemos garantía de XX meses con soporte técnico...',
            order: 2
          },
          {
            name: 'Capacidad de Entrega',
            content: 'Contamos con stock y capacidad logística para entregar...',
            order: 3
          },
          {
            name: 'Certificaciones',
            content: 'Todos nuestros productos cuentan con certificaciones vigentes...',
            order: 4
          }
        ],
        commonTexts: [
          'certificación IRAM',
          'garantía técnica',
          'soporte 24/7',
          'entrega inmediata',
          'stock disponible'
        ],
        templates: [
          'template_suministro.pdf'
        ],
        pricePatterns: {
          averageMarkup: 12,
          typicalDiscount: 8,
          commonPaymentTerms: ['entrega']
        },
        formats: ['PDF'],
        usageCount: 12,
        successRate: 0.58
      }
    ];

    samplePatterns.forEach(pattern => {
      this.patterns.set(pattern.id, pattern);
      this.indexPattern(pattern);
    });
  }

  private indexPattern(pattern: PatternBundle) {
    const indexableContent = [
      pattern.tenderType,
      ...pattern.sections.map(s => s.name),
      ...pattern.sections.map(s => s.content),
      ...pattern.commonTexts
    ].join(' ').toLowerCase();

    const keywords = indexableContent.split(/\s+/).filter(w => w.length > 3);
    this.searchIndex.set(pattern.id, keywords);
  }

  async search(query: string): Promise<PatternBundle[]> {
    const queryWords = query.toLowerCase().split(/\s+/);
    const results: { pattern: PatternBundle; score: number }[] = [];

    this.patterns.forEach((pattern, id) => {
      const keywords = this.searchIndex.get(id) || [];
      let score = 0;

      queryWords.forEach(word => {
        if (pattern.tenderType.toLowerCase().includes(word)) {
          score += 10;
        }
        if (keywords.includes(word)) {
          score += 1;
        }
        pattern.commonTexts.forEach(text => {
          if (text.toLowerCase().includes(word)) {
            score += 2;
          }
        });
      });

      if (score > 0) {
        results.push({ pattern, score });
      }
    });

    return results
      .sort((a, b) => b.score - a.score)
      .map(r => r.pattern);
  }

  async getByType(tenderType: string): Promise<PatternBundle | null> {
    for (const pattern of this.patterns.values()) {
      if (pattern.tenderType === tenderType) {
        return pattern;
      }
    }
    return null;
  }

  async list(): Promise<PatternBundle[]> {
    return Array.from(this.patterns.values());
  }

  async create(pattern: Partial<PatternBundle>): Promise<PatternBundle> {
    const newPattern: PatternBundle = {
      id: `pattern-${uuidv4().slice(0, 8)}`,
      tenderType: pattern.tenderType || '',
      sections: pattern.sections || [],
      commonTexts: pattern.commonTexts || [],
      templates: pattern.templates || [],
      pricePatterns: pattern.pricePatterns || {
        averageMarkup: 15,
        typicalDiscount: 5,
        commonPaymentTerms: ['mensual']
      },
      formats: pattern.formats || ['PDF'],
      usageCount: 0,
      successRate: 0
    };

    this.patterns.set(newPattern.id, newPattern);
    this.indexPattern(newPattern);
    return newPattern;
  }

  async updateUsage(patternId: string, success: boolean): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.usageCount++;
      if (success) {
        pattern.successRate = (pattern.successRate * (pattern.usageCount - 1) + 1) / pattern.usageCount;
      } else {
        pattern.successRate = (pattern.successRate * (pattern.usageCount - 1)) / pattern.usageCount;
      }
      this.patterns.set(patternId, pattern);
    }
  }

  async getTemplates(tenderType: string): Promise<string[]> {
    const pattern = await this.getByType(tenderType);
    return pattern?.templates || [];
  }

  async getCommonSections(tenderType: string): Promise<PatternSection[]> {
    const pattern = await this.getByType(tenderType);
    return pattern?.sections || [];
  }
}

export const patternService = new PatternService();
