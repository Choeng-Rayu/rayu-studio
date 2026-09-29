/**
 * Studio currently uses an Anthropic SDK whose response schema only accepts
 * text and tool_use content blocks. The Rayu gateway also emits Anthropic
 * thinking blocks. Keep the gateway's response intact for newer clients and
 * remove only those unsupported blocks at Studio's SDK boundary.
 */
function isUnsupportedBlock(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const type = (value as { type?: unknown }).type;

  return type === 'thinking' || type === 'redacted_thinking';
}

function compatibleHeaders(response: Response): Headers {
  const headers = new Headers(response.headers);

  // The transformed body no longer has the upstream byte length/encoding.
  headers.delete('content-length');
  headers.delete('content-encoding');

  return headers;
}

function shouldDropEvent(frame: string, hiddenIndexes: Set<number>): boolean {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');

  if (!data || data === '[DONE]') {
    return false;
  }

  let event: Record<string, unknown>;

  try {
    event = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return false;
  }

  const index = typeof event.index === 'number' ? event.index : undefined;

  if (event.type === 'content_block_start' && index !== undefined && isUnsupportedBlock(event.content_block)) {
    hiddenIndexes.add(index);
    return true;
  }

  if (event.type === 'content_block_delta') {
    const deltaType = (event.delta as { type?: unknown } | undefined)?.type;
    return (
      (index !== undefined && hiddenIndexes.has(index)) ||
      deltaType === 'thinking_delta' ||
      deltaType === 'signature_delta'
    );
  }

  if (event.type === 'content_block_stop' && index !== undefined && hiddenIndexes.has(index)) {
    hiddenIndexes.delete(index);
    return true;
  }

  return false;
}

function compatibleEventStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const hiddenIndexes = new Set<number>();
  let pending = '';

  const emitCompleteFrames = (controller: TransformStreamDefaultController<Uint8Array>) => {
    let boundary = /\r?\n\r?\n/.exec(pending);

    while (boundary) {
      const frame = pending.slice(0, boundary.index);
      pending = pending.slice(boundary.index + boundary[0].length);

      if (!shouldDropEvent(frame, hiddenIndexes)) {
        controller.enqueue(encoder.encode(frame + boundary[0]));
      }

      boundary = /\r?\n\r?\n/.exec(pending);
    }
  };

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true });
        emitCompleteFrames(controller);
      },
      flush(controller) {
        pending += decoder.decode();
        emitCompleteFrames(controller);

        if (pending && !shouldDropEvent(pending, hiddenIndexes)) {
          controller.enqueue(encoder.encode(pending));
        }
      },
    }),
  );
}

export async function compatibleRayuAnthropicResponse(response: Response): Promise<Response> {
  if (!response.ok || !response.body) {
    return response;
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('text/event-stream')) {
    return new Response(compatibleEventStream(response.body), {
      status: response.status,
      statusText: response.statusText,
      headers: compatibleHeaders(response),
    });
  }

  if (contentType.includes('application/json')) {
    let payload: { content?: unknown };

    try {
      payload = (await response.clone().json()) as { content?: unknown };
    } catch {
      return response;
    }

    if (!payload || !Array.isArray(payload.content)) {
      return response;
    }

    const content = payload.content.filter((block) => !isUnsupportedBlock(block));

    if (content.length === payload.content.length) {
      return response;
    }

    return new Response(JSON.stringify({ ...payload, content }), {
      status: response.status,
      statusText: response.statusText,
      headers: compatibleHeaders(response),
    });
  }

  return response;
}
