import {useCallback,useEffect,useRef,useState} from 'react';
import {ApiError,GreenApi,normalizePhone,poll,delay,type Credentials} from './api';
import {addMessage,applyNotification,bestStatus,emptyState,restoreState,type ChatState} from './model';

type Session={demo:boolean;idInstance:string};
const demoState=():ChatState=>({statuses:{},chats:[{id:'demo-contact',name:'Мария',phone:'70000000000',unread:0,messages:[
  {id:'demo-1',text:'Привет! Здесь можно проверить, как устроен чат.',direction:'in',timestamp:Date.now()-180000},
  {id:'demo-2',text:'Отлично. Сообщения отправляются прямо из браузера?',direction:'out',timestamp:Date.now()-120000,status:'read'},
  {id:'demo-3',text:'Да, после подключения GREEN-API. А сейчас это демо — попробуй написать что-нибудь 🙂',direction:'in',timestamp:Date.now()-60000}
]}]});
export function useChat(){
  const [session,setSession]=useState<Session|null>(null);
  const [state,setState]=useState<ChatState>(emptyState);
  const stateRef=useRef(state);
  const [activeId,setActiveId]=useState<string|null>(null);
  const activeRef=useRef<string|null>(null);
  const [error,setError]=useState('');
  const [connection,setConnection]=useState('Подключение…');
  const [sending,setSending]=useState(false);
  const sendingRef=useRef(false);
  const api=useRef<GreenApi|null>(null);
  const lifetime=useRef(new AbortController());
  const storageKey=useRef<string|null>(null);
  const [generation,setGeneration]=useState(0);
  const commit=useCallback((next:ChatState)=>{
    // Save synchronously before acknowledging an inbound notification.
    if(storageKey.current){
      try{sessionStorage.setItem(storageKey.current,JSON.stringify(next));}
      catch{throw new Error('Не удалось сохранить переписку в этой вкладке. Освободите хранилище браузера; уведомление остаётся в очереди.');}
    }
    stateRef.current=next;setState(next);
  },[]);
  const selectChat=useCallback((id:string|null)=>{
    activeRef.current=id;setActiveId(id);
    const next={...stateRef.current,chats:stateRef.current.chats.map(c=>c.id===id?{...c,unread:0}:c)};
    try{commit(next);}catch(e){setError((e as Error).message);}
  },[commit]);
  const login=useCallback(async(credentials:Credentials)=>{
    lifetime.current.abort();const controller=new AbortController();lifetime.current=controller;
    const client=new GreenApi(credentials);
    await client.authorize(controller.signal);
    if(controller.signal.aborted)return;
    const key=`max-chat:${client.credentials.apiUrl}:${client.credentials.idInstance}`;
    let saved=emptyState();
    try{
      saved=restoreState(sessionStorage.getItem(key));
      sessionStorage.setItem(key,JSON.stringify(saved));
    }catch{throw new Error('Для получения сообщений разрешите хранилище текущей вкладки в браузере.');}
    storageKey.current=key;api.current=client;commit(saved);selectChat(null);setError('');
    setSession({demo:false,idInstance:client.credentials.idInstance});
  },[commit,selectChat]);
  const startDemo=useCallback(()=>{
    lifetime.current.abort();lifetime.current=new AbortController();storageKey.current=null;api.current=null;
    commit(demoState());selectChat('demo-contact');setError('');setSession({demo:true,idInstance:'demo'});setConnection('Демонстрация');
  },[commit,selectChat]);
  const logout=useCallback(()=>{
    lifetime.current.abort();api.current=null;
    if(storageKey.current){try{sessionStorage.removeItem(storageKey.current);}catch{/* best effort */}}
    storageKey.current=null;commit(emptyState());selectChat(null);setSession(null);setError('');setSending(false);sendingRef.current=false;
  },[commit,selectChat]);
  useEffect(()=>{
    if(!session||session.demo||!api.current)return;
    const controller=new AbortController();
    const signal=AbortSignal.any([controller.signal,lifetime.current.signal]);
    const client=api.current;
    const run=async()=>{
      setConnection('Подключение…');
      await poll(client,signal,body=>{
        if(body.typeWebhook==='stateInstanceChanged'&&body.stateInstance!=='authorized')setError('Состояние инстанса изменилось. Проверьте авторизацию в кабинете GREEN-API.');
        try{commit(applyNotification(stateRef.current,body,activeRef.current));}
        catch(e){setError((e as Error).message);throw e;}
      },value=>{if(!signal.aborted)setConnection(value);});
    };
    // A queue must have one consumer per instance, even across browser tabs.
    if(navigator.locks){
      void navigator.locks.request(`max-poll:${client.credentials.apiUrl}:${session.idInstance}`,{mode:'exclusive',signal},run).catch(()=>{});
    }else{void run();}
    return()=>controller.abort();
  },[session,generation,commit]);
  useEffect(()=>()=>lifetime.current.abort(),[]);
  const createChat=useCallback(async(rawPhone:string)=>{
    const phone=normalizePhone(rawPhone),controller=lifetime.current;
    const id=session?.demo?`demo-${phone}`:await api.current!.checkAccount(phone,controller.signal);
    if(controller.signal.aborted)return;
    if(!stateRef.current.chats.some(c=>c.id===id))commit({...stateRef.current,chats:[{id,name:`+${phone}`,phone,messages:[],unread:0},...stateRef.current.chats]});
    selectChat(id);
  },[session,commit,selectChat]);
  const send=useCallback(async(text:string)=>{
    const chatId=activeRef.current;
    if(!session||!chatId||sendingRef.current)return;
    if(!text.trim()||text.length>4000)throw new Error('Нужен текст от 1 до 4000 символов.');
    const controller=lifetime.current;
    const tempId=`local-${crypto.randomUUID()}`;
    sendingRef.current=true;setSending(true);setError('');
    try{
      commit(addMessage(stateRef.current,chatId,{id:tempId,text,direction:'out',timestamp:Date.now(),status:'pending'}));
      const id=session.demo?`demo-${crypto.randomUUID()}`:await api.current!.send(chatId,text,controller.signal);
      if(controller.signal.aborted)return;
      // An outgoing webhook can arrive before sendMessage returns; merge by server id.
      const current=stateRef.current;
      const local=current.chats.find(c=>c.id===chatId)!.messages.find(m=>m.id===tempId)!;
      const withoutLocal={...current,chats:current.chats.map(c=>c.id===chatId?{...c,messages:c.messages.filter(m=>m.id!==tempId)}:c)};
      commit(addMessage(withoutLocal,chatId,{...local,id,status:bestStatus(current.statuses[id],session.demo?'read':'queued')}));
      if(session.demo){
        void delay(900,controller.signal).then(()=>{
          commit(addMessage(stateRef.current,chatId,{id:`demo-${crypto.randomUUID()}`,text:'Сообщение получил! Это автоматический ответ деморежима. Для настоящего диалога подключи свой инстанс MAX.',direction:'in',timestamp:Date.now()},undefined,activeRef.current));
        }).catch(()=>{});
      }
    }catch(e){
      if(controller.signal.aborted)return;
      const definite=e instanceof ApiError&&e.status>=400&&e.status<500&&e.status!==499;
      const message=definite?(e as Error).message:'Результат отправки неизвестен. Проверьте MAX перед повторной отправкой, чтобы не создать дубль.';
      try{commit({...stateRef.current,chats:stateRef.current.chats.map(c=>({...c,messages:c.messages.map(m=>m.id===tempId?{...m,status:definite?'failed' as const:'unknown' as const}:m)}))});}catch{/* visible error below */}
      setError(message);throw new Error(message);
    }finally{if(!controller.signal.aborted){sendingRef.current=false;setSending(false);}}
  },[session,commit]);
  return{session,login,startDemo,logout,chats:state.chats,activeId,selectChat,createChat,send,connection,error,clearError:()=>setError(''),sending,reconnect:()=>setGeneration(n=>n+1)};
}
