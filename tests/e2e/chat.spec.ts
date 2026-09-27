import {test,expect,type Page} from '@playwright/test';
const token='x'.repeat(32);
async function login(page:Page){
  await page.goto('/');
  await page.getByLabel('ID инстанса').fill('3100000000');
  await page.getByLabel('API-токен',{exact:true}).fill(token);
  await page.getByRole('button',{name:'Подключиться',exact:true}).click();
}
async function setupApi(page:Page){
  const calls:string[]=[],sent:unknown[]=[],queue:unknown[]=[];
  let failSend=false;
  await page.route('https://3100.api.green-api.com/**',async route=>{
    const url=new URL(route.request().url()); const method=url.pathname.split('/')[2];calls.push(method);
    let body:unknown;
    if(method==='getStateInstance')body={stateInstance:'authorized'};
    else if(method==='checkAccount'){expect(route.request().postDataJSON()).toEqual({phoneNumber:79991234567});body={exist:true,chatId:'100001'};}
    else if(method==='sendMessage'){
      sent.push(route.request().postDataJSON());
      if(failSend){await route.abort('failed');return;}
      body={idMessage:'out-1'};
      queue.push({receiptId:11,body:{typeWebhook:'incomingMessageReceived',idMessage:'in-1',timestamp:1789999200,senderData:{chatId:'100001',senderName:'Тестовый собеседник'},messageData:{typeMessage:'extendedTextMessage',extendedTextMessageData:{text:'Ответ из MAX https://example.com'}}}});
      queue.push({receiptId:12,body:{typeWebhook:'outgoingMessageStatus',chatId:'100001',idMessage:'out-1',status:'read'}});
    }else if(method==='receiveNotification'){await new Promise(r=>setTimeout(r,100));body=queue[0]??null;}
    else if(method==='deleteNotification'){queue.shift();body={result:true};}
    else throw new Error(`Unexpected API method ${method}`);
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  });
  return {calls,sent,setFailSend:()=>{failSend=true;}};
}
async function newChat(page:Page){
  await page.getByRole('button',{name:'Новый чат',exact:true}).first().click();
  await page.getByLabel('Номер собеседника').fill('+7 (999) 123-45-67');
  await page.getByRole('button',{name:'Открыть чат',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'Сообщение',exact:true})).toBeVisible();
}
test('demo sends locally, renders safely, and logs out',async({page})=>{
  let externalCalls=0;page.on('request',r=>{if(r.url().includes('.api.green-api.com'))externalCalls++;});
  await page.goto('/');await page.getByRole('button',{name:'Открыть демо'}).click();
  const input=page.getByRole('textbox',{name:'Сообщение',exact:true});
  await expect(page.getByRole('button',{name:'Отправить сообщение',exact:true})).toBeDisabled();
  await input.fill('<img src=x onerror=alert(1)> Привет');await input.press('Enter');
  await expect(page.getByRole('log').getByText('<img src=x onerror=alert(1)> Привет',{exact:true})).toBeVisible();
  await expect(page.getByRole('log').getByText(/Это автоматический ответ деморежима/)).toBeVisible();
  expect(externalCalls).toBe(0);
  await page.getByRole('button',{name:'Выйти из чата'}).click();await expect(page.getByRole('heading',{name:'Войти в чат'})).toBeVisible();
});
test('API flow resolves phone, sends text, receives reply in same chat, acks and clears token',async({page})=>{
  const api=await setupApi(page);await login(page);await newChat(page);
  await page.getByRole('textbox',{name:'Сообщение',exact:true}).fill('Привет из браузера');
  await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
  await expect(page.getByRole('log').getByText('Ответ из MAX https://example.com',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Прочитано',{exact:true})).toBeVisible();
  expect(api.sent).toEqual([{chatId:'100001',message:'Привет из браузера'}]);
  expect(api.calls).toContain('deleteNotification');
  expect(await page.locator('.chat-item').count()).toBe(1);
  const storage=await page.evaluate(()=>JSON.stringify({session:{...sessionStorage},local:{...localStorage}}));expect(storage).not.toContain(token);
  await page.reload();await login(page);
  await page.locator('.chat-item').first().click();
  await expect(page.getByRole('log').getByText('Ответ из MAX https://example.com',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Выйти из чата'}).click();
  expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('max-chat:')))).toEqual([]);
});
test('ambiguous send failure is visible and does not auto-retry',async({page})=>{
  const api=await setupApi(page);api.setFailSend();await login(page);await newChat(page);
  await page.getByRole('textbox',{name:'Сообщение',exact:true}).fill('Не дублировать');
  await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Результат отправки неизвестен');
  await expect(page.getByRole('textbox',{name:'Сообщение',exact:true})).toHaveValue('Не дублировать');
  await page.waitForTimeout(1200);expect(api.sent).toHaveLength(1);
});
test('mobile navigation, multiline draft, no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await page.getByRole('button',{name:'Открыть демо'}).click();
  const input=page.getByRole('textbox',{name:'Сообщение',exact:true});
  await input.fill('Первая строка');await input.press('Shift+Enter');await input.pressSequentially('Вторая строка');
  await expect(input).toHaveValue('Первая строка\nВторая строка');
  await page.getByRole('button',{name:'Назад к списку чатов'}).click();
  await expect(page.getByRole('heading',{name:/Сообщения/})).toBeVisible();
  await page.locator('.chat-item').first().click();await expect(input).toHaveValue('Первая строка\nВторая строка');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
