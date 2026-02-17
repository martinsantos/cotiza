import type Database from 'better-sqlite3';

export function seedDatabase(db: Database.Database): void {
  // Only seed if tables are empty
  const tenderCount = db.prepare('SELECT COUNT(*) as count FROM tenders').get() as { count: number };
  if (tenderCount.count > 0) return;

  const insertTender = db.prepare(`
    INSERT INTO tenders (id, number, title, description, agency, region, category, status,
      opening_date, closing_date, budget, currency, requirements, documents, terms,
      legal_framework, payment_terms, guarantees, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sample')
  `);

  const insertMaterial = db.prepare(`
    INSERT OR IGNORE INTO market_materials (material_code, name, current_price, previous_price, unit, currency, last_updated, trend, source)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?, ?)
  `);

  const insertCurrency = db.prepare(`
    INSERT OR IGNORE INTO market_currencies (pair, buy, sell, last_updated, source)
    VALUES (?, ?, ?, datetime('now'), ?)
  `);

  const insertInflation = db.prepare(`
    INSERT INTO market_inflation (period, monthly, annual, source, last_updated)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);

  const insertHistorical = db.prepare(`
    INSERT INTO historical_bids (tender_id, tender_category, company_name, amount, winner, year, region)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCompetitor = db.prepare(`
    INSERT INTO competitors (name, win_rate, average_bid, zone, total_bids)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertPattern = db.prepare(`
    INSERT OR IGNORE INTO patterns (id, tender_type, sections, common_texts, templates, price_patterns, formats, usage_count, success_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertLegalTemplate = db.prepare(`
    INSERT OR IGNORE INTO legal_templates (type, description, template, category)
    VALUES (?, ?, ?, ?)
  `);

  const seedAll = db.transaction(() => {
    // --- Tenders ---
    insertTender.run(
      'lic-001', 'CD-2024-001', 'Servicio de Limpieza Integral para Edificios Públicos',
      'Contratación de servicio de limpieza integral para 10 edificios públicos de la Ciudad de Buenos Aires',
      'Ministerio de Hábitat y Desarrollo Urbano', 'CABA', 'Servicios', 'abierta',
      '2024-01-15T10:00:00Z', '2024-02-28T23:59:59Z', 50000000, 'ARS',
      JSON.stringify([
        { id: 'req-001', type: 'technical', description: 'Experiencia mínima de 5 años en servicios similares', mandatory: true, weight: 20 },
        { id: 'req-002', type: 'technical', description: 'Certificación ISO 9001 vigente', mandatory: true, weight: 15 },
        { id: 'req-003', type: 'commercial', description: 'Precio ofertado dentro del presupuesto', mandatory: true, weight: 40 },
        { id: 'req-004', type: 'legal', description: 'Inscripción en el Registro Nacional de Constructores', mandatory: true, weight: 10 },
        { id: 'req-005', type: 'administrative', description: 'Documentación completa según pliego', mandatory: true, weight: 15 }
      ]),
      JSON.stringify([
        { id: 'doc-001', name: 'Pliego de Bases y Condiciones', type: 'pdf', url: 'https://example.com/pliego.pdf' },
        { id: 'doc-002', name: 'Especificaciones Técnicas', type: 'pdf', url: 'https://example.com/especificaciones.pdf' }
      ]),
      JSON.stringify({ deliveryTime: '12 meses', placeOfDelivery: 'Edificios públicos CABA', warranty: '6 meses', validityOfOffer: 90 }),
      JSON.stringify({ law: 'Ley Nacional de Compras y Contrataciones', decree: 'Decreto 1023/2001', regulation: 'Régimen de Contrataciones de la Administración Pública Nacional' }),
      JSON.stringify({ type: 'mensual', advance: 20, milestones: [{ milestone: 'Mes 1', percentage: 10 }, { milestone: 'Mes 6', percentage: 40 }, { milestone: 'Mes 12', percentage: 50 }] }),
      JSON.stringify({ offer: { percentage: 5, amount: 2500000 }, performance: { percentage: 10, amount: 5000000 }, technical: { percentage: 5, amount: 2500000 } })
    );

    insertTender.run(
      'lic-002', 'OB-2024-015', 'Obra de Refacción Integral Hospital Regional',
      'Refacción completa del Hospital Regional de La Plata incluyendo obra civil, electricidad, plumbing y climatización',
      'Ministerio de Salud', 'Buenos Aires', 'Obras', 'abierta',
      '2024-02-01T10:00:00Z', '2024-03-15T23:59:59Z', 250000000, 'ARS',
      JSON.stringify([
        { id: 'req-006', type: 'technical', description: 'Certificación categoria A en registro de constructores', mandatory: true, weight: 25 },
        { id: 'req-007', type: 'technical', description: 'Antecedentes de obras de similar magnitud', mandatory: true, weight: 20 },
        { id: 'req-008', type: 'commercial', description: 'Oferta económica dentro del presupuesto oficial', mandatory: true, weight: 35 },
        { id: 'req-009', type: 'legal', description: 'Seguro de riesgo de trabajo vigente', mandatory: true, weight: 10 },
        { id: 'req-010', type: 'administrative', description: 'Garantía de oferta según pliego', mandatory: true, weight: 10 }
      ]),
      JSON.stringify([{ id: 'doc-003', name: 'Pliego Técnico', type: 'pdf', url: 'https://example.com/pliego-tecnico.pdf' }]),
      JSON.stringify({ deliveryTime: '18 meses', placeOfDelivery: 'Hospital Regional La Plata', warranty: '12 meses', validityOfOffer: 90 }),
      JSON.stringify({ law: 'Ley de Obras Públicas', decree: 'Decreto 691/2016', regulation: 'Régimen de Contrataciones de Obras Públicas' }),
      JSON.stringify({ type: 'avance', advance: 15, milestones: [{ milestone: '25% avance', percentage: 25 }, { milestone: '50% avance', percentage: 25 }, { milestone: '75% avance', percentage: 25 }, { milestone: 'Entrega definitiva', percentage: 25 }] }),
      JSON.stringify({ offer: { percentage: 2, amount: 5000000 }, performance: { percentage: 5, amount: 12500000 }, technical: { percentage: 5, amount: 12500000 } })
    );

    insertTender.run(
      'lic-003', 'SUM-2024-008', 'Suministro de Equipamiento Informático',
      'Adquisición de 500 computadoras de escritorio, 100 notebooks y 50 servidores para dependencias públicas',
      'Ministerio de Modernización', 'CABA', 'Suministros', 'abierta',
      '2024-02-10T10:00:00Z', '2024-03-10T23:59:59Z', 180000000, 'ARS',
      JSON.stringify([
        { id: 'req-011', type: 'technical', description: 'Equipos con certificación IRAM o equivalente', mandatory: true, weight: 20 },
        { id: 'req-012', type: 'technical', description: 'Soporte técnico local 24/7', mandatory: true, weight: 15 },
        { id: 'req-013', type: 'commercial', description: 'Precio por debajo del presupuesto', mandatory: true, weight: 45 },
        { id: 'req-014', type: 'legal', description: 'Habilitación comercial vigente', mandatory: true, weight: 10 },
        { id: 'req-015', type: 'administrative', description: 'Garantía mínima de 3 años', mandatory: true, weight: 10 }
      ]),
      JSON.stringify([]),
      JSON.stringify({ deliveryTime: '60 días', placeOfDelivery: 'Dependencias del Ministerio', warranty: '36 meses', validityOfOffer: 60 }),
      JSON.stringify({ law: 'Ley de Compras Electrónicas', decree: 'Decreto 1149/2007', regulation: 'Sistema Electrónico de Contrataciones' }),
      JSON.stringify({ type: 'entrega', advance: 0, milestones: [{ milestone: 'Entrega 50%', percentage: 50 }, { milestone: 'Entrega 100% + OK', percentage: 50 }] }),
      JSON.stringify({ offer: { percentage: 2, amount: 3600000 }, performance: { percentage: 10, amount: 18000000 }, technical: { amount: 0, percentage: 0 } })
    );

    // --- Materials ---
    const materials = [
      ['AC-001', 'Acero constructivo', 285000, 275000, 'tonelada', 'ARS', 'up', 'construya.com'],
      ['CE-001', 'Cemento Portland', 12500, 12000, 'tonelada', 'ARS', 'up', 'construya.com'],
      ['HI-001', 'Hierro redondo 12mm', 9500, 9200, 'barra 12m', 'ARS', 'up', 'construya.com'],
      ['LO-001', 'Ladrillo hueco 18x18x33', 1800, 1750, 'unidad', 'ARS', 'stable', 'construya.com'],
      ['PE-001', 'Pintura látex interior', 5800, 5500, 'balde 20L', 'ARS', 'up', 'construya.com'],
      ['PL-001', 'Placa de yeso 1.20x2.40', 4200, 4300, 'unidad', 'ARS', 'down', 'construya.com'],
      ['CA-001', 'Cable unipolar 2.5mm', 850, 800, 'metro', 'ARS', 'up', 'construya.com'],
      ['TU-001', 'Tubo PVC 110mm', 2100, 2000, 'metro', 'ARS', 'up', 'construya.com'],
    ];
    for (const m of materials) {
      insertMaterial.run(...m);
    }

    // --- Currencies ---
    insertCurrency.run('USD/ARS', 1045, 1070, 'sample');
    insertCurrency.run('EUR/ARS', 1130, 1165, 'sample');

    // --- Inflation ---
    insertInflation.run('Enero 2024', 15.8, 254.2, 'INDEC');

    // --- Historical Bids ---
    const historicals = [
      ['lic-001', 'Servicios', 'Empresa A SA', 45000000, 1, 2023, 'CABA'],
      ['lic-001', 'Servicios', 'Empresa B SA', 48000000, 0, 2023, 'CABA'],
      ['lic-001', 'Servicios', 'Empresa C SA', 52000000, 0, 2023, 'CABA'],
      ['lic-002', 'Obras', 'Constructora X', 230000000, 1, 2023, 'Buenos Aires'],
      ['lic-002', 'Obras', 'Constructora Y', 245000000, 0, 2023, 'Buenos Aires'],
      ['lic-003', 'Suministros', 'Tech Solutions', 165000000, 1, 2023, 'CABA'],
      ['lic-003', 'Suministros', 'InfoTech SA', 175000000, 0, 2023, 'CABA'],
      ['lic-003', 'Suministros', 'CompuStar', 180000000, 0, 2023, 'CABA'],
      ['lic-001', 'Servicios', 'Empresa A SA', 42000000, 1, 2022, 'CABA'],
      ['lic-001', 'Servicios', 'Empresa D SA', 45000000, 0, 2022, 'CABA'],
    ];
    for (const h of historicals) {
      insertHistorical.run(...h);
    }

    // --- Competitors ---
    insertCompetitor.run('Empresa A SA', 0.35, 47000000, 'CABA', 20);
    insertCompetitor.run('Empresa B SA', 0.28, 49000000, 'CABA', 15);
    insertCompetitor.run('Empresa C SA', 0.22, 51000000, 'Buenos Aires', 12);
    insertCompetitor.run('Empresa D SA', 0.15, 44000000, 'CABA', 8);

    // --- Patterns ---
    insertPattern.run('pattern-001', 'servicios_limpieza',
      JSON.stringify([
        { name: 'Experiencia de la Empresa', content: 'Nuestra empresa cuenta con más de XX años de experiencia en el sector de limpieza...', order: 1 },
        { name: 'Metodología de Trabajo', content: 'El servicio se realizará siguiendo los más altos estándares de calidad...', order: 2 },
        { name: 'Plan de Trabajo', content: 'El plan de trabajo contempla las siguientes fases: organización, ejecución, control y cierre...', order: 3 },
        { name: 'Recursos Humanos', content: 'Disponemos de personal capacitado y motivado...', order: 4 },
        { name: 'Equipos y Materiales', content: 'Contamos con equipamiento de última tecnología...', order: 5 }
      ]),
      JSON.stringify(['certificación ISO 9001', 'personal capacitado', 'equipamiento adecuado', 'control de calidad', 'informes periódicos']),
      JSON.stringify(['template_experiencia.pdf', 'template_metodologia.pdf']),
      JSON.stringify({ averageMarkup: 18, typicalDiscount: 5, commonPaymentTerms: ['mensual'] }),
      JSON.stringify(['PDF', 'DOCX']), 25, 0.72
    );

    insertPattern.run('pattern-002', 'obra_publica',
      JSON.stringify([
        { name: 'Capacidad Técnica', content: 'Nuestra empresa cuenta con capacidad técnica y recursos necesarios...', order: 1 },
        { name: 'Experiencia en Obras Similares', content: 'Hemos ejecutado exitosamente obras de similar naturaleza y magnitud...', order: 2 },
        { name: 'Plan de Gestión de Obra', content: 'El plan de gestión contempla todos los aspectos de la obra...', order: 3 },
        { name: 'Cronograma de Ejecución', content: 'El cronograma se desarrollará en las siguientes etapas...', order: 4 },
        { name: 'Equipamiento y Maquinaria', content: 'Disponemos de toda la maquinaria y equipamiento necesario...', order: 5 },
        { name: 'Recursos Humanos', content: 'Contamos con personal técnico y obrero capacitado...', order: 6 },
        { name: 'Seguridad e Higiene', content: 'Cumplimentamos todas las normas de seguridad e higiene...', order: 7 }
      ]),
      JSON.stringify(['categoría A', 'registro de constructores', 'obra de similar magnitud', 'certificación de calidad', 'seguro de riesgo']),
      JSON.stringify(['template_obra.pdf', 'template_cronograma.xlsx']),
      JSON.stringify({ averageMarkup: 15, typicalDiscount: 3, commonPaymentTerms: ['avance'] }),
      JSON.stringify(['PDF', 'XLSX']), 18, 0.65
    );

    insertPattern.run('pattern-003', 'suministro',
      JSON.stringify([
        { name: 'Descripción del Producto', content: 'Los productos ofrecidos cumplen con todas las especificaciones técnicas...', order: 1 },
        { name: 'Garantía y Soporte', content: 'Ofrecemos garantía de XX meses con soporte técnico...', order: 2 },
        { name: 'Capacidad de Entrega', content: 'Contamos con stock y capacidad logística para entregar...', order: 3 },
        { name: 'Certificaciones', content: 'Todos nuestros productos cuentan con certificaciones vigentes...', order: 4 }
      ]),
      JSON.stringify(['certificación IRAM', 'garantía técnica', 'soporte 24/7', 'entrega inmediata', 'stock disponible']),
      JSON.stringify(['template_suministro.pdf']),
      JSON.stringify({ averageMarkup: 12, typicalDiscount: 8, commonPaymentTerms: ['entrega'] }),
      JSON.stringify(['PDF']), 12, 0.58
    );

    // --- Legal Templates ---
    const legalTemplates = [
      ['confidentiality', 'Cláusula de Confidencialidad', 'El contratante se compromete a mantener estricta confidencialidad sobre toda la información proporcionada por el contratista en el marco del presente contrato.', 'general'],
      ['warranty', 'Cláusula de Garantía', 'El contratista garantiza que los servicios prestados se ajustan a las especificaciones técnicas y calidad pactadas por un período de {{warranty_months}} meses.', 'general'],
      ['penalty', 'Cláusula Penal', 'En caso de incumplimiento de los plazos establecidos, se aplicarán penalizaciones equivalentes al {{penalty_rate}}% del valor del contrato por cada día de atraso.', 'general'],
      ['termination', 'Cláusula de Rescisión', 'Cualquiera de las partes podrá rescindir el contrato con un preaviso de {{notice_days}} días, sin derecho a indemnización.', 'general'],
      ['force_majeure', 'Cláusula de Fuerza Mayor', 'Ninguna de las partes será responsable por fuerza mayor conforme al artículo 1730 del Código Civil y Comercial.', 'general'],
      ['payment', 'Cláusula de Pago', 'Los pagos se realizarán según el cronograma establecido, dentro de los {{payment_days}} días de presentada la factura.', 'general'],
      ['insurance', 'Cláusula de Seguros', 'El contratista deberá mantener vigente un seguro de riesgo de trabajo y responsabilidad civil por la totalidad del período contractual.', 'general'],
      ['subcontracting', 'Cláusula de Subcontratación', 'Queda prohibida la subcontratación total o parcial de los servicios sin autorización previa y escrita del comitente.', 'general'],
    ];
    const insertLegal = db.prepare('INSERT OR IGNORE INTO legal_templates (type, description, template, category) VALUES (?, ?, ?, ?)');
    for (const lt of legalTemplates) {
      insertLegal.run(...lt);
    }
  });

  seedAll();
}
