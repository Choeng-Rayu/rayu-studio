import { startRayuSignIn } from '~/lib/rayu-auth.client';
import { studioHome } from './routes';

/** The access token stays in an HttpOnly cookie; expose it only in memory for Socket.IO. */
export async function getAccessToken(): Promise<string | null> {
  const response = await fetch('/api/auth/access-token', { cache: 'no-store' });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new StudioRequestError('Rayu sign-in is temporarily unavailable. Please try again.', response.status);
  }

  const payload = (await response.json()) as { accessToken?: string };

  return payload.accessToken || null;
}

export function redirectToSignIn(): void {
  void startRayuSignIn().catch((error) => console.error('Could not start Rayu sign-in', error));
}

export class StudioAuthError extends Error {
  constructor(message = 'Your Rayu session has expired. Please sign in again.') {
    super(message);
    this.name = 'StudioAuthError';
  }
}

export class StudioRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'StudioRequestError';
  }
}

export { studioHome };
