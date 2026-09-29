import { json, redirect, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import {
  appendAuthCookies,
  backendApiBase,
  clearLoginPairCookie,
  clearLoginStateCookie,
  readCookie,
  sessionCookies,
} from '~/lib/.server/rayu-auth';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const requestedPair = readCookie(request, 'rayu_login_pair') || '';
  const pair = /^[A-Za-z0-9_-]{20,80}$/.test(requestedPair) ? requestedPair : '';
  const invalid = () => {
    const headers = appendAuthCookies(new Headers({ 'Cache-Control': 'no-store' }), [
      clearLoginStateCookie(request),
      clearLoginPairCookie(request),
    ]);
    return json(
      { error: 'This sign-in link is invalid, expired, or already used. Please try signing in again.' },
      { status: 400, headers },
    );
  };

  if (!/^[A-Fa-f0-9]{64}$/.test(code) || !/^[A-Fa-f0-9]{64}$/.test(state)) {
    return invalid();
  }

  if (readCookie(request, 'rayu_login_state') !== state) {
    return invalid();
  }

  const base = backendApiBase(context.cloudflare?.env as unknown as Record<string, unknown>);

  if (!base) {
    return json({ error: 'Rayu Studio authentication is not configured yet.' }, { status: 503 });
  }

  try {
    const response = await fetch(`${base}/studio/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return invalid();
    }

    const tokens = (await response.json()) as {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
    };

    if (!tokens.accessToken || !tokens.refreshToken || !tokens.expiresAt) {
      return invalid();
    }

    const headers = appendAuthCookies(new Headers({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }), [
      ...sessionCookies(request, tokens as { accessToken: string; refreshToken: string; expiresAt: number }),
      clearLoginStateCookie(request),
      clearLoginPairCookie(request),
    ]);

    return redirect(pair ? `/remote?pair=${encodeURIComponent(pair)}` : '/', { headers });
  } catch {
    return json({ error: 'Rayu authentication is temporarily unavailable. Please try again.' }, { status: 503 });
  }
}

export default function AuthCallback() {
  const data = useLoaderData<typeof loader>();
  return (
    <main className="flex min-h-screen items-center justify-center bg-rayu-elements-background-depth-1 p-6 text-rayu-elements-textPrimary">
      <section className="max-w-lg rounded-xl border border-rayu-elements-borderColor bg-rayu-elements-background-depth-2 p-6">
        <h1 className="text-lg font-semibold">Could not finish sign-in</h1>
        <p className="mt-2 text-sm text-rayu-elements-textSecondary">{data.error}</p>
        <a className="mt-4 inline-flex text-accent hover:underline" href="/">
          Return to Rayu Studio
        </a>
      </section>
    </main>
  );
}
