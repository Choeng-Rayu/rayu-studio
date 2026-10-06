import type { WebContainer } from '@webcontainer/api';
import { WORK_DIR_NAME } from '~/utils/workspaceConstants';
import { cleanStackTrace } from '~/utils/stacktrace';

interface WebContainerContext {
  loaded: boolean;
}

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

interface WebContainerState {
  promise: Promise<WebContainer>;
  resolve: (container: WebContainer) => void;
  reject: (error: unknown) => void;
  started: boolean;
}

function createState(): WebContainerState {
  let resolve!: (container: WebContainer) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<WebContainer>((onReady, onError) => {
    resolve = onReady;
    reject = onError;
  });

  return { promise, resolve, reject, started: false };
}

const state: WebContainerState = import.meta.hot?.data.webcontainerState ?? createState();

if (import.meta.hot) {
  import.meta.hot.data.webcontainerState = state;
}

/** Existing consumers can await this promise without starting a browser-side Node runtime. */
export const webcontainer = state.promise;

/** Boot only when an artifact, terminal, Git import, or restored project needs it. */
export function startWebContainer(): Promise<WebContainer> {
  if (import.meta.env.SSR || state.started) {
    return state.promise;
  }

  state.started = true;
  void import('@webcontainer/api')
    .then((module) =>
      module.WebContainer.boot({
        coep: 'credentialless',
        workdirName: WORK_DIR_NAME,
        forwardPreviewErrors: true,
      }),
    )
    .then(async (container) => {
      webcontainerContext.loaded = true;

      const { workbenchStore } = await import('~/lib/stores/workbench');
      const response = await fetch('/inspector-script.js');
      await container.setPreviewScript(await response.text());

      container.on('preview-message', (message) => {
        if (message.type === 'PREVIEW_UNCAUGHT_EXCEPTION' || message.type === 'PREVIEW_UNHANDLED_REJECTION') {
          const isPromise = message.type === 'PREVIEW_UNHANDLED_REJECTION';
          workbenchStore.actionAlert.set({
            type: 'preview',
            title: isPromise ? 'Unhandled Promise Rejection' : 'Uncaught Exception',
            description: 'message' in message ? message.message : 'Unknown error',
            content: `Error occurred at ${message.pathname}${message.search}${message.hash}\nPort: ${message.port}\n\nStack trace:\n${cleanStackTrace(message.stack || '')}`,
            source: 'preview',
          });
        }
      });

      state.resolve(container);
    })
    .catch(state.reject);

  return state.promise;
}
