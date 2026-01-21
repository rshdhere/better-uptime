// Shared constants that can be used by both client and server
// No Bun-specific APIs here

export const BACKEND_PORT = 8084;
export const BACKEND_URL_PRODUCTION = "https://uptique-server.raashed.xyz";
export const BACKEND_URL_DEVELOPMENT = "http://localhost:8084";
export const BACKEND_URL =
  process.env.NODE_ENV === "production"
    ? BACKEND_URL_PRODUCTION
    : BACKEND_URL_DEVELOPMENT;
export const FRONTEND_URL = "http://localhost:3000";

// GitHub OAuth URLs
export const GITHUB_OAUTH_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";
export const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
