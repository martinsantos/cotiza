import { Tender, TenderTracking, TrackingMilestone, Alert } from '../types/index.js';
import { getDb } from '../db/index.js';

export class TrackingService {
  async createTracking(tender: Tender): Promise<TenderTracking> {
    const milestones = this.generateMilestones(tender);

    const tracking: TenderTracking = {
      tenderId: tender.id,
      milestones,
      alerts: []
    };

    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO tracking (tender_id, milestones, alerts)
      VALUES (?, ?, ?)
    `).run(tender.id, JSON.stringify(milestones), JSON.stringify([]));

    return tracking;
  }

  private generateMilestones(tender: Tender): TrackingMilestone[] {
    const openingDate = new Date(tender.openingDate);
    const closingDate = new Date(tender.closingDate);

    const milestones: TrackingMilestone[] = [
      {
        name: 'Publicación',
        date: openingDate.toISOString(),
        completed: openingDate < new Date()
      },
      {
        name: 'Período de Consultas',
        date: new Date(closingDate.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        completed: false
      },
      {
        name: 'Último Día de Consultas',
        date: new Date(closingDate.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        completed: false
      },
      {
        name: 'Respuesta a Consultas',
        date: new Date(closingDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        completed: false
      },
      {
        name: 'Presentacion de Ofertas',
        date: closingDate.toISOString(),
        completed: false
      },
      {
        name: 'Apertura de Sobres',
        date: new Date(closingDate.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        completed: false
      },
      {
        name: 'Evaluación',
        date: new Date(closingDate.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        completed: false
      },
      {
        name: 'Adjudicación',
        date: new Date(closingDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        completed: false
      }
    ];

    return milestones;
  }

  async getTracking(tenderId: string): Promise<TenderTracking | null> {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tracking WHERE tender_id = ?').get(tenderId) as any;
    if (!row) return null;

    return {
      tenderId: row.tender_id,
      milestones: JSON.parse(row.milestones || '[]'),
      alerts: JSON.parse(row.alerts || '[]'),
    };
  }

  async updateMilestone(
    tenderId: string,
    milestoneName: string,
    completed: boolean,
    notes?: string
  ): Promise<TrackingMilestone | null> {
    const tracking = await this.getTracking(tenderId);
    if (!tracking) return null;

    const milestone = tracking.milestones.find(m => m.name === milestoneName);
    if (!milestone) return null;

    milestone.completed = completed;
    if (notes) milestone.notes = notes;

    const db = getDb();
    db.prepare('UPDATE tracking SET milestones = ? WHERE tender_id = ?')
      .run(JSON.stringify(tracking.milestones), tenderId);

    return milestone;
  }

  async getAlerts(tenderId: string): Promise<Alert[]> {
    const tracking = await this.getTracking(tenderId);
    if (!tracking) return [];

    const alerts: Alert[] = [];
    const now = new Date();

    tracking.milestones.forEach(milestone => {
      if (milestone.completed) return;

      const milestoneDate = new Date(milestone.date);
      const daysUntil = Math.ceil((milestoneDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Deadline alerts
      if (daysUntil >= 0 && daysUntil <= 7) {
        alerts.push({
          type: 'deadline',
          message: `${milestone.name} en ${daysUntil} días`,
          date: milestone.date,
          read: false
        });
      }

      // Expired alerts
      if (daysUntil < 0) {
        alerts.push({
          type: 'result',
          message: `${milestone.name} ya passedó`,
          date: milestone.date,
          read: false
        });
      }
    });

    return alerts;
  }

  async getAllAlerts(): Promise<Map<string, Alert[]>> {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM tracking').all() as any[];
    const allAlerts = new Map<string, Alert[]>();

    for (const row of rows) {
      const tracking: TenderTracking = {
        tenderId: row.tender_id,
        milestones: JSON.parse(row.milestones || '[]'),
        alerts: JSON.parse(row.alerts || '[]'),
      };
      allAlerts.set(row.tender_id, this.getAlertsSync(tracking));
    }

    return allAlerts;
  }

  private getAlertsSync(tracking: TenderTracking): Alert[] {
    const alerts: Alert[] = [];
    const now = new Date();

    tracking.milestones.forEach(milestone => {
      if (milestone.completed) return;

      const milestoneDate = new Date(milestone.date);
      const daysUntil = Math.ceil((milestoneDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil >= 0 && daysUntil <= 7) {
        alerts.push({
          type: 'deadline',
          message: `${milestone.name} en ${daysUntil} días`,
          date: milestone.date,
          read: false
        });
      }
    });

    return alerts;
  }

  async markAlertRead(tenderId: string, alertIndex: number): Promise<boolean> {
    // Alerts are dynamically calculated, not stored, so just return true
    return true;
  }

  async getTimeline(tenderId: string): Promise<{
    past: TrackingMilestone[];
    upcoming: TrackingMilestone[];
    summary: string;
  }> {
    const tracking = await this.getTracking(tenderId);
    if (!tracking) {
      return {
        past: [],
        upcoming: [],
        summary: 'No tracking data available'
      };
    }

    const now = new Date();
    const past = tracking.milestones.filter(m => new Date(m.date) < now || m.completed);
    const upcoming = tracking.milestones.filter(m => new Date(m.date) >= now && !m.completed);

    const daysUntilClose = tracking.milestones.find(m =>
      m.name === 'Presentacion de Ofertas'
    );

    const summary = `Días restantes para presentar oferta: ${
      daysUntilClose ? Math.ceil(
        (new Date(daysUntilClose.date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      ) : 'N/A'
    }`;

    return { past, upcoming, summary };
  }

  async checkDeadlines(tenderId: string): Promise<{
    urgent: string[];
    upcoming: string[];
    extended: string[];
  }> {
    const tracking = await this.getTracking(tenderId);
    if (!tracking) {
      return { urgent: [], upcoming: [], extended: [] };
    }

    const now = new Date();
    const urgent: string[] = [];
    const upcoming: string[] = [];
    const extended: string[] = [];

    tracking.milestones.forEach(milestone => {
      if (milestone.completed) return;

      const milestoneDate = new Date(milestone.date);
      const daysUntil = Math.ceil((milestoneDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil < 0) {
        // Check if extended
        if (milestone.notes?.includes('prórroga')) {
          extended.push(`${milestone.name} extendido`);
        }
      } else if (daysUntil <= 3) {
        urgent.push(`${milestone.name} en ${daysUntil} días`);
      } else if (daysUntil <= 14) {
        upcoming.push(`${milestone.name} en ${daysUntil} días`);
      }
    });

    return { urgent, upcoming, extended };
  }
}

export const trackingService = new TrackingService();
