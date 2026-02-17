import { licitometroService } from './licitometro.service.js';
import { marketService } from './market.service.js';
import { logger } from '../utils/logger.js';

export class SchedulerService {
  private intervals: NodeJS.Timeout[] = [];
  private running = false;

  start(): void {
    if (this.running) return;
    this.running = true;

    const syncHours = parseInt(process.env.SYNC_INTERVAL_HOURS || '6', 10);
    const marketHours = parseInt(process.env.MARKET_UPDATE_INTERVAL_HOURS || '4', 10);

    // Sync tenders from licitometro periodically
    this.intervals.push(setInterval(async () => {
      try {
        logger.info('Syncing tenders from licitometro.ar...');
        const result = await licitometroService.sync({ estado: 'abierta', limit: 100 });
        logger.info(`Tender sync: ${result.message}`);
      } catch (err) {
        logger.error('Tender sync failed:', { error: (err as Error).message });
      }
    }, syncHours * 60 * 60 * 1000));

    // Update market data periodically
    this.intervals.push(setInterval(async () => {
      try {
        logger.info('Updating market data...');
        const result = await marketService.updateMarketData();
        logger.info(`Market update: ${result.message}`);
      } catch (err) {
        logger.error('Market update failed:', { error: (err as Error).message });
      }
    }, marketHours * 60 * 60 * 1000));

    // Initial sync after 10 seconds (let server start first)
    setTimeout(async () => {
      try {
        logger.info('Initial market data update...');
        const marketResult = await marketService.updateMarketData();
        logger.info(`Initial market: ${marketResult.message}`);
      } catch (err) {
        logger.error('Initial market update failed:', { error: (err as Error).message });
      }

      try {
        logger.info('Initial tender sync...');
        const syncResult = await licitometroService.sync({ estado: 'abierta', limit: 50 });
        logger.info(`Initial sync: ${syncResult.message}`);
      } catch (err) {
        logger.error('Initial tender sync failed:', { error: (err as Error).message });
      }
    }, 10000);

    logger.info(`Scheduler started - Tender sync every ${syncHours}h, Market update every ${marketHours}h`);
  }

  stop(): void {
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    this.running = false;
    logger.info('Scheduler stopped');
  }
}

export const schedulerService = new SchedulerService();
