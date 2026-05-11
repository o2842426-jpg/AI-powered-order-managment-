/**
 * Base URL for API calls.
 * - Dev: leave VITE_API_URL unset and use Vite proxy (/api -> localhost:4000).
 * - Prod: set VITE_API_URL to your API origin, e.g. https://api.example.com/api
 */
export function getApiBase() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\/$/, '');
  }
  return '';
}

export function apiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
