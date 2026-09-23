import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SseChannel } from './sse';

function fakeResponse() {
  let closeCallback: (() => void) | undefined;
  const res = {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'close') closeCallback = cb;
    }),
  };
  return { res: res as unknown as Response, triggerClose: () => closeCallback?.() };
}

describe('SseChannel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes a client: sets SSE headers, flushes, sends the connected frame and grows size', () => {
    const channel = new SseChannel<{ a: number }>();
    const { res } = fakeResponse();

    channel.subscribe(res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.flushHeaders).toHaveBeenCalled();
    expect(res.write).toHaveBeenCalledWith(': connected\n\n');
    expect(channel.size).toBe(1);
  });

  it('publishes a JSON frame to every subscriber', () => {
    const channel = new SseChannel<{ a: number }>();
    const { res } = fakeResponse();
    channel.subscribe(res);

    channel.publish({ a: 1 });

    expect(res.write).toHaveBeenCalledWith('data: {"a":1}\n\n');
  });

  it('removes a client on close so size drops and it no longer receives publishes', () => {
    const channel = new SseChannel<{ a: number }>();
    const { res, triggerClose } = fakeResponse();
    channel.subscribe(res);

    triggerClose();

    expect(channel.size).toBe(0);

    channel.publish({ a: 1 });
    expect(res.write).not.toHaveBeenCalledWith('data: {"a":1}\n\n');
  });
});
