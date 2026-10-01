import { ClientOnly } from 'remix-utils/client-only';
import { Header } from '~/components/header/Header';

/*
 * `.client` keeps the whole remote UI (socket store, chat Markdown, and the Shiki
 * highlighters it pulls in) out of the server bundle. Remix ships every route in one
 * server module, so a browser-only import that fails at load time on workerd (Shiki's
 * top-level WASM compile) turns EVERY route into a 500, including /api/health.
 */
import { RemotePage } from '~/components/remote/RemotePage.client';
import BackgroundRays from '~/components/ui/BackgroundRays';

export const meta = () => [{ title: 'Remote control · Rayu Studio' }];

export default function RemoteRoute() {
  return (
    <div className="flex h-full w-full flex-col bg-rayu-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<div className="flex-1" />}>{() => <RemotePage />}</ClientOnly>
    </div>
  );
}
