export type {Credentials} from './api';
export type MessageStatus = 'pending'|'queued'|'delivered'|'read'|'failed'|'unknown';
export interface Message {id:string;text:string;direction:'in'|'out';timestamp:number;status?:MessageStatus}
export interface Chat {id:string;name:string;phone?:string;messages:Message[];unread:number}
export interface ChatState {chats:Chat[];statuses:Record<string,MessageStatus>}
export const emptyState = (): ChatState => ({chats:[],statuses:{}});
export function restoreState(raw:string|null):ChatState {
  if(!raw)return emptyState();
  try{
    const data=JSON.parse(raw);
    if(!data||!Array.isArray(data.chats)||!data.statuses||typeof data.statuses!=='object'||Array.isArray(data.statuses))return emptyState();
    const validStatus=(s:unknown)=>typeof s==='string'&&['pending','queued','delivered','read','failed','unknown'].includes(s);
    if(!Object.values(data.statuses).every(validStatus))return emptyState();
    for(const c of data.chats){
      if(!c||typeof c.id!=='string'||!c.id||typeof c.name!=='string'||(c.phone!==undefined&&typeof c.phone!=='string')||!Number.isSafeInteger(c.unread)||c.unread<0||!Array.isArray(c.messages))return emptyState();
      for(const m of c.messages){
        if(!m||typeof m.id!=='string'||!m.id||typeof m.text!=='string'||!['in','out'].includes(m.direction)||typeof m.timestamp!=='number'||!Number.isFinite(m.timestamp)||Math.abs(m.timestamp)>8.64e15||(m.status!==undefined&&!validStatus(m.status)))return emptyState();
        if(m.status==='pending')m.status='unknown';
      }
    }
    return data;
  }catch{return emptyState();}
}
type ObjectValue = Record<string,unknown>;
const object = (value:unknown):ObjectValue => value && typeof value === 'object' ? value as ObjectValue : {};
const string = (value:unknown) => typeof value === 'string' ? value : '';
const rank: Record<MessageStatus,number> = {pending:0,unknown:0,queued:1,failed:2,delivered:3,read:4};
export function bestStatus(a:MessageStatus|undefined,b:MessageStatus):MessageStatus { return a && rank[a] > rank[b] ? a : b; }
export function addMessage(state:ChatState,chatId:string,message:Message,name?:string,activeId?:string|null):ChatState {
  const exists = state.chats.find(c=>c.id===chatId);
  const chat:Chat = exists ?? {id:chatId,name:name||chatId,messages:[],unread:0};
  const previous = chat.messages.find(m=>m.id===message.id);
  const merged = previous ? {...previous,...message,status:message.status?bestStatus(previous.status,message.status):previous.status} : message;
  const next:Chat = {...chat,messages:previous ? chat.messages.map(m=>m.id===message.id?merged:m) : [...chat.messages,merged].sort((a,b)=>a.timestamp-b.timestamp), unread:chat.unread+(!previous && message.direction==='in' && activeId!==chatId ? 1:0)};
  return {...state,chats:exists?state.chats.map(c=>c.id===chatId?next:c):[next,...state.chats]};
}
export function applyNotification(state:ChatState,body:ObjectValue,activeId?:string|null):ChatState {
  const type=string(body.typeWebhook), id=string(body.idMessage);
  if(type==='outgoingMessageStatus' && id){
    const raw=string(body.status);
    const nextStatus:MessageStatus|undefined = raw==='read'?'read':raw==='delivered'?'delivered':['failed','noAccount','notInGroup'].includes(raw)?'failed':undefined;
    if(!nextStatus)return state;
    const status=bestStatus(state.statuses[id],nextStatus);
    return {...state,statuses:{...state.statuses,[id]:status},chats:state.chats.map(c=>({...c,messages:c.messages.map(m=>m.id===id?{...m,status:bestStatus(m.status,status)}:m)}))};
  }
  if(!['incomingMessageReceived','outgoingAPIMessageReceived','outgoingMessageReceived'].includes(type)||!id)return state;
  const sender=object(body.senderData), data=object(body.messageData);
  const chatId=string(sender.chatId); if(!chatId)return state;
  const text=data.typeMessage==='textMessage'?string(object(data.textMessageData).textMessage):data.typeMessage==='extendedTextMessage'?string(object(data.extendedTextMessageData).text):'';
  if(!text)return state;
  const incoming=type==='incomingMessageReceived';
  const timestamp=typeof body.timestamp==='number'&&Number.isFinite(body.timestamp)?body.timestamp*1000:Date.now();
  return addMessage(state,chatId,{id,text,timestamp,direction:incoming?'in':'out',...(!incoming?{status:state.statuses[id]??'queued'}:{})},string(sender.senderName)||string(sender.chatName),activeId);
}
