/**
 * FocusAI — Server Configuration
 * All env vars are read here; no other file should touch process.env directly.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

function required(name) {
  const val = process.env[name];
  if (!val && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val || '';
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',

  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    // SERVICE ROLE KEY — server only, never sent to browser
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL || 'gemma4:12b',
    timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS || '60000', 10),
  },

  upload: {
    maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10) * 1024 * 1024,
    bucket: process.env.UPLOAD_BUCKET || 'materials',
    allowedMimeTypes: [
      'application/pdf',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/markdown',
    ],
  },

  security: {
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequestsPerWindow: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
};
