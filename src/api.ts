export interface Credentials { idInstance: string; apiTokenInstance: string; apiUrl: string }
export interface Notification { receiptId: number; body: Record<string, unknown> }
export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); this.name = 'ApiError'; }
}
export function normalizePhone(value: string): string {
  if (!/^[+\d\s()-]+$/.test(value)) throw new Error('Введите номер телефона с кодом страны.');
  let phone = value.replace(/\D/g, '');
  if (phone.length === 11 && phone[0] === '8') phone = '7' + phone.slice(1);
  if (!/^(7\d{10}|375\d{9})$/.test(phone)) throw new Error('Нужен номер России (+7) или Беларуси (+375), как требует MAX API.');
  return phone;
}
export function validateCredentials(input: Credentials): Credentials {
  const idInstance = input.idInstance.trim(), apiTokenInstance = input.apiTokenInstance.trim();
  if (!/^\d{4,20}$/.test(idInstance)) throw new Error('Проверьте idInstance: нужны цифры из кабинета GREEN-API.');
  if (!/^[a-zA-Z0-9_-]{8,256}$/.test(apiTokenInstance)) throw new Error('Проверьте apiTokenInstance из кабинета GREEN-API.');
  let url: URL;
  try { url = new URL(input.apiUrl.trim()); } catch { throw new Error('Укажите API URL из кабинета GREEN-API.'); }
  if (url.protocol !== 'https:' || !/^(?:\d+\.api\.green-api\.com|api\.green-api\.com)$/.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !/^\/(?:v3\/?)?$/.test(url.pathname)) {
    throw new Error('Разрешён только HTTPS-адрес API GREEN-API, например https://3100.api.green-api.com.');
  }
  return { idInstance, apiTokenInstance, apiUrl: url.href.replace(/\/$/, '') };
}
const errors: Record<number,string> = {
  400: 'Проверьте параметры запроса и настройки HTTP API: webhookUrl должен быть пустым.',
  401: 'Неверный токен. Выйдите и проверьте данные инстанса.',
  403: 'Доступ запрещён. Проверьте API URL, idInstance и ограничения аккаунта.',
  404: 'Инстанс или метод не найден. Проверьте API URL и idInstance.',
  429: 'Слишком много запросов. Подождите перед повторной попыткой.',
  469: 'Достигнут лимит проверки номеров. Попробуйте позже.'
};
export class GreenApi {
  readonly credentials: Credentials;
  constructor(input: Credentials, private transport: typeof fetch = (...args) => fetch(...args)) { this.credentials = validateCredentials(input); }
  private async request<T>(method: string, verb: string, signal: AbortSignal, body?: unknown, suffix = '', query = ''): Promise<T> {
    const {apiUrl,idInstance,apiTokenInstance} = this.credentials;
    const url = `${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}${suffix}${query}`;
    let response: Response;
    try {
      response = await this.transport(url, { method: verb, signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]), referrerPolicy:'no-referrer', cache:'no-store', ...(body === undefined ? {} : { headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) }) });
    } catch {
      if (signal.aborted) throw new DOMException('Операция отменена', 'AbortError');
      throw new ApiError('Нет ответа от сервера. Проверьте интернет и API URL. Результат отправки может быть неизвестен.');
    }
    if (!response.ok) throw new ApiError(errors[response.status] ?? `Ошибка сервиса (${response.status}). Попробуйте позже.`, response.status);
    try { return await response.json() as T; } catch { throw new ApiError('Сервер вернул некорректный ответ.'); }
  }
  async authorize(signal: AbortSignal) {
    const result = await this.request<{stateInstance: string}>('getStateInstance','GET',signal);
    if (result.stateInstance !== 'authorized') throw new ApiError('Инстанс не авторизован в MAX. Подключите его в кабинете GREEN-API и повторите вход.');
  }
  async checkAccount(phone: string, signal: AbortSignal): Promise<string> {
    const result = await this.request<{exist?:boolean;chatId?:string;status?:boolean}>('checkAccount','POST',signal,{phoneNumber:Number(normalizePhone(phone))});
    if (result.status === false) throw new ApiError('Проверка номера недоступна. Проверьте состояние инстанса и лимиты в кабинете.');
    if (result.exist === false) throw new ApiError('Этот номер не найден в MAX.');
    if (result.exist !== true || typeof result.chatId !== 'string' || !result.chatId) throw new ApiError('API не вернул идентификатор чата.');
    return result.chatId;
  }
  async send(chatId: string, message: string, signal: AbortSignal): Promise<string> {
    if (!message.trim() || message.length > 4000) throw new ApiError('Сообщение должно содержать от 1 до 4000 символов.');
    const result = await this.request<{idMessage:string}>('sendMessage','POST',signal,{chatId,message});
    if (typeof result.idMessage !== 'string' || !result.idMessage) throw new ApiError('API не подтвердил отправку. Перед повтором проверьте переписку в MAX.');
    return result.idMessage;
  }
  async receive(signal: AbortSignal): Promise<Notification|null> {
    const result = await this.request<Notification|null>('receiveNotification','GET',signal,undefined,'','?receiveTimeout=20');
    if (result !== null && (!Number.isSafeInteger(result.receiptId) || !result.body || typeof result.body !== 'object')) throw new ApiError('Некорректное уведомление API. Оно не удалено из очереди.');
    return result;
  }
  async acknowledge(receiptId: number, signal: AbortSignal) {
    const result = await this.request<{result:boolean}>('deleteNotification','DELETE',signal,undefined,`/${receiptId}`);
    if (result.result !== true) throw new ApiError('API не подтвердил обработку уведомления. Повторим без дублирования сообщения.');
  }
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve,reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted','AbortError')); return; }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted','AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort',onAbort); resolve(); },ms);
    signal.addEventListener('abort',onAbort,{once:true});
  });
}
export async function poll(api: Pick<GreenApi,'receive'|'acknowledge'>, signal: AbortSignal, consume: (body: Record<string,unknown>) => void, status: (value: string) => void) {
  let failures = 0;
  while (!signal.aborted) {
    try {
      const event = await api.receive(signal);
      if (signal.aborted) break;
      if (event) { consume(event.body); await api.acknowledge(event.receiptId,signal); }
      failures = 0; status('Подключено');
      await delay(event ? 100 : 500,signal);
    } catch (error) {
      if (signal.aborted) break;
      if (error instanceof ApiError && [400,401,403,404].includes(error.status)) { status(error.message + ' Переподключитесь.'); break; }
      failures++; status('Связь прервана. Переподключаемся…');
      try { await delay(Math.min(30000,1000 * 2 ** Math.min(failures-1,5)),signal); } catch { break; }
    }
  }
}
