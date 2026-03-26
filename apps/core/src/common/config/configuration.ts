export default () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/orchestra',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me-in-production',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  },
  polling: {
    enabled: process.env.POLLING_ENABLED ?? 'true',
    intervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? '15000', 10),
  },
});
