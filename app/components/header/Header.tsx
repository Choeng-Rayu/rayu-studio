import { useStore } from '@nanostores/react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { StudioAuthControl } from './StudioAuthControl.client';

export function Header() {
  const chat = useStore(chatStore);

  return (
    <header
      className={classNames('flex items-center px-4 border-b h-[var(--header-height)]', {
        'border-transparent': !chat.started,
        'border-rayu-elements-borderColor': chat.started,
      })}
    >
      <div className="flex items-center gap-2 z-logo text-rayu-elements-textPrimary cursor-pointer">
        <div className="i-ph:sidebar-simple-duotone text-xl" />
        <a href="/" className="flex items-center">
          <img src="/rayucode-logo-mark.png" alt="RayuCode" className="h-9 w-auto" />
        </a>
      </div>
      {chat.started && ( // Display ChatDescription and HeaderActionButtons only when the chat has started.
        <>
          <span className="flex-1 px-4 truncate text-center text-rayu-elements-textPrimary">
            <ClientOnly>{() => <ChatDescription />}</ClientOnly>
          </span>
          <ClientOnly>
            {() => (
              <div className="">
                <HeaderActionButtons chatStarted={chat.started} />
              </div>
            )}
          </ClientOnly>
        </>
      )}
      <div className="ml-auto flex items-center gap-2 pl-3">
        <a
          href="/remote"
          className="rounded-md border border-rayu-elements-borderColor px-3 py-1.5 text-xs text-rayu-elements-textPrimary hover:bg-rayu-elements-background-depth-2"
        >
          Remote
        </a>
        <ClientOnly>{() => <StudioAuthControl />}</ClientOnly>
      </div>
    </header>
  );
}
