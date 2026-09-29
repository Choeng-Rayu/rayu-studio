type RuntimeEnv = Record<string, unknown>;

/** The same backend origin is used for Studio login and its hosted catalog. */
export function backendApiBase(env?: RuntimeEnv): string {
  const nonBlank = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
  const configured = nonBlank(env?.RAYU_BACKEND_URL) || nonBlank(env?.RAYU_API_URL);
  const fromProcess =
    typeof process === 'undefined'
      ? undefined
      : nonBlank(process.env?.RAYU_BACKEND_URL) || nonBlank(process.env?.RAYU_API_URL);
  const base = (configured || fromProcess || 'https://api.rayucode.com/api').replace(/\/+$/, '');

  return base.endsWith('/api') ? base : `${base}/api`;
}
