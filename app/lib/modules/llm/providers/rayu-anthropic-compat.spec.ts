import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateText, streamText } from 'ai';
import { compatibleRayuAnthropicResponse } from './rayu-anthropic-compat';
import { rayuModelInstance } from './rayu-provider-utils';

afterEach(() => vi.unstubAllGlobals());

const model = () =>
  rayuModelInstance('model-a', 'session-token', {
    RAYU_GATEWAY_URL: 'https://gateway.rayucode.com',
  });

describe('Rayu Anthropic compatibility', () => {
  it('lets the installed Anthropic SDK parse a JSON completion with a thinking block', async () => {
    const upstream = Response.json({
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'model-a',
      content: [
        { type: 'thinking', thinking: 'private reasoning', signature: '' },
        { type: 'text', text: 'Hello from Rayu' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 3, output_tokens: 5 },
    });
    const fetchSpy = vi.fn().mockResolvedValue(upstream);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await generateText({ model: model(), prompt: 'Hi', maxTokens: 64 });
    expect(result.text).toBe('Hello from Rayu');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('filters split thinking SSE frames while preserving text streaming', async () => {
    const event = (type: string, value: object) => `event: ${type}\ndata: ${JSON.stringify(value)}\n\n`;
    const sse = [
      event('message_start', { type: 'message_start', message: { usage: { input_tokens: 3, output_tokens: 0 } } }),
      event('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '' },
      }),
      event('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'private reasoning' },
      }),
      event('content_block_stop', { type: 'content_block_stop', index: 0 }),
      event('content_block_start', {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'text', text: '' },
      }),
      event('content_block_delta', {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'text_delta', text: 'Hello from Rayu' },
      }),
      event('content_block_stop', { type: 'content_block_stop', index: 1 }),
      event('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 5 },
      }),
      event('message_stop', { type: 'message_stop' }),
    ].join('');
    const bytes = new TextEncoder().encode(sse);
    const upstream = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          // Split mid-frame to exercise the incremental parser.
          controller.enqueue(bytes.slice(0, 69));
          controller.enqueue(bytes.slice(69, 173));
          controller.enqueue(bytes.slice(173));
          controller.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream', 'content-length': String(bytes.length) } },
    );

    const compatible = await compatibleRayuAnthropicResponse(upstream);
    const body = await compatible.text();
    expect(body).not.toContain('thinking');
    expect(body).toContain('Hello from Rayu');
    expect(compatible.headers.has('content-length')).toBe(false);

    const fetchSpy = vi.fn().mockResolvedValue(new Response(sse, { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetchSpy);

    const result = streamText({ model: model(), prompt: 'Hi', maxTokens: 64 });
    let streamedText = '';

    for await (const delta of result.textStream) {
      streamedText += delta;
    }
    expect(streamedText).toBe('Hello from Rayu');
  });
});
