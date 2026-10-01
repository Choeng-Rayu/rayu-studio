import { type LoaderFunction } from '@remix-run/cloudflare';

const DEFAULT_EDITOR_ORIGIN = 'https://stackblitz.com';

/**
 * Only an http(s) ORIGIN is accepted. The value used to be pasted verbatim into the
 * inline script below, so `?editorOrigin=';...` ran attacker JavaScript on Studio's
 * origin, where it could read the Rayu access token from /api/auth/access-token.
 */
function editorOriginFrom(value: string | null): string {
  if (!value) {
    return DEFAULT_EDITOR_ORIGIN;
  }

  try {
    const url = new URL(value);

    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : DEFAULT_EDITOR_ORIGIN;
  } catch {
    return DEFAULT_EDITOR_ORIGIN;
  }
}

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const editorOrigin = editorOriginFrom(url.searchParams.get('editorOrigin'));

  // A JSON string literal, with `<` escaped so the value can never close the script tag.
  const editorOriginLiteral = JSON.stringify(editorOrigin).replace(/</g, '\\u003c');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Connect to WebContainer</title>
      </head>
      <body>
        <script type="module">
          (async () => {
            const { setupConnect } = await import('https://cdn.jsdelivr.net/npm/@webcontainer/api@latest/dist/connect.js');
            setupConnect({
              editorOrigin: ${editorOriginLiteral}
            });
          })();
        </script>
      </body>
    </html>
  `;

  return new Response(htmlContent, {
    headers: { 'Content-Type': 'text/html' },
  });
};
