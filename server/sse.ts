import type { Response } from 'express';

/** Minimal server-sent-events fan-out: every subscriber gets each published JSON frame. */
export class SseChannel<T> {
  private readonly clients = new Set<Response>();

  subscribe(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write(': connected\n\n');
    this.clients.add(res);
    // Keep proxies and browsers from closing an idle stream.
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    res.on('close', () => {
      clearInterval(ping);
      this.clients.delete(res);
    });
  }

  publish(data: T): void {
    const frame = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) client.write(frame);
  }

  get size(): number {
    return this.clients.size;
  }
}
