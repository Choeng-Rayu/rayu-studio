import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { isStreaming, streamingContent, streamingThinking } from '~/lib/webBridge/webBridgeStore';

/**
 * The in-flight turn.
 *
 * PLAIN PREFORMATTED TEXT, DELIBERATELY. A markdown or syntax-highlighting pass on
 * every delta would re-parse the whole accumulated answer per token: at a few hundred
 * tokens that is visible jank, and a half-written fenced block renders as garbage that
 * flickers into shape. The finished message is what gets rendered richly — see
 * `RemoteChat` — and this is the live tail.
 *
 * `aria-live="polite"` with `aria-atomic="false"` so a screen reader reads the new
 * text as it arrives instead of re-reading the whole answer on every token.
 */
export function RemoteStreamMessage(): React.JSX.Element | null {
  const streaming = useStore(isStreaming);
  const content = useStore(streamingContent);
  const thinking = useStore(streamingThinking);

  if (!streaming && !content && !thinking) {
    return null;
  }

  return (
    <div className="space-y-2">
      {thinking && (
        <details className="rounded-lg border border-rayu-elements-borderColor bg-rayu-elements-background-depth-2">
          <summary className="cursor-pointer px-3 py-2 text-xs text-rayu-elements-textSecondary select-none">
            <span aria-hidden="true" className="i-ph:brain-duotone mr-1 align-[-2px]" />
            Thinking
          </summary>
          <pre className="px-3 pb-3 text-xs font-mono text-rayu-elements-textTertiary whitespace-pre-wrap break-words">
            {thinking}
          </pre>
        </details>
      )}

      <div
        aria-live="polite"
        aria-atomic="false"
        className={classNames(
          'rounded-lg px-3 py-2 text-sm',
          'bg-rayu-elements-background-depth-2 border border-rayu-elements-borderColor',
          'text-rayu-elements-textPrimary whitespace-pre-wrap break-words font-mono',
        )}
      >
        {content}
        {streaming && (
          <span
            aria-label="Responding"
            className="inline-block w-[2px] h-4 ml-0.5 align-[-2px] bg-rayu-elements-textPrimary animate-pulse"
          />
        )}
      </div>
    </div>
  );
}
