/**
 * Minimal Server-Sent Events parser (WHATWG event-stream format).
 *
 * Feed it decoded text in arbitrary pieces; it yields complete events. Only
 * `event`, `data` and `id` fields are kept; comments (`:` lines, used as
 * keep-alives) and `retry` are ignored.
 */
export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

export class SseParser {
  private buffer = '';
  private eventName = '';
  private data: string[] = [];
  private id: string | undefined;

  /** Returns every event completed by this piece of text. */
  push(text: string): SseEvent[] {
    this.buffer += text;
    const events: SseEvent[] = [];
    // Lines end with \n, \r\n or \r.
    for (;;) {
      const match = /\r\n|\r|\n/.exec(this.buffer);
      if (!match) break;
      // A lone trailing \r may be the first half of \r\n: wait for more text.
      if (match[0] === '\r' && match.index === this.buffer.length - 1) break;
      const line = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const event = this.line(line);
      if (event) events.push(event);
    }
    return events;
  }

  private line(line: string): SseEvent | null {
    if (line === '') {
      if (this.data.length === 0) {
        this.eventName = '';
        return null;
      }
      const event: SseEvent = { event: this.eventName || 'message', data: this.data.join('\n') };
      if (this.id !== undefined) event.id = this.id;
      this.eventName = '';
      this.data = [];
      return event;
    }
    if (line.startsWith(':')) return null;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') this.eventName = value;
    else if (field === 'data') this.data.push(value);
    else if (field === 'id' && !value.includes('\0')) this.id = value;
    return null;
  }
}
