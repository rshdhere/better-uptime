// Shared constants that can be used by both client and server
// No Bun-specific APIs here

export const BACKEND_PORT = 8084;
export const BACKEND_URL_PRODUCTION = "https://uptique-server.raashed.xyz";
export const BACKEND_URL_DEVELOPMENT = "http://localhost:8084";
export const BACKEND_URL =
  process.env.NODE_ENV === "production"
    ? BACKEND_URL_PRODUCTION
    : BACKEND_URL_DEVELOPMENT;

export const FRONTEND_URL_PRODUCTION = "https://uptique.raashed.xyz";
export const FRONTEND_URL_DEVELOPMENT = "http://localhost:3000";
export const FRONTEND_URL =
  process.env.NODE_ENV === "production"
    ? FRONTEND_URL_PRODUCTION
    : FRONTEND_URL_DEVELOPMENT;

export const APP_HOST_PRODUCTION = "uptique.raashed.xyz";
export const API_HOST_PRODUCTION = "uptique-server.raashed.xyz";
export const STATUS_PAGE_CNAME_TARGET_PRODUCTION = "status.raashed.xyz";
export const STATUS_PAGE_CNAME_TARGET_DEVELOPMENT = "localhost";
export const STATUS_PAGE_CNAME_TARGET =
  process.env.STATUS_PAGE_CNAME_TARGET ||
  (process.env.NODE_ENV === "production"
    ? STATUS_PAGE_CNAME_TARGET_PRODUCTION
    : STATUS_PAGE_CNAME_TARGET_DEVELOPMENT);
export const STATUS_PAGE_VERIFY_TXT_PREFIX =
  process.env.STATUS_PAGE_VERIFY_TXT_PREFIX || "_uptique-verify";

// CORS allowed origins for the backend
export const CORS_ALLOWED_ORIGINS = [
  FRONTEND_URL_DEVELOPMENT,
  FRONTEND_URL_PRODUCTION,
];

// GitHub OAuth URLs
export const GITHUB_OAUTH_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";
export const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
