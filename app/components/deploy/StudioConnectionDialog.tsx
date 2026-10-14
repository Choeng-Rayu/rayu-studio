import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { StudioConnectionSettings } from './StudioConnectionSettings';
import { AI_CONNECTIONS, isStudioDesktop } from '~/lib/studio-connections';
import { deploymentConnections, refreshDeploymentConnections } from '~/lib/stores/deploymentConnections';

interface ConnectionRequest {
  provider: string;
  owner: number | null;
  done: (connected: boolean) => void;
}

/** Suspend one caller without replaying its operation or retaining credentials. */
export function requestStudioConnection(provider: string): Promise<boolean> {
  return new Promise((done) =>
    window.dispatchEvent(
      new CustomEvent<ConnectionRequest>('studio-connect', {
        detail: { provider, owner: deploymentConnections.get().userId, done },
      }),
    ),
  );
}

/** Shared by generation and prompt enhancement; Rayu Auth/local endpoints need no saved key. */
export async function requireStudioAIConnection(providerName: string) {
  const kind = AI_CONNECTIONS[providerName];

  if (isStudioDesktop() || !kind) {
    return true;
  }

  if (deploymentConnections.get().status !== 'ready') {
    await refreshDeploymentConnections();
  }

  const state = deploymentConnections.get();

  if (
    state.catalog?.find((item) => item.kind === kind)?.enabled !== false &&
    state.connections[kind]?.status === 'connected'
  ) {
    return true;
  }

  return requestStudioConnection(kind);
}

export function StudioConnectionDialog() {
  const [provider, setProvider] = useState<string | null>(null);
  const pending = useRef<ConnectionRequest | null>(null);
  const finish = (connected: boolean) => {
    const operation = pending.current;
    pending.current = null;
    setProvider(null);
    operation?.done(connected && (operation.owner === null || operation.owner === deploymentConnections.get().userId));
  };
  useEffect(() => {
    if (isStudioDesktop()) {
      return undefined;
    }

    const receive = (event: Event) => {
      const operation = (event as CustomEvent<ConnectionRequest>).detail;
      pending.current?.done(false);
      pending.current = operation;
      setProvider(operation.provider);
    };
    window.addEventListener('studio-connect', receive);

    return () => {
      window.removeEventListener('studio-connect', receive);
      pending.current?.done(false);
      pending.current = null;
    };
  }, []);

  return (
    <DialogRoot
      open={provider !== null}
      onOpenChange={(open) => {
        if (!open) {
          finish(false);
        }
      }}
    >
      {provider && (
        <Dialog onClose={() => finish(false)} className="max-w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
          <div className="p-6 space-y-3">
            <DialogTitle>Connect {provider}</DialogTitle>
            <StudioConnectionSettings provider={provider} onContinue={() => finish(true)} />
          </div>
        </Dialog>
      )}
    </DialogRoot>
  );
}
