import * as Joi from 'joi';

// Env validation — the app won't boot if anything required is missing.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3001),
  API_PREFIX: Joi.string().default('api'),
  API_VERSION: Joi.string().default('v1'),
  LOG_LEVEL: Joi.string()
    .valid('trace', 'debug', 'info', 'warn', 'error', 'fatal')
    .default('info'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),

  DATABASE_URL: Joi.string().uri().required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  UPLOAD_DIR: Joi.string().default('./uploads'),
  MAX_FILE_SIZE_BYTES: Joi.number().default(10 * 1024 * 1024),
  ALLOWED_MIME_TYPES: Joi.string().default(
    'image/jpeg,image/png,image/webp',
  ),

  THROTTLE_TTL_SECONDS: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),

  PROCESSING_SIMULATED_DELAY_MS: Joi.number().default(4000),

  OCR_SERVICE_URL: Joi.string().uri().default('http://localhost:4000'),
  OCR_TIMEOUT_MS: Joi.number().default(120000),
});
