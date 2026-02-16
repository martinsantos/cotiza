#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import { tenderService } from './services/tender.service.js';
import { bidService } from './services/bid.service.js';
import { patternService } from './services/pattern.service.js';
import { marketService } from './services/market.service.js';
import { legalService } from './services/legal.service.js';
import { trackingService } from './services/tracking.service.js';
import { competitiveService } from './services/competitive.service.js';
import { loadConfig, updateCompany, getCompany } from './config/index.js';
import { startServer } from './api/server.js';
import { Tender, Bid, PatternBundle } from './types/index.js';

const program = new Command();

program
  .name('cotizAR')
  .description('CLI para generar cotizaciones competitivas de licitaciones argentinas')
  .version('1.0.0');

// Load config on startup
loadConfig();

// ============ TENDER COMMANDS ============

program
  .command('tenders')
  .description('Gestionar licitaciones')
  .addCommand(
    new Command('list')
      .description('Listar licitaciones')
      .option('--status <status>', 'Filtrar por estado')
      .option('--category <category>', 'Filtrar por categoría')
      .option('--region <region>', 'Filtrar por región')
      .action(async (options) => {
        try {
          const tenders = await tenderService.list({
            status: options.status,
            category: options.category,
            region: options.region
          });
          console.log('\n=== LICITACIONES ===\n');
          tenders.forEach(t => {
            console.log(`[${t.status.toUpperCase()}] ${t.number} - ${t.title}`);
            console.log(`   Organismo: ${t.agency} | Región: ${t.region}`);
            console.log(`   Presupuesto: $${t.budget.toLocaleString()} | Cierre: ${new Date(t.closingDate).toLocaleDateString()}`);
            console.log('');
          });
        } catch (error) {
          console.error('Error listing tenders:', error);
        }
      })
  )
  .addCommand(
    new Command('search <query>')
      .description('Buscar licitaciones')
      .action(async (query) => {
        try {
          const tenders = await tenderService.search(query);
          console.log(`\n=== RESULTADOS PARA: "${query}" ===\n`);
          tenders.forEach(t => {
            console.log(`[${t.status.toUpperCase()}] ${t.number} - ${t.title}`);
            console.log(`   ${t.description.substring(0, 100)}...`);
            console.log('');
          });
        } catch (error) {
          console.error('Error searching tenders:', error);
        }
      })
  )
  .addCommand(
    new Command('show <id>')
      .description('Mostrar detalles de licitacion')
      .action(async (id) => {
        try {
          const tender = await tenderService.getById(id);
          if (!tender) {
            console.log('Licitación no encontrada');
            return;
          }
          console.log('\n=== DETALLE DE LICITACIÓN ===\n');
          console.log(`Número: ${tender.number}`);
          console.log(`Título: ${tender.title}`);
          console.log(`Descripción: ${tender.description}`);
          console.log(`Organismo: ${tender.agency}`);
          console.log(`Región: ${tender.region}`);
          console.log(`Categoría: ${tender.category}`);
          console.log(`Estado: ${tender.status}`);
          console.log(`Presupuesto: $${tender.budget.toLocaleString()} ${tender.currency}`);
          console.log(`Apertura: ${new Date(tender.openingDate).toLocaleDateString()}`);
          console.log(`Cierre: ${new Date(tender.closingDate).toLocaleDateString()}`);
          console.log(`\nRequisitos (${tender.requirements.length}):`);
          tender.requirements.forEach(r => {
            console.log(`  - [${r.mandatory ? 'OBLIGATORIO' : 'OPCIONAL'}] ${r.description}`);
          });
        } catch (error) {
          console.error('Error showing tender:', error);
        }
      })
  );

// ============ BID COMMANDS ============

program
  .command('bid')
  .description('Gestionar cotizaciones')
  .addCommand(
    new Command('create <tenderId>')
      .description('Crear nueva cotización')
      .action(async (tenderId) => {
        try {
          const bid = await bidService.create(tenderId);
          console.log(`\n✓ Cotización creada: ${bid.id}`);
          console.log('Próximos pasos:');
          console.log('  1. cotizAR bid analyze <id> - Analizar requisitos');
          console.log('  2. cotizAR bid calculate <id> - Calcular precios');
          console.log('  3. cotizAR bid generate <id> - Generar documentos');
        } catch (error) {
          console.error('Error creating bid:', error);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('Listar cotizaciones')
      .action(async () => {
        try {
          const bids = await bidService.list();
          console.log('\n=== COTIZACIONES ===\n');
          bids.forEach(b => {
            console.log(`[${b.status.toUpperCase()}] ${b.id} - Tender: ${b.tenderId}`);
            console.log(`   Total: $${b.commercialOffer.total?.toLocaleString() || 'N/A'}`);
            console.log('');
          });
        } catch (error) {
          console.error('Error listing bids:', error);
        }
      })
  )
  .addCommand(
    new Command('analyze <bidId>')
      .description('Analizar cotización')
      .action(async (bidId) => {
        try {
          const analysis = await bidService.analyze(bidId);
          console.log('\n=== ANÁLISIS DE COTIZACIÓN ===\n');
          console.log(`Probabilidad de éxito: ${analysis.winProbability}%`);
          console.log('\nFortalezas:');
          analysis.strengths.forEach(s => console.log(`  ✓ ${s}`));
          console.log('\nDebilidades:');
          analysis.weaknesses.forEach(w => console.log(`  ✗ ${w}`));
          console.log('\nRiesgos:');
          analysis.risks.forEach(r => console.log(`  ⚠ ${r.description} (${r.severity})`));
          console.log('\nRecomendaciones:');
          analysis.recommendations.forEach(r => console.log(`  → ${r}`));
        } catch (error) {
          console.error('Error analyzing bid:', error);
        }
      })
  )
  .addCommand(
    new Command('calculate <bidId>')
      .description('Calcular precios de cotización')
      .action(async (bidId) => {
        try {
          const bid = await bidService.getById(bidId);
          if (!bid) {
            console.log('Cotización no encontrada');
            return;
          }
          console.log('\nIngrese los costos estimados:');
          const { labor, materials, equipment, overhead, other, discount } = await inquirer.prompt([
            { type: 'number', name: 'labor', message: 'Costo de mano de obra:' },
            { type: 'number', name: 'materials', message: 'Costo de materiales:' },
            { type: 'number', name: 'equipment', message: 'Costo de equipos:' },
            { type: 'number', name: 'overhead', message: 'Gastos generales:' },
            { type: 'number', name: 'other', message: 'Otros costos:' },
            { type: 'number', name: 'discount', message: 'Descuento (%):', default: 0 }
          ]);
          
          const pricing = await bidService.calculatePricing(bidId, {
            labor, materials, equipment, overhead, other, discount
          });
          
          console.log('\n=== PRESUPUESTO CALCULADO ===\n');
          console.log(`Costo base: $${pricing.basePrice.toLocaleString()}`);
          if (pricing.discount > 0) {
            console.log(`Descuento: ${pricing.discount}%`);
          }
          console.log(`Subtotal: $${pricing.subtotal.toLocaleString()}`);
          console.log(`IVA (${pricing.taxRate}%): $${pricing.taxAmount.toLocaleString()}`);
          console.log(`\nTOTAL: $${pricing.total.toLocaleString()} ${pricing.currency}`);
        } catch (error) {
          console.error('Error calculating bid:', error);
        }
      })
  )
  .addCommand(
    new Command('generate <bidId>')
      .description('Generar documentos')
      .action(async (bidId) => {
        try {
          const { type } = await inquirer.prompt([
            {
              type: 'list',
              name: 'type',
              message: 'Tipo de documento:',
              choices: ['technical', 'commercial', 'summary', 'annex']
            }
          ]);
          
          const doc = await bidService.generateDocument(bidId, type);
          console.log(`\n✓ Documento generado: ${doc.name} (${doc.format})`);
        } catch (error) {
          console.error('Error generating document:', error);
        }
      })
  );

// ============ PATTERN COMMANDS ============

program
  .command('patterns')
  .description('Buscar patrones en ofertas históricas')
  .addCommand(
    new Command('search <query>')
      .description('Buscar patrones')
      .action(async (query) => {
        try {
          const patterns = await patternService.search(query);
          console.log(`\n=== PATRONES ENCONTRADOS ===\n`);
          patterns.forEach(p => {
            console.log(`[${p.tenderType}] Tasa de éxito: ${(p.successRate * 100).toFixed(0)}%`);
            console.log(`  Secciones: ${p.sections.length}`);
            console.log(`  Usos: ${p.usageCount}`);
            console.log('');
          });
        } catch (error) {
          console.error('Error searching patterns:', error);
        }
      })
  )
  .addCommand(
    new Command('templates')
      .description('Listar plantillas disponibles')
      .action(async () => {
        try {
          const patterns = await patternService.list();
          console.log('\n=== PLANTILLAS DISPONIBLES ===\n');
          patterns.forEach(p => {
            console.log(`[${p.tenderType}]`);
            p.templates.forEach(t => console.log(`  - ${t}`));
            console.log('');
          });
        } catch (error) {
          console.error('Error listing templates:', error);
        }
      })
  );

// ============ MARKET COMMANDS ============

program
  .command('market')
  .description('Información de mercado')
  .addCommand(
    new Command('prices')
      .description('Precios de materiales')
      .action(async () => {
        try {
          const materials = await marketService.getMaterialPrices();
          console.log('\n=== PRECIOS DE MATERIALES ===\n');
          materials.forEach(m => {
            const trend = m.trend === 'up' ? '↑' : m.trend === 'down' ? '↓' : '→';
            console.log(`${trend} ${m.name}: $${m.currentPrice.toLocaleString()}/${m.unit}`);
          });
        } catch (error) {
          console.error('Error getting prices:', error);
        }
      })
  )
  .addCommand(
    new Command('currencies')
      .description('Cotizaciones de monedas')
      .action(async () => {
        try {
          const currencies = await marketService.getCurrencies();
          console.log('\n=== COTIZACIONES ===\n');
          currencies.forEach(c => {
            console.log(`${c.pair}: Compra $${c.buy} | Venta $${c.sell}`);
          });
        } catch (error) {
          console.error('Error getting currencies:', error);
        }
      })
  )
  .addCommand(
    new Command('inflation')
      .description('Datos de inflación')
      .action(async () => {
        try {
          const inflation = await marketService.getInflation();
          if (inflation) {
            console.log('\n=== INFLACIÓN ===\n');
            console.log(`Período: ${inflation.period}`);
            console.log(`Mensual: ${inflation.monthly}%`);
            console.log(`Anual: ${inflation.annual}%`);
            console.log(`Fuente: ${inflation.source}`);
          }
        } catch (error) {
          console.error('Error getting inflation:', error);
        }
      })
  )
  .addCommand(
    new Command('context')
      .description('Contexto económico')
      .action(async () => {
        try {
          const context = await marketService.getEconomicContext();
          console.log('\n=== CONTEXTO ECONÓMICO ===\n');
          console.log(context.summary);
        } catch (error) {
          console.error('Error getting context:', error);
        }
      })
  )
  .addCommand(
    new Command('update')
      .description('Actualizar datos de mercado')
      .action(async () => {
        try {
          const result = await marketService.updateMarketData();
          console.log(`\n${result.message}`);
        } catch (error) {
          console.error('Error updating market:', error);
        }
      })
  );

// ============ LEGAL COMMANDS ============

program
  .command('legal')
  .description('Cumplimiento legal')
  .addCommand(
    new Command('analyze <tenderId>')
      .description('Analizar requisitos legales')
      .action(async (tenderId) => {
        try {
          const tender = await tenderService.getById(tenderId);
          if (!tender) {
            console.log('Licitación no encontrada');
            return;
          }
          const analysis = await legalService.analyzeLegalRequirements(tender);
          console.log('\n=== ANÁLISIS LEGAL ===\n');
          console.log(`Marco: ${analysis.framework.law}`);
          console.log(`\nCláusulas requeridas:`);
          analysis.requiredClauses.forEach(c => console.log(`  - ${c}`));
          console.log(`\nRecomendaciones:`);
          analysis.recommendations.forEach(r => console.log(`  → ${r}`));
        } catch (error) {
          console.error('Error analyzing legal:', error);
        }
      })
  )
  .addCommand(
    new Command('report <tenderId>')
      .description('Generar reporte de cumplimiento')
      .action(async (tenderId) => {
        try {
          const report = await legalService.generateComplianceReport(tenderId);
          console.log(`\n${report}`);
        } catch (error) {
          console.error('Error generating report:', error);
        }
      })
  );

// ============ TRACKING COMMANDS ============

program
  .command('track <tenderId>')
  .description('Rastrar estado de licitacion')
  .action(async (tenderId) => {
    try {
      const timeline = await trackingService.getTimeline(tenderId);
      console.log('\n=== CRONOGRAMA ===\n');
      console.log(timeline.summary);
      console.log('\nPróximos hitos:');
      timeline.upcoming.forEach(m => {
        const date = new Date(m.date).toLocaleDateString();
        console.log(`  → ${m.name}: ${date}`);
      });
    } catch (error) {
      console.error('Error tracking tender:', error);
    }
  });

// ============ COMPETITIVE COMMANDS ============

program
  .command('competitive')
  .description('Análisis competitivo')
  .addCommand(
    new Command('analyze <tenderId>')
      .description('Análisis completo de competitividad')
      .action(async (tenderId) => {
        try {
          const tender = await tenderService.getById(tenderId);
          if (!tender) {
            console.log('Licitación no encontrada');
            return;
          }
          const analysis = await competitiveService.analyze(tender);
          console.log('\n=== ANÁLISIS COMPETITIVO ===\n');
          console.log(`Puntuación total: ${analysis.score.total}/100`);
          console.log(`  Precio: ${analysis.score.priceScore}`);
          console.log(`  Técnico: ${analysis.score.technicalScore}`);
          console.log(`  Experiencia: ${analysis.score.experienceScore}`);
          console.log(`\nBenchmarks:`);
          console.log(`  Precio promedio: $${analysis.benchmark.averageMarketPrice.toLocaleString()}`);
          console.log(`  Ganador más bajo: $${analysis.benchmark.lowestWinningPrice.toLocaleString()}`);
          console.log(`  Ganador más alto: $${analysis.benchmark.highestWinningPrice.toLocaleString()}`);
          console.log(`\nCompetidores en la zona:`);
          analysis.competitors.forEach(c => {
            console.log(`  - ${c.name}: ${c.winRate * 100}% victorias`);
          });
        } catch (error) {
          console.error('Error analyzing competitiveness:', error);
        }
      })
  )
  .addCommand(
    new Command('price <tenderId>')
      .description('Recomendación de precio')
      .action(async (tenderId) => {
        try {
          const tender = await tenderService.getById(tenderId);
          if (!tender) {
            console.log('Licitación no encontrada');
            return;
          }
          const analysis = await competitiveService.analyze(tender);
          const rec = await competitiveService.getPriceRecommendation(tender, analysis.benchmark);
          console.log('\n=== RECOMENDACIÓN DE PRECIO ===\n');
          console.log(`Mínimo: $${rec.minimum.toLocaleString()}`);
          console.log(`Recomendado: $${rec.recommended.toLocaleString()}`);
          console.log(`Máximo: $${rec.maximum.toLocaleString()}`);
          console.log(`\nEstrategia: ${rec.strategy}`);
        } catch (error) {
          console.error('Error getting price recommendation:', error);
        }
      })
  );

// ============ API COMMAND ============

program
  .command('api')
  .description('Iniciar servidor API')
  .option('--port <port>', 'Puerto del servidor')
  .action(async (options) => {
    const port = options.port ? parseInt(options.port) : 3000;
    console.log(`\n🚀 Iniciando servidor cotizAR API en puerto ${port}...`);
    startServer(port);
  });

// ============ INTERACTIVE MODE ============

program
  .command('interactive')
  .description('Modo interactivo')
  .action(async () => {
    console.log('\n🟢 Modo Interactivo cotizAR\n');
    
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '¿Qué desea hacer?',
        choices: [
          'Buscar licitaciones',
          'Ver licitaciones abiertas',
          'Crear cotización',
          'Analizar mercado',
          'Ver análisis competitivo',
          'Salir'
        ]
      }
    ]);

    switch (action) {
      case 'Buscar licitaciones':
        const { query } = await inquirer.prompt([
          { type: 'input', name: 'query', message: 'Ingrese búsqueda:' }
        ]);
        const searchResults = await tenderService.search(query);
        console.log(`\n${searchResults.length} resultados encontrados`);
        break;
        
      case 'Ver licitaciones abiertas':
        const openTenders = await tenderService.list({ status: 'abierta' });
        console.log(`\n${openTenders.length} licitaciones abiertas`);
        break;
        
      case 'Crear cotización':
        const { tenderId } = await inquirer.prompt([
          { type: 'input', name: 'tenderId', message: 'ID de licitación:' }
        ]);
        const bid = await bidService.create(tenderId);
        console.log(`\n✓ Cotización ${bid.id} creada`);
        break;
        
      case 'Analizar mercado':
        const context = await marketService.getEconomicContext();
        console.log(`\n${context.summary}`);
        break;
        
      case 'Ver análisis competitivo':
        const tenders = await tenderService.list();
        if (tenders.length > 0) {
          const { selectedTender } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedTender',
              message: 'Seleccione licitación:',
              choices: tenders.map(t => ({ name: t.title, value: t.id }))
            }
          ]);
          const analysis = await competitiveService.analyze(await tenderService.getById(selectedTender));
          console.log(`\nPuntuación: ${analysis.score.total}/100`);
        }
        break;
        
      default:
        console.log('\n¡Hasta luego!');
    }
  });

// ============ CONFIG COMMANDS ============

program
  .command('config')
  .description('Configuración')
  .addCommand(
    new Command('show')
      .description('Mostrar configuración actual')
      .action(() => {
        const company = getCompany();
        console.log('\n=== CONFIGURACIÓN ===\n');
        console.log(`Empresa: ${company.name}`);
        console.log(`CUIT: ${company.taxId}`);
      })
  )
  .addCommand(
    new Command('set')
      .description('Establecer configuración')
      .action(async () => {
        const { name, taxId } = await inquirer.prompt([
          { type: 'input', name: 'name', message: 'Nombre de empresa:' },
          { type: 'input', name: 'taxId', message: 'CUIT:' }
        ]);
        updateCompany({ name, taxId });
        console.log('\n✓ Configuración actualizada');
      })
  );

// Parse arguments
program.parse();
