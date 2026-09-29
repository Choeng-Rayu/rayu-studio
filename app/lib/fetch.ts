type CommonRequest = Omit<RequestInit, 'body'> & { body?: URLSearchParams };

export async function request(url: string, init?: CommonRequest) {
  if (import.meta.env.DEV) {
    const nodeFetch = await import('node-fetch');

    /*
     * Keep TLS certificate verification enabled in development as well as in
     * production. Local services that use a private CA should trust that CA
     * explicitly rather than disabling verification for every HTTPS request.
     */
    return nodeFetch.default(url, init);
  }

  return fetch(url, init);
}
