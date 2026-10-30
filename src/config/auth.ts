export const sessionCookieName = process.env.AUTH_COOKIE_NAME ?? 'osgestor_session';
export const sessionIdleSeconds = 8 * 60 * 60;
export const sessionAbsoluteSeconds = 24 * 60 * 60;
export const sessionRefreshSeconds = 5 * 60;

type CookieEnvironment = {
  NODE_ENV?: string;
  AUTH_COOKIE_SECURE?: string;
  AUTH_COOKIE_NAME?: string;
  DOCKER_RESTORE_LOCAL?: string;
  DB_NAME?: string;
  CORS_ORIGINS?: string;
};

const configuredOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

export const allowedCorsOrigins = new Set(configuredOrigins);

export const isProduction = process.env.NODE_ENV === 'production';

export function isLocalRestoreEnvironment(environment: CookieEnvironment = process.env): boolean {
  const origins = (environment.CORS_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean);
  return environment.NODE_ENV === 'production'
    && environment.DOCKER_RESTORE_LOCAL === 'true'
    && environment.AUTH_COOKIE_SECURE === 'false'
    && environment.AUTH_COOKIE_NAME === 'osgestor_restore_session'
    && environment.DB_NAME === 'osgestor_restore_test'
    && origins.length === 1
    && origins[0] === 'http://127.0.0.1:8081';
}

export function resolveSecureCookies(environment: CookieEnvironment = process.env): boolean {
  if (isLocalRestoreEnvironment(environment)) return false;
  if (environment.NODE_ENV === 'production') return true;
  return environment.AUTH_COOKIE_SECURE === 'true';
}

export const secureCookies = resolveSecureCookies();

export function isAllowedOrigin(origin: string): boolean {
  return allowedCorsOrigins.has(origin);
}
