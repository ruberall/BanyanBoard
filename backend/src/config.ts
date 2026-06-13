import 'dotenv/config';
import { z } from 'zod';

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
  RUN_MIGRATIONS_ON_START: z.coerce.boolean().default(true),
  OTEL_SDK_DISABLED: z.coerce.boolean().default(true),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
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
};

const parseResult = configSchema.safeParse(process.env);
if (!parseResult.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parseResult.error.format());
  process.exit(1);
}

export const config: Readonly<Config> = Object.freeze(parseResult.data);
