import { isStudioDesktop } from '~/lib/studio-connections';

/** Provider SDK errors may contain request bodies or authorization headers. */
export function studioErrorText(error: unknown) {
  if (isStudioDesktop()) {
    return error instanceof Error ? error.message : 'An unexpected error occurred';
  }

  return 'Provider request failed. Check your account connection, model access and provider limits, then retry.';
}
