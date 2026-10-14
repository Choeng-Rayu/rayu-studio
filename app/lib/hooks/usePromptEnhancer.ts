import { useRef, useState } from 'react';
import { requireStudioAIConnection } from '~/components/deploy/StudioConnectionDialog';
import { AI_CONNECTIONS, isStudioDesktop } from '~/lib/studio-connections';
import { deploymentConnections } from '~/lib/stores/deploymentConnections';
import { toast } from 'react-toastify';
import type { ProviderInfo } from '~/types/model';

export function usePromptEnhancer() {
  const [enhancingPrompt, setEnhancingPrompt] = useState(false);
  const [promptEnhanced, setPromptEnhanced] = useState(false);
  const pending = useRef(false);

  const resetEnhancer = () => {
    setEnhancingPrompt(false);
    setPromptEnhanced(false);
  };

  const enhancePrompt = async (
    input: string,
    setInput: (value: string) => void,
    model: string,
    provider: ProviderInfo,
    apiKeys?: Record<string, string>,
  ) => {
    if (!input.trim()) {
      toast.info('Type a prompt before enhancing it.');
      return;
    }

    if (pending.current) {
      return;
    }

    pending.current = true;
    setEnhancingPrompt(true);
    setPromptEnhanced(false);

    const owner = deploymentConnections.get().userId;
    const kind = AI_CONNECTIONS[provider.name];
    const needsConnection =
      !isStudioDesktop() && kind && deploymentConnections.get().connections[kind]?.status !== 'connected';
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      if (!(await requireStudioAIConnection(provider.name))) {
        return;
      }

      if (needsConnection) {
        const models = await fetch(`/api/models/${encodeURIComponent(provider.name)}`, { cache: 'no-store' });

        if (!models.ok) {
          throw new Error('Models unavailable');
        }

        const result = (await models.json()) as { modelList: Array<{ name: string }> };
        model = result.modelList.find((item) => item.name === model)?.name || result.modelList[0]?.name;

        if (!model) {
          throw new Error('No available model');
        }
      }

      if (!isStudioDesktop() && owner !== null && owner !== deploymentConnections.get().userId) {
        throw new Error('Account changed');
      }

      const response = await fetch('/api/enhancer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input, model, provider, ...(isStudioDesktop() && apiKeys ? { apiKeys } : {}) }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Enhancement request failed');
      }

      reader = response.body.getReader();

      const decoder = new TextDecoder();
      let output = '';
      setInput('');

      while (true) {
        const { value, done } = await reader.read();

        if (!isStudioDesktop() && owner !== null && owner !== deploymentConnections.get().userId) {
          throw new Error('Account changed');
        }

        if (done) {
          break;
        }

        output += decoder.decode(value, { stream: true });
        setInput(output);
      }
      output += decoder.decode();

      if (!output.trim()) {
        throw new Error('Empty enhancement');
      }

      setInput(output);
      setPromptEnhanced(true);
    } catch {
      setInput(input);
      toast.error('Could not enhance your prompt. Check your sign-in, provider connection and model, then retry.');
    } finally {
      await reader?.cancel().catch(() => {
        // A failed stream may already be closed.
      });
      reader?.releaseLock();
      pending.current = false;
      setEnhancingPrompt(false);
    }
  };

  return { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer };
}
