/**
 * Persistent login lifetime — cookie maxAge hint only; the backend's Session
 * documents (REFRESH_TOKEN_TTL_DAYS, same env var) are the real source of
 * truth for when a refresh token stops working. Rolling: every successful
 * refresh re-issues a session this many days out again, so an actively-used
 * account never actually hits the ceiling — it only matters after real
 * inactivity. Access tokens remain short-lived and rotate independently.
 */
const DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 90;
export const PERSISTENT_SESSION_SECONDS = 60 * 60 * 24 * DAYS;
export const PROACTIVE_REFRESH_SECONDS = Number(process.env.AUTH_PROACTIVE_REFRESH_SECONDS) || 60;
