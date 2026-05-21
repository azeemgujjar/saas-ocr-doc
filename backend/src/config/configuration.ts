// Typed config object. Read with configService.get('jwt.accessSecret') etc.
export default () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  apiVersion: process.env.API_VERSION || 'v1',
  logLevel: process.env.LOG_LEVEL || 'info',

  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim()),
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxFileSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES || '10485760', 10),
    allowedMimeTypes: (
      process.env.ALLOWED_MIME_TYPES ||
      'image/jpeg,image/png,image/webp'
    )
      .split(',')
      .map((s) => s.trim()),
  },

  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL_SECONDS || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },

  processing: {
    simulatedDelayMs: parseInt(
      process.env.PROCESSING_SIMULATED_DELAY_MS || '4000',
      10,
    ),
  },

  ocr: {
    // Base URL of the Tesseract OCR microservice (the `ocr` compose service).
    serviceUrl: process.env.OCR_SERVICE_URL || 'http://localhost:4000',
    timeoutMs: parseInt(process.env.OCR_TIMEOUT_MS || '120000', 10),
  },
});
