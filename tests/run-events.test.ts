import { Readable } from 'node:stream';
import { WhizuraiClient, WhizuraiError, NotFoundError } from '../src/index';
import { SseParser } from '../src/sse';

jest.mock('axios');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const axios = require('axios');

const mockHttp = {
  defaults: { baseURL: 'http://localhost:3000' },
  interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};
axios.create.mockReturnValue(mockHttp);

/** An SSE body delivered in awkward pieces, as a socket would. */
function body(text: string, pieceSize = 7) {
  const pieces: Buffer[] = [];
  for (let i = 0; i < text.length; i += pieceSize) pieces.push(Buffer.from(text.slice(i, i + pieceSize)));
  return { data: Readable.from(pieces) };
}
const chunk = (seq: number, chunks: unknown[]) => `id: ${seq}\nevent: chunk\ndata: ${JSON.stringify({ seq, chunks })}\n\n`;
const end = (status: string) => `event: end\ndata: ${JSON.stringify({ status })}\n\n`;

async function collect(iter: AsyncIterable<unknown>) {
  const out: unknown[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

beforeEach(() => mockHttp.get.mockReset());

describe('SseParser', () => {
  it('assembles events split across pieces, ignores comments, keeps id and multi-line data', () => {
    const p = new SseParser();
    const events = [
      ...p.push(': keep-alive\r\nid: 4\r\nevent: chunk\r\ndata: {"a":'),
      ...p.push('1}\r\ndata: second\r'),
      ...p.push('\n\r\n'),
    ];
    expect(events).toEqual([{ event: 'chunk', id: '4', data: '{"a":1}\nsecond' }]);
  });
});

describe('capabilities.runEvents', () => {
  const client = () => new WhizuraiClient({ apiKey: 'sk_test', baseUrl: 'http://localhost:3000' });

  it('streams chunks in order and stops at the end event', async () => {
    mockHttp.get.mockResolvedValueOnce(body(
      chunk(0, [{ type: 'coding_progress', text: 'reading' }]) +
      chunk(1, [{ type: 'coding_file', path: 'index.html', sha256: 'ab', size: 2, base64: 'aGk=' }]) +
      end('succeeded'),
    ));
    const events = await collect(client().capabilities.runEvents('cr1'));
    expect(events).toEqual([
      { type: 'chunk', seq: 0, chunks: [{ type: 'coding_progress', text: 'reading' }] },
      { type: 'chunk', seq: 1, chunks: [{ type: 'coding_file', path: 'index.html', sha256: 'ab', size: 2, base64: 'aGk=' }] },
      { type: 'end', status: 'succeeded' },
    ]);
    const [url, cfg] = mockHttp.get.mock.calls[0];
    expect(url).toBe('/v1/capabilities/capability-runs/cr1/events');
    expect(cfg.responseType).toBe('stream');
    expect(cfg.headers['Last-Event-ID']).toBeUndefined();
  });

  it('resumes after a dropped connection from the last sequence, without duplicates', async () => {
    mockHttp.get
      .mockResolvedValueOnce(body(chunk(0, ['a']) + chunk(1, ['b']))) // closes with no end event
      .mockResolvedValueOnce(body(chunk(1, ['b']) + chunk(2, ['c']) + end('succeeded')));
    jest.useFakeTimers({ advanceTimers: true });
    const events = await collect(client().capabilities.runEvents('cr1'));
    jest.useRealTimers();
    expect(events.map((e: any) => (e.type === 'chunk' ? e.seq : e.status))).toEqual([0, 1, 2, 'succeeded']);
    const [, second] = mockHttp.get.mock.calls[1];
    expect(second.headers['Last-Event-ID']).toBe('1');
    expect(second.params).toEqual({ after: 1 });
  });

  it('does not retry a definitive refusal', async () => {
    mockHttp.get.mockRejectedValueOnce(new NotFoundError('Resource not found', 'HTTP_404', 404));
    await expect(collect(client().capabilities.runEvents('nope'))).rejects.toThrow(NotFoundError);
    expect(mockHttp.get).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxReconnects on repeated server errors', async () => {
    mockHttp.get.mockRejectedValue(new WhizuraiError('bad gateway', 'HTTP_502', 502));
    jest.useFakeTimers({ advanceTimers: true });
    await expect(collect(client().capabilities.runEvents('cr1', { maxReconnects: 2 }))).rejects.toThrow('bad gateway');
    jest.useRealTimers();
    expect(mockHttp.get).toHaveBeenCalledTimes(3);
  });

  it('starts after a given sequence', async () => {
    mockHttp.get.mockResolvedValueOnce(body(chunk(5, ['x']) + end('failed')));
    const events = await collect(client().capabilities.runEvents('cr1', { after: 4 }));
    expect(events).toEqual([{ type: 'chunk', seq: 5, chunks: ['x'] }, { type: 'end', status: 'failed' }]);
    expect(mockHttp.get.mock.calls[0][1].headers['Last-Event-ID']).toBe('4');
  });
});
