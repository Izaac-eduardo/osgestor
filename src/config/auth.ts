export const sessionCookieName = 'osgestor_session';
export const sessionIdleSeconds = 8 * 60 * 60;
export const sessionAbsoluteSeconds = 24 * 60 * 60;
export const sessionRefreshSeconds = 5 * 60;

const configuredOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

export const allowedCorsOrigins = new Set(configuredOrigins);

export const isProduction = process.env.NODE_ENV === 'production';
export const secureCookies = process.env.AUTH_COOKIE_SECURE === 'true' || isProduction;

export function isAllowedOrigin(origin: string): boolean {
  return allowedCorsOrigins.has(origin);
}
