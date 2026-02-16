import { Tender, TenderTracking, TrackingMilestone, Alert } from '../types/index.js';

export class TrackingService {
  private trackingData: Map<string, TenderTracking> = new Map();

  async createTracking(tender: Tender): Promise<TenderTracking> {
    const milestones = this.generateMilestones(tender);
    
    const tracking: TenderTracking = {
      tenderId: tender.id,
      milestones,
      alerts: []
    };

    this.trackingData.set(tender.id, tracking);
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
    return this.trackingData.get(tenderId) || null;
  }

  async updateMilestone(
    tenderId: string,
    milestoneName: string,
    completed: boolean,
    notes?: string
  ): Promise<TrackingMilestone | null> {
    const tracking = this.trackingData.get(tenderId);
    if (!tracking) return null;

    const milestone = tracking.milestones.find(m => m.name === milestoneName);
    if (milestone) {
      milestone.completed = completed;
      if (notes) milestone.notes = notes;
      this.trackingData.set(tenderId, tracking);
    }

    return milestone || null;
  }

  async getAlerts(tenderId: string): Promise<Alert[]> {
    const tracking = this.trackingData.get(tenderId);
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
    const allAlerts = new Map<string, Alert[]>();
    
    this.trackingData.forEach((tracking, tenderId) => {
      allAlerts.set(tenderId, this.getAlertsSync(tracking));
    });

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
    const tracking = this.trackingData.get(tenderId);
    if (!tracking) return false;

    const alerts = await this.getAlerts(tenderId);
    if (alertIndex >= 0 && alertIndex < alerts.length) {
      alerts[alertIndex].read = true;
      this.trackingData.set(tenderId, tracking);
      return true;
    }

    return false;
  }

  async getTimeline(tenderId: string): Promise<{
    past: TrackingMilestone[];
    upcoming: TrackingMilestone[];
    summary: string;
  }> {
    const tracking = this.trackingData.get(tenderId);
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
    const tracking = this.trackingData.get(tenderId);
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
