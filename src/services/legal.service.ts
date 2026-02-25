import { Tender, LegalFramework, LegalClause, PaymentTerms, Guarantees } from '../types/index.js';

interface LegalClauseTemplate {
  type: string;
  description: string;
  template: string;
}

const clauseTemplates: Record<string, LegalClauseTemplate> = {
  confidentiality: {
    type: 'confidentiality',
    description: 'Confidentiality Clause',
    template: 'El contratante se compromete a mantener estricta confidencialidad sobre toda la información proporcionada por el contratista en el marco del presente contrato.'
  },
  warranty: {
    type: 'warranty',
    description: 'Warranty Clause',
    template: 'El contratista garantiza que los servicios prestados se ajustan a las especificaciones técnicas y calidad pactadas por un período de {{warranty_months}} meses.'
  },
  penalty: {
    type: 'penalty',
    description: 'Penalty Clause',
    template: 'En caso de incumplimiento de los plazos establecidos, se aplicarán penalizaciones equivalentes al {{penalty_rate}}% del valor del contrato por cada día de atraso.'
  },
  termination: {
    type: 'termination',
    description: 'Termination Clause',
    template: 'Cualquiera de las partes podrá rescindir el contrato con un preaviso de {{notice_days}} días, sin derecho a indemnización.'
  },
  force_majeure: {
    type: 'force_majeure',
    description: 'Force Majeure Clause',
    template: 'Ninguna de las partes será responsable por fuerza mayor conforme al artículo 1730 del Código Civil y Comercial.'
  },
  payment: {
    type: 'payment',
    description: 'Payment Terms Clause',
    template: 'Los pagos se realizarán según el cronograma establecido, dentro de los {{payment_days}} días de presentada la factura.'
  },
  insurance: {
    type: 'insurance',
    description: 'Insurance Clause',
    template: 'El contratista deberá mantener vigente un seguro de riesgo de trabajo y responsabilidad civil por la totalidad del período contractual.'
  },
  subcontracting: {
    type: 'subcontracting',
    description: 'Subcontracting Clause',
    template: 'Queda prohibida la subcontratación total o parcial de los servicios sin autorización previa y escrita del comitente.'
  }
};

export class LegalService {
  async analyzeLegalRequirements(tender: Tender): Promise<{
    framework: LegalFramework;
    jurisdiction: string;
    requiredClauses: string[];
    complianceChecklist: string[];
    recommendations: string[];
  }> {
    const serviceType = this.detectServiceType(tender);
    const framework = this.getFramework(serviceType, tender.region || '', tender.legalFramework);

    const requiredClauses = this.getRequiredClauses(serviceType);
    const complianceChecklist = this.generateComplianceChecklist(tender);
    const recommendations = this.getLegalRecommendations(serviceType, tender);

    return {
      framework,
      jurisdiction: tender.region || 'Nacional',
      requiredClauses,
      complianceChecklist,
      recommendations
    };
  }

  private detectServiceType(tender: Tender): string {
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const text = `${normalize(tender.category)} ${normalize(tender.title)}`;

    if (/obra|construccion|refaccion|edilicio|civil|vial|hidraulic/.test(text)) {
      return 'obra_publica';
    }
    if (/servicio|limpieza|mantenimiento|vigilancia|seguridad|catering|transporte|logistic/.test(text)) {
      return 'servicio';
    }
    if (/suministro|compra|adquisicion|provision|insumo|alimento|medicamento|equipamiento|tecnologia|informatica|software|hardware/.test(text)) {
      return 'suministro';
    }
    if (/consultoria|asesoria|estudio|auditoria|relevamiento|capacitacion|educacion/.test(text)) {
      return 'servicio';
    }
    if (/salud|medic|hospital|sanitari|farmac/.test(text)) {
      return 'suministro';
    }
    return 'general';
  }

  /**
   * Determina el marco legal aplicable según la JURISDICCIÓN del proceso.
   * Si la jurisdicción es provincial, retorna la ley provincial correspondiente.
   * Si es nacional o no se reconoce, retorna la ley nacional según el tipo de servicio.
   */
  private getJurisdictionFramework(region: string): LegalFramework | null {
    const r = region.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Buenos Aires (Provincia)
    if (r.includes('buenos aires') && !r.includes('caba') && !r.includes('ciudad')) {
      return {
        law: 'Ley 13.981 de Contrataciones de la Provincia de Buenos Aires',
        decree: 'Decreto 59/2019 (reglamentación Ley 13.981)',
        regulation: 'Reglamento de Compras y Contrataciones de la Provincia de Buenos Aires'
      };
    }
    // CABA / Ciudad Autónoma de Buenos Aires
    if (r.includes('caba') || r.includes('ciudad autonoma') || r.includes('ciudad de buenos')) {
      return {
        law: 'Ley 2.095 de Compras y Contrataciones del GCBA',
        decree: 'Decreto 95/2014 (reglamentación Ley 2.095)',
        regulation: 'Régimen de Contrataciones del Gobierno de la Ciudad de Buenos Aires'
      };
    }
    // Mendoza
    if (r.includes('mendoza')) {
      return {
        law: 'Ley 8.706 de Administración Financiera de Mendoza',
        decree: 'Decreto 7.446/2010 (reglamentación Ley 8.706)',
        regulation: 'Reglamento de Compras y Contrataciones de la Provincia de Mendoza'
      };
    }
    // Córdoba
    if (r.includes('cordoba')) {
      return {
        law: 'Ley 10.155 de Administración Financiera de Córdoba',
        decree: 'Decreto 305/2014 (reglamentación Ley 10.155)',
        regulation: 'Régimen de Contrataciones de la Provincia de Córdoba'
      };
    }
    // Santa Fe
    if (r.includes('santa fe')) {
      return {
        law: 'Ley 12.510 de Administración, Eficiencia e Integridad Pública de Santa Fe',
        decree: 'Decreto 1.104/2016 (reglamentación Ley 12.510)',
        regulation: 'Reglamento de Contrataciones de la Provincia de Santa Fe'
      };
    }
    // Chaco
    if (r.includes('chaco')) {
      return {
        law: 'Ley 6.570 de Obras Públicas del Chaco',
        decree: 'Decreto 1.284/2006',
        regulation: 'Régimen de Contrataciones de la Provincia del Chaco'
      };
    }
    // Tucumán
    if (r.includes('tucuman')) {
      return {
        law: 'Ley 6.970 de Contrataciones de la Provincia de Tucumán',
        decree: 'Decreto 313/2016',
        regulation: 'Reglamento de Contrataciones de Tucumán'
      };
    }
    // Entre Ríos
    if (r.includes('entre rios')) {
      return {
        law: 'Ley 9.203 de Administración Financiera de Entre Ríos',
        decree: 'Decreto 795/2008',
        regulation: 'Régimen de Contrataciones de la Provincia de Entre Ríos'
      };
    }
    // Salta
    if (r.includes('salta')) {
      return {
        law: 'Ley 6.838 de Contrataciones de la Provincia de Salta',
        decree: 'Decreto 1.448/1996',
        regulation: 'Reglamento de Contrataciones de la Provincia de Salta'
      };
    }
    // Misiones
    if (r.includes('misiones')) {
      return {
        law: 'Ley 4.366 de Contrataciones de la Provincia de Misiones',
        decree: 'Decreto 2.045/2011',
        regulation: 'Régimen de Contrataciones de Misiones'
      };
    }
    // Neuquén
    if (r.includes('neuquen')) {
      return {
        law: 'Ley 2.141 de Administración Financiera de Neuquén',
        decree: 'Decreto 2.758/1995',
        regulation: 'Reglamento de Contrataciones de la Provincia de Neuquén'
      };
    }
    // Río Negro
    if (r.includes('rio negro')) {
      return {
        law: 'Ley 3.186 de Administración Financiera de Río Negro',
        decree: 'Decreto 1.135/2012',
        regulation: 'Régimen de Contrataciones de Río Negro'
      };
    }
    // Organismos Nacionales / Nacional
    if (r.includes('nacional') || r.includes('nacion')) {
      return null; // fallback a ley nacional por tipo de servicio
    }
    // No reconocida → fallback
    return null;
  }

  private getFramework(serviceType: string, region: string, existing?: LegalFramework): LegalFramework {
    // Primero intentar marco por jurisdicción
    const jurisdictionFramework = this.getJurisdictionFramework(region);
    if (jurisdictionFramework) {
      return jurisdictionFramework;
    }

    // Fallback a marco nacional por tipo de servicio
    const frameworks: Record<string, LegalFramework> = {
      obra_publica: {
        law: 'Ley 13.064 de Obras Públicas de la Nación',
        decree: 'Decreto 691/2016 (actualización precios obras públicas)',
        regulation: 'Régimen de Contrataciones de Obras Públicas — Decreto 1.023/2001'
      },
      servicio: {
        law: 'Ley 22.460 / Decreto 1.023/2001 — Régimen de Contrataciones del Estado Nacional',
        decree: 'Decreto 1.030/2016 (reglamentación)',
        regulation: 'Régimen de Contrataciones de la Administración Nacional (CONTRAT.AR)'
      },
      suministro: {
        law: 'Decreto 1.023/2001 — Régimen de Contrataciones del Estado Nacional',
        decree: 'Decreto 1.030/2016 y Disposición ONC 62/2016',
        regulation: 'CONTRAT.AR — Sistema Electrónico de Contrataciones del Estado'
      },
      general: {
        law: 'Decreto 1.023/2001 — Régimen de Contrataciones del Estado Nacional',
        decree: 'Decreto 1.030/2016 (reglamentación)',
        regulation: 'CONTRAT.AR — Régimen General de Contrataciones'
      }
    };

    return existing || frameworks[serviceType] || frameworks.general;
  }

  private getRequiredClauses(serviceType: string): string[] {
    const baseClauses = ['confidentiality', 'force_majeure', 'termination', 'payment'];

    const typeSpecificClauses: Record<string, string[]> = {
      obra_publica: [...baseClauses, 'warranty', 'penalty', 'insurance', 'subcontracting'],
      servicio: [...baseClauses, 'warranty', 'penalty', 'insurance', 'subcontracting'],
      suministro: [...baseClauses, 'warranty', 'insurance'],
      general: baseClauses
    };

    return typeSpecificClauses[serviceType] || baseClauses;
  }

  private generateComplianceChecklist(tender: Tender): string[] {
    const checklist: string[] = [];

    // General requirements
    checklist.push('Inscripción en el Registro Nacional de Constructores (si aplica)');
    checklist.push('Certificación de situación fiscal (AFIP)');
    checklist.push('Constancia de inscripción en IVA');
    checklist.push('Balance último ejercicio');
    checklist.push('Seguro de riesgo de trabajo vigente');

    // Payment terms
    if (tender.paymentTerms?.advance) {
      checklist.push(`Garantía de anticipo: ${tender.paymentTerms.advance}%`);
    }
    if (tender.guarantees?.offer) {
      checklist.push(`Garantía de oferta: ${tender.guarantees.offer.percentage}%`);
    }
    if (tender.guarantees?.performance) {
      checklist.push(`Garantía de cumplimiento: ${tender.guarantees.performance.percentage}%`);
    }

    // Experience requirements
    checklist.push('Antecedentes de obras/servicios similares');

    // Technical requirements
    checklist.push('Certificaciones técnicas vigentes (ISO 9001 si aplica)');
    checklist.push('Personal técnico capacitado');
    checklist.push('Equipamiento adecuado');

    return checklist;
  }

  private getLegalRecommendations(serviceType: string, tender: Tender): string[] {
    const recommendations: string[] = [];

    // General recommendations
    recommendations.push('Revisar cuidadosamente los plazos de presentación');
    recommendations.push('Verificar que todos los documentos estén vigentes');
    recommendations.push('Confirmar los montos de garantías requeridas');

    // Type-specific recommendations
    if (serviceType === 'obra_publica') {
      recommendations.push('Revisar el régimen de redeterminación de precios');
      recommendations.push('Verificar los plazos de obra y penalizaciones');
      recommendations.push('Confirmar los requisitos de subcontratistas');
    }

    if (serviceType === 'servicio') {
      recommendations.push('Revisar el régimen de personal mínimo');
      recommendations.push('Verificar los requisitos de supervisión');
      recommendations.push('Confirmar los controles de calidad exigidos');
    }

    // Payment recommendations
    if (tender.paymentTerms?.advance && tender.paymentTerms.advance > 20) {
      recommendations.push('El anticipo supera el 20%, verificar garantías');
    }

    // Deadline recommendations
    const daysUntilClose = Math.ceil(
      (new Date(tender.closingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysUntilClose < 14) {
      recommendations.push('PLAZO CORTO: Priorizar la preparación de la oferta');
    }

    return recommendations;
  }

  async getClauseTemplate(type: string, variables?: Record<string, string>): Promise<LegalClause | null> {
    const template = clauseTemplates[type];
    if (!template) return null;

    let content = template.template;
    if (variables) {
      Object.entries(variables).forEach(([key, value]) => {
        content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });
    }

    return {
      type: template.type,
      description: template.description,
      content,
      accepted: false
    };
  }

  async getAllClauseTemplates(): Promise<LegalClauseTemplate[]> {
    return Object.values(clauseTemplates);
  }

  async checkCompliance(
    tender: Tender,
    companyData: Record<string, boolean>
  ): Promise<{
    compliant: boolean;
    missingItems: string[];
    warnings: string[];
  }> {
    const missingItems: string[] = [];
    const warnings: string[] = [];

    // Check guarantees
    if (tender.guarantees?.offer && !companyData.guaranteeOffer) {
      missingItems.push('Garantía de oferta');
    }
    if (tender.guarantees?.performance && !companyData.guaranteePerformance) {
      missingItems.push('Garantía de cumplimiento');
    }

    // Check certifications
    if (!companyData.iso9001) {
      warnings.push('No se cuenta con certificación ISO 9001 (puede ser requerido)');
    }

    // Check insurance
    if (!companyData.insurance) {
      missingItems.push('Seguro de riesgo de trabajo');
    }

    // Check registration
    if (!companyData.taxReg) {
      missingItems.push('Inscripción fiscal (AFIP)');
    }

    return {
      compliant: missingItems.length === 0,
      missingItems,
      warnings
    };
  }

  async generateComplianceReport(tender: Tender): Promise<string> {
    const analysis = await this.analyzeLegalRequirements(tender);
    
    return `
INFORME DE CUMPLIMIENTO LEGAL
==============================

MARCO LEGAL APLICABLE
---------------------
Ley: ${analysis.framework.law}
Decreto: ${analysis.framework.decree}
Reglamento: ${analysis.framework.regulation}

CLÁUSULAS REQUERIDAS
--------------------
${analysis.requiredClauses.join('\n')}

CHECKLIST DE CUMPLIMIENTO
-------------------------
${analysis.complianceChecklist.map(item => `- ${item}`).join('\n')}

RECOMENDACIONES
---------------
${analysis.recommendations.map(item => `- ${item}`).join('\n')}
    `.trim();
  }
}

export const legalService = new LegalService();
