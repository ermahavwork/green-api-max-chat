import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, GreenApi, normalizePhone, poll, validateCredentials } from '../src/api';
import { applyNotification, emptyState, type ChatState } from '../src/model';

const credentials = {
  idInstance: '3100000000',
  apiTokenInstance: 'x'.repeat(32),
  apiUrl: 'https://3100.api.green-api.com',
};
const signal = () => new AbortController().signal;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const notification = (overrides: Record<string, unknown> = {}) => ({
  typeWebhook: 'incomingMessageReceived',
  idMessage: 'message-1',
  timestamp: 1700000000,
  senderData: { chatId: '123456@c.us', senderName: 'Мария' },
  messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет!' } },
  ...overrides,
});

afterEach(() => vi.useRealTimers());

describe('credentials and number validation', () => {
  it('accepts the official API host and v3 prefix and normalizes surrounding whitespace', () => {
    expect(validateCredentials({ ...credentials, idInstance: ' 3100000000 ', apiUrl: ' https://3100.api.green-api.com/v3/ ' }))
      .toEqual({ ...credentials, apiUrl: 'https://3100.api.green-api.com/v3' });
    expect(validateCredentials({ ...credentials, apiUrl: 'https://api.green-api.com/' }).apiUrl)
      .toBe('https://api.green-api.com');
  });

  it.each([
    'http://3100.api.green-api.com',
    'https://3100.api.green-api.com.evil.example',
    'https://evil.example/3100.api.green-api.com',
    'https://3100.api.green-api.com@evil.example',
    'https://user:pass@3100.api.green-api.com',
    'https://3100.api.green-api.com:8443',
    'https://3100.api.green-api.com/?token=secret',
    'https://3100.api.green-api.com/#token',
    'https://3100.api.green-api.com/redirect',
    'https://api.green-api.com.attacker.example/v3',
  ])('rejects unsafe API URL %s before any credentials are transmitted', (apiUrl) => {
    const transport = vi.fn();
    expect(() => new GreenApi({ ...credentials, apiUrl }, transport)).toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    ['+7 (999) 123-45-67', '79991234567'],
    ['8 (999) 123-45-67', '79991234567'],
    ['+375 (29) 123-45-67', '375291234567'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '123', '+1 212 555 0123', '79991234567@c.us', '7letters9991234567'])('rejects unsupported or ambiguous number %s', (input) => {
    expect(() => normalizePhone(input)).toThrow();
  });

  it('uses the canonical chatId returned by checkAccount, never inventing it from the phone', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json({ exist: true, chatId: 'opaque-max-user@c.us' }));
    const api = new GreenApi(credentials, transport);
    expect(await api.checkAccount('+7 (999) 123-45-67', signal())).toBe('opaque-max-user@c.us');
    const [url, options] = transport.mock.calls[0];
    expect(String(url)).toContain('/checkAccount/');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(options?.body as string)).toEqual({ phoneNumber: 79991234567 });
  });

  it.each([{ exist: false }, { exist: true }, { status: false }, { exist: true, chatId: '' }])('rejects unusable account lookup response %j', async (response) => {
    const api = new GreenApi(credentials, vi.fn<typeof fetch>().mockResolvedValue(json(response)));
    await expect(api.checkAccount('79991234567', signal())).rejects.toBeInstanceOf(ApiError);
  });
});

describe('API failures and sending', () => {
  it('sends the exact text and resolved chat id once', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json({ idMessage: 'server-message-7' }));
    const api = new GreenApi(credentials, transport);
    expect(await api.send('opaque-chat', 'Текст\nсообщения', signal())).toBe('server-message-7');
    expect(transport).toHaveBeenCalledTimes(1);
    const options = transport.mock.calls[0][1];
    expect(JSON.parse(options?.body as string)).toEqual({ chatId: 'opaque-chat', message: 'Текст\nсообщения' });
    expect(options?.referrerPolicy).toBe('no-referrer');
    expect(options?.cache).toBe('no-store');
  });

  it('never retries an ambiguous send after a transport error or exposes token-bearing fetch errors', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error(`Failed to fetch /${credentials.apiTokenInstance}`));
    const api = new GreenApi(credentials, transport);
    const error = await api.send('opaque-chat', 'Hello', signal()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as Error).message).toContain('Результат отправки может быть неизвестен');
    expect((error as Error).message).not.toContain(credentials.apiTokenInstance);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each(['', '   ', 'a'.repeat(4001)])('rejects invalid message locally', async (message) => {
    const transport = vi.fn<typeof fetch>();
    await expect(new GreenApi(credentials, transport).send('chat', message, signal())).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it('requires explicit authorization instead of accepting an unpaired instance', async () => {
    const api = new GreenApi(credentials, vi.fn<typeof fetch>().mockResolvedValue(json({ stateInstance: 'notAuthorized' })));
    await expect(api.authorize(signal())).rejects.toThrow('не авторизован');
  });

  it('does not treat an unsuccessful notification deletion as acknowledgment', async () => {
    const api = new GreenApi(credentials, vi.fn<typeof fetch>().mockResolvedValue(json({ result: false })));
    await expect(api.acknowledge(42, signal())).rejects.toThrow('не подтвердил обработку');
  });

  it('rejects a malformed queue entry without deleting it', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(json({ receiptId: '42', body: {} }));
    await expect(new GreenApi(credentials, transport).receive(signal())).rejects.toThrow('не удалено');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

describe('message reconciliation', () => {
  it('renders plain incoming text with sender, time and unread state', () => {
    const state = applyNotification(emptyState(), notification());
    expect(state.chats[0]).toMatchObject({ id: '123456@c.us', name: 'Мария', unread: 1 });
    expect(state.chats[0].messages[0]).toEqual({ id: 'message-1', text: 'Привет!', direction: 'in', timestamp: 1700000000000 });
  });

  it('renders extended text literally, without interpreting HTML', () => {
    const state = applyNotification(emptyState(), notification({
      messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: '<script>alert(1)</script>\nhttps://example.com' } },
    }), '123456@c.us');
    expect(state.chats[0].messages[0].text).toBe('<script>alert(1)</script>\nhttps://example.com');
    expect(state.chats[0].unread).toBe(0);
  });

  it('keeps a repeated queue event as one message and increments unread only once', () => {
    const first = applyNotification(emptyState(), notification());
    const second = applyNotification(first, notification());
    expect(second.chats[0].messages).toHaveLength(1);
    expect(second.chats[0].unread).toBe(1);
  });

  it('retains an early read status and never downgrades it on late delivery or failure events', () => {
    const status = (value: string) => ({ typeWebhook: 'outgoingMessageStatus', idMessage: 'message-1', status: value });
    let state = applyNotification(emptyState(), status('read'));
    state = applyNotification(state, notification({ typeWebhook: 'outgoingAPIMessageReceived' }));
    state = applyNotification(state, status('delivered'));
    state = applyNotification(state, status('failed'));
    expect(state.statuses['message-1']).toBe('read');
    expect(state.chats[0].messages[0]).toMatchObject({ direction: 'out', status: 'read' });
    expect(state.chats[0].unread).toBe(0);
  });

  it('ignores unsupported media and unrelated system notifications', () => {
    const state = emptyState();
    expect(applyNotification(state, notification({ messageData: { typeMessage: 'imageMessage', fileMessageData: {} } }))).toBe(state);
    expect(applyNotification(state, { typeWebhook: 'stateInstanceChanged', stateInstance: 'authorized' })).toBe(state);
  });
});

describe('sequential queue processing', () => {
  it('persists before deleting, retries failed acknowledgment and deduplicates the redelivery', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const events: string[] = [];
    let state: ChatState = emptyState();
    let finishAcknowledgment!: () => void;
    const receipt = { receiptId: 42, body: notification() };
    const api = {
      receive: vi.fn(async () => { events.push('receive'); return receipt; }),
      acknowledge: vi.fn()
        .mockImplementationOnce(async () => { events.push('ack-failed'); throw new ApiError('temporary'); })
        .mockImplementationOnce(async () => {
          events.push('ack-start');
          await new Promise<void>((resolve) => { finishAcknowledgment = resolve; });
          events.push('ack-end');
          controller.abort();
        }),
    };
    const running = poll(api, controller.signal, (body) => {
      state = applyNotification(state, body);
      events.push('persist');
    }, vi.fn());
    await vi.advanceTimersByTimeAsync(1000);
    expect(events).toEqual(['receive', 'persist', 'ack-failed', 'receive', 'persist', 'ack-start']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.receive).toHaveBeenCalledTimes(2);
    expect(state.chats[0].messages).toHaveLength(1);
    expect(state.chats[0].unread).toBe(1);
    finishAcknowledgment();
    await running;
    expect(api.acknowledge).toHaveBeenNthCalledWith(2, 42, controller.signal);
  });

  it('does not delete a notification when local persistence throws', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const api = {
      receive: vi.fn(async () => ({ receiptId: 5, body: notification() })),
      acknowledge: vi.fn(async () => {}),
    };
    const consume = vi.fn(() => { throw new Error('Storage quota exceeded'); });
    const running = poll(api, controller.signal, consume, vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(api.acknowledge).not.toHaveBeenCalled();
    controller.abort();
    await running;
  });

  it('stops polling invalid credentials instead of hammering the API', async () => {
    const api = { receive: vi.fn(async () => { throw new ApiError('Неверный токен', 401); }), acknowledge: vi.fn() };
    const status = vi.fn();
    await poll(api, signal(), vi.fn(), status);
    expect(api.receive).toHaveBeenCalledTimes(1);
    expect(api.acknowledge).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith('Неверный токен Переподключитесь.');
  });
});

describe('restored session state',()=>{
  it('resets malformed records and missing status map',async()=>{
    const {restoreState}=await import('../src/model');
    expect(restoreState('{broken')).toEqual(emptyState());
    expect(restoreState(JSON.stringify({chats:[]}))).toEqual(emptyState());
    expect(restoreState(JSON.stringify({chats:[{id:'c',name:'N',unread:0,messages:[{id:'m',text:'x',direction:'in',timestamp:'bad'}]}],statuses:{}}))).toEqual(emptyState());
  });
  it('restores a pending send as unknown instead of pretending it completed',async()=>{
    const {restoreState}=await import('../src/model');
    const result=restoreState(JSON.stringify({chats:[{id:'c',name:'N',unread:0,messages:[{id:'m',text:'x',direction:'out',timestamp:1,status:'pending'}]}],statuses:{}}));
    expect(result.chats[0].messages[0].status).toBe('unknown');
  });
});
