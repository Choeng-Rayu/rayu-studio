/** Public backend URL used by browser-only features such as the Web Bridge socket. */
export const API_BASE_URL =
  import.meta.env.VITE_RAYU_BACKEND_URL ||
  (import.meta.env.DEV ? 'http://localhost:4000/api' : 'https://api.rayucode.com/api');
