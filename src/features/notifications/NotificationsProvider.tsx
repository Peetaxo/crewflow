import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../app/providers/useAuth';
import { useAppContext } from '../../context/useAppContext';
import { appDataSource } from '../../lib/app-config';
import type { NotificationPreferences, NotificationSnapshot } from './contract';
import { notificationCall, openNotification, readNotifications, saveNotificationPreferences } from './service';
import { connectNativePush } from './native-push';

type NotificationStore={ready:boolean;data:NotificationSnapshot|null;error:string;loading:boolean;busy:boolean;hasMore:boolean;
 reload:()=>Promise<void>;more:()=>Promise<void>;markAll:()=>Promise<void>;open:(id:string)=>Promise<void>;
 save:(p:NotificationPreferences)=>Promise<void>;panelOpen:boolean;setPanelOpen:(open:boolean)=>void};
const Context=createContext<NotificationStore|null>(null);
export const useNotifications=()=>useContext(Context);
export function NotificationsProvider({children}:{children:React.ReactNode}) {
  const auth=useAuth(); const app=useAppContext();
  const ready=appDataSource==='supabase'&&Boolean(auth.isAuthenticated&&!auth.isLoading&&!auth.isRoleSwitching&&auth.currentUserId&&auth.currentProfileId);
  const key=JSON.stringify([auth.currentUserId,auth.currentProfileId,auth.role,ready]);
  const activation=useMemo(()=>({active:false,key}),[key]);
  const current=useRef(activation);
  const [state,setState]=useState<{key:string;data:NotificationSnapshot|null;error:string;loading:boolean;hasMore:boolean}>({key,data:null,error:'',loading:false,hasMore:false});
  const [panelOpen,setPanelOpen]=useState(false); const [busyKey,setBusyKey]=useState<string|null>(null);
  const busyRef=useRef<string|null>(null); const readSequence=useRef(0);
  useLayoutEffect(()=>{current.current=activation;activation.active=ready;setPanelOpen(false);return()=>{activation.active=false;};},[activation,ready]);
  const isCurrent=useCallback(()=>activation.active&&current.current===activation,[activation]);
  const reload=useCallback(async()=>{
    if(!isCurrent()) return;
    const seq=++readSequence.current;
    setState(s=>s.key===key?({...s,loading:true}):({key,data:null,error:'',loading:true,hasMore:false}));
    try {
      const data=await readNotifications(auth.currentUserId!,auth.currentProfileId!);
      if(isCurrent()&&readSequence.current===seq) setState({key,data,error:'',loading:false,hasMore:data.items.length===50});
    } catch(e) {if(isCurrent()&&readSequence.current===seq) setState(s=>({...s,key,loading:false,error:e instanceof Error?e.message:'Upozornění se nepodařilo načíst.'}));}
  },[auth.currentUserId,auth.currentProfileId,isCurrent,key]);
  useEffect(()=>{
    if(!ready) return;
    void reload();
    const refresh=()=>{if(document.visibilityState!=='hidden') void reload();};
    const timer=setInterval(refresh,30000);
    window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[ready,reload]);
  const execute=useCallback(async(action:()=>Promise<void>,refresh=true)=>{
    if(!isCurrent()||busyRef.current===key) return;
    busyRef.current=key;setBusyKey(key);
    try {await action();if(isCurrent()&&refresh) await reload();}
    catch(e) {if(isCurrent()) toast.error(e instanceof Error?e.message:'Operaci se nepodařilo dokončit.');throw e;}
    finally {if(busyRef.current===key) busyRef.current=null;if(isCurrent()) setBusyKey(null);}
  },[isCurrent,key,reload]);
  const data=ready&&state.key===key?state.data:null;
  const open=useCallback(async(id:string)=>{
    await execute(async()=>{
      const n=await openNotification(id,auth.currentUserId!,auth.currentProfileId!);
      if(!isCurrent()) return;
      setPanelOpen(false);
      app.openNotificationTarget?.(n.target);
    });
  },[app,auth.currentProfileId,auth.currentUserId,execute,isCurrent]);
  const openRef=useRef(open); useLayoutEffect(()=>{openRef.current=open;},[open]);
  useEffect(()=>{
    if(!ready) return;
    let cleanup:(()=>void)|undefined;
    void connectNativePush(isCurrent,id=>{void openRef.current(id).catch(()=>{});},message=>toast.error(message))
      .then(stop=>{if(isCurrent()) cleanup=stop;else stop();}).catch(()=>{});
    return()=>{cleanup?.();};
  },[ready,isCurrent]);
  const more=async()=>{
    const last=data?.items.at(-1)?.id;if(!last) return;
    const seq=++readSequence.current;
    await execute(async()=>{
      const next=await readNotifications(auth.currentUserId!,auth.currentProfileId!,last);
      if(isCurrent()&&seq===readSequence.current) setState(s=>({...s,data:{...next,items:[...data!.items,...next.items.filter(n=>!data!.items.some(x=>x.id===n.id))]},hasMore:next.items.length===50}));
    },false);
  };
  const markAll=()=>execute(async()=>{if(data) await notificationCall('read_my_notifications',{p_before:data.asOf});});
  const save=(p:NotificationPreferences)=>execute(()=>saveNotificationPreferences(p));
  return <Context.Provider value={{ready,data,error:state.key===key?state.error:'',loading:ready&&(state.key!==key||state.loading),busy:busyKey===key,
    hasMore:state.key===key&&state.hasMore,reload,more,markAll,open,save,panelOpen,setPanelOpen}}>{children}</Context.Provider>;
}
