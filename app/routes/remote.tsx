import { ClientOnly } from 'remix-utils/client-only';
import { Header } from '~/components/header/Header';
import { RemotePage } from '~/components/remote/RemotePage';
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
