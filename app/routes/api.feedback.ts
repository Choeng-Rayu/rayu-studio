import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { studioBackendSession } from '~/lib/.server/studio-backend';

const FEEDBACK_TYPES = ['bug', 'idea', 'other'] as const;
type FeedbackType = (typeof FEEDBACK_TYPES)[number];

const MAX_MESSAGE_LENGTH = 5000;

interface FeedbackInput {
  type?: unknown;
  message?: unknown;
  rating?: unknown;
}

/**
 * Files in-app feedback against the backend `/feedback` module.
 *
 * Unlike the deploy helpers, the feedback endpoint is NOT mounted under `/studio`,
 * so this route performs a direct bearer fetch with the session token rather than
 * going through `callStudioBackend` (whose `/studio/` prefix contract is left intact
 * for its other callers).
 */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const session = await studioBackendSession(request, context.cloudflare?.env as unknown as Record<string, unknown>);

  if (session instanceof Response) {
    return session;
  }

  const { headers } = session;

  let input: FeedbackInput;

  try {
    input = (await request.json()) as FeedbackInput;
  } catch {
    return json({ error: 'Invalid request body' }, { status: 400, headers });
  }

  if (!input || typeof input !== 'object') {
    return json({ error: 'Invalid request body' }, { status: 400, headers });
  }

  if (typeof input.type !== 'string' || !FEEDBACK_TYPES.includes(input.type as FeedbackType)) {
    return json({ error: 'Choose a feedback type: bug, idea, or other.' }, { status: 400, headers });
  }

  const message = typeof input.message === 'string' ? input.message.trim() : '';

  if (!message) {
    return json({ error: 'Enter a message before sending your feedback.' }, { status: 400, headers });
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return json({ error: `Feedback must be ${MAX_MESSAGE_LENGTH} characters or less.` }, { status: 400, headers });
  }

  let rating: number | undefined;

  if (input.rating !== undefined && input.rating !== null) {
    if (!Number.isInteger(input.rating) || (input.rating as number) < 1 || (input.rating as number) > 5) {
      return json({ error: 'Rating must be a whole number from 1 to 5.' }, { status: 400, headers });
    }

    rating = input.rating as number;
  }

  const body: { type: FeedbackType; message: string; source: 'studio'; rating?: number } = {
    type: input.type as FeedbackType,
    message,
    source: 'studio',
  };

  if (rating !== undefined) {
    body.rating = rating;
  }

  try {
    const response = await fetch(`${session.base}/feedback`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.auth.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      id?: number;
      message?: unknown;
      error?: unknown;
    } | null;

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return json(
          { error: 'Sign in to RayuCode to send feedback.', code: 'rayu_auth_required' },
          { status: 401, headers },
        );
      }

      const message = typeof payload?.message === 'string' ? payload.message : payload?.error;

      return json(
        { error: typeof message === 'string' ? message : `Feedback service request failed (${response.status}).` },
        { status: response.status, headers },
      );
    }

    return json({ ok: true, id: typeof payload?.id === 'number' ? payload.id : null }, { headers });
  } catch {
    return json(
      { error: 'Could not reach the feedback service. Check your network and retry.' },
      { status: 502, headers },
    );
  }
}
