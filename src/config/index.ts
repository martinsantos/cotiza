import { Config, Company } from '../types/index.js';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CONFIG_PATH = join(process.cwd(), 'cotizar.config.json');

export const defaultConfig: Config = {
  company: {
    id: 'default',
    name: 'Mi Empresa SA',
    taxId: '30-12345678-9',
    address: {
      street: '',
      city: '',
      province: '',
      postalCode: '',
      country: 'Argentina'
    },
    contact: {
      name: '',
      email: '',
      phone: ''
    },
    certifications: [],
    experience: []
  },
  defaults: {
    currency: 'ARS',
    taxRate: 21,
    profitMargin: 15,
    outputDirectory: './bids'
  },
  templates: {
    technical: './templates/technical',
    commercial: './templates/commercial',
    legal: './templates/legal'
  },
  tracking: {
    alertDaysBefore: [7, 3, 1],
    notifications: true
  },
  market: {
    updateFrequency: 'daily',
    sources: ['bcra', 'indec']
  },
  api: {
    port: 3000,
    host: '0.0.0.0'
  }
};

let config: Config = { ...defaultConfig };

export function loadConfig(): Config {
  if (existsSync(CONFIG_PATH)) {
    try {
      const data = readFileSync(CONFIG_PATH, 'utf-8');
      config = { ...defaultConfig, ...JSON.parse(data) };
    } catch (error) {
      console.warn('Failed to load config, using defaults');
    }
  }

  // Override with environment variables
  if (process.env.API_PORT || process.env.PORT) {
    config.api.port = Number(process.env.API_PORT || process.env.PORT) || config.api.port;
  }
  if (process.env.API_HOST) {
    config.api.host = process.env.API_HOST;
  }

  return config;
}

export function saveConfig(newConfig: Partial<Config>): Config {
  config = { ...config, ...newConfig };
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  return config;
}

export function getConfig(): Config {
  return config;
}

export function updateCompany(company: Partial<Company>): Company {
  config.company = { ...config.company, ...company };
  saveConfig(config);
  return config.company;
}

export function getCompany(): Company {
  return config.company;
}

export { CONFIG_PATH };
