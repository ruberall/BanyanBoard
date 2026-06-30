import 'dotenv/config';
import { z } from 'zod';

// z.coerce.boolean() uses Boolean() which treats any non-empty string as true,
// so 'false' would be coerced to true. This custom coercion correctly handles
// string env var values: 'false', '0', 'no', '' → false; everything else → true.
const envBoolean = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    return !['false', '0', 'no', ''].includes(val.toLowerCase());
  });

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  DB_POOL_MAX: z.coerce.number().default(10),
  DB_POOL_IDLE_TIMEOUT_MS: z.coerce.number().default(30000),
  DB_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().default(5000),
  MIGRATIONS_DIR: z.string().default('migrations'),
  RUN_MIGRATIONS_ON_START: envBoolean.default(true),
  OTEL_SDK_DISABLED: envBoolean.default(true),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').optional(),
  SESSION_COOKIE_MAX_AGE_MS: z.coerce.number().default(7 * 24 * 60 * 60 * 1000),
  SESSION_SECURE: envBoolean.default(false),
  FEED_MAX_HISTORY: z.coerce.number().default(20),
  FEED_SSE_HEARTBEAT_MS: z.coerce.number().default(15000),
  WORKFLOW_STALE_AGE_DAYS: z.coerce.number().default(2),
  WORKFLOW_RULE2_BASE_DELAY_MS: z.coerce.number().default(200),
  WORKFLOW_RULE2_MAX_ATTEMPTS: z.coerce.number().default(3),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().default(3),
  WEBHOOK_BACKOFF_MS: z.coerce.number().default(30000),
  WEBHOOK_REQUEST_TIMEOUT_MS: z.coerce.number().default(5000),
  WEBHOOK_BLOCK_PRIVATE_RANGES: envBoolean.default(true),
});

// Config exposes the 8 core fields as required (matching test stubs)
// and the extended operational fields as optional (they always have runtime defaults).
export type Config = {
  PORT: number;
  NODE_ENV: string;
  DATABASE_URL: string;
  LOG_LEVEL: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
  LOG_FORMAT: 'json' | 'pretty';
  DB_POOL_MAX: number;
  DB_POOL_IDLE_TIMEOUT_MS: number;
  DB_POOL_CONNECTION_TIMEOUT_MS: number;
  MIGRATIONS_DIR?: string;
  RUN_MIGRATIONS_ON_START?: boolean;
  OTEL_SDK_DISABLED?: boolean;
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  SESSION_SECRET?: string;
  SESSION_COOKIE_MAX_AGE_MS?: number;
  SESSION_SECURE?: boolean;
  FEED_MAX_HISTORY?: number;
  FEED_SSE_HEARTBEAT_MS?: number;
  WORKFLOW_STALE_AGE_DAYS?: number;
  WORKFLOW_RULE2_BASE_DELAY_MS?: number;
  WORKFLOW_RULE2_MAX_ATTEMPTS?: number;
  WEBHOOK_MAX_ATTEMPTS?: number;
  WEBHOOK_BACKOFF_MS?: number;
  WEBHOOK_REQUEST_TIMEOUT_MS?: number;
  WEBHOOK_BLOCK_PRIVATE_RANGES?: boolean;
};

const parseResult = configSchema.safeParse(process.env);
if (!parseResult.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parseResult.error.format());
  process.exit(1);
}

export const config: Readonly<Config> = Object.freeze(parseResult.data);
