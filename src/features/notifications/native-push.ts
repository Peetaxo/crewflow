import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { notificationCall } from './service';

const installationKey='nodu.push-installation';
export const nativePushAvailable=()=>Capacitor.isNativePlatform();
export function pushInstallationId() {
  let id=localStorage.getItem(installationKey);
  if(!id) {id=crypto.randomUUID();localStorage.setItem(installationKey,id);}
  return id;
}
export async function disconnectNativePush() {
  if(!nativePushAvailable()) return;
  const id=localStorage.getItem(installationKey);
  try { if(id) await notificationCall('unregister_notification_device',{p_installation_id:id}); }
  finally { await PushNotifications.unregister().catch(()=>{}); }
}
export async function connectNativePush(isCurrent:()=>boolean,onOpen:(id:string)=>void,onError:(message:string)=>void,register=false) {
  const handles:PluginListenerHandle[]=[];
  if(!nativePushAvailable()) return ()=>{};
  const add=async (handle:Promise<PluginListenerHandle>)=>{
    const h=await handle;
    if(!isCurrent()) await h.remove(); else handles.push(h);
  };
  const syncToken=async (token:string)=>{
    if(!isCurrent()) return;
    try { await notificationCall('register_notification_device',{
      p_installation_id:pushInstallationId(),p_platform:Capacitor.getPlatform(),p_token:token,
      p_environment:Capacitor.getPlatform()==='ios'&&import.meta.env.VITE_APNS_ENVIRONMENT==='development'?'development':'production',
    }); } catch { if(isCurrent()) onError('Telefon se nepodařilo připojit k upozorněním. Zkuste připojení znovu v nastavení.'); }
  };
  const stop=()=>{void Promise.all(handles.splice(0).map(h=>h.remove()));};
  try {
  await add(PushNotifications.addListener('registration',({value})=>{void syncToken(value);}));
  await add(PushNotifications.addListener('registrationError',()=>{if(isCurrent()) onError('Upozornění do telefonu se nepodařilo zapnout.');}));
  await add(PushNotifications.addListener('pushNotificationActionPerformed',({notification})=>{
    const id=notification.data?.notificationId;
    if(isCurrent()&&typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)) onOpen(id);
  }));
  if(register&&isCurrent()&&(await PushNotifications.checkPermissions()).receive==='granted'&&isCurrent()) await PushNotifications.register();
  return stop;
  } catch(error) {stop();throw error;}
}
export async function enableNativePush() {
  if(!nativePushAvailable()) return false;
  let permission=await PushNotifications.checkPermissions();
  if(permission.receive==='prompt'||permission.receive==='prompt-with-rationale') permission=await PushNotifications.requestPermissions();
  if(permission.receive!=='granted') return false;
  if(Capacitor.getPlatform()==='android') await PushNotifications.createChannel({id:'nodu',name:'Směny a vyúčtování',importance:4});
  await PushNotifications.register();
  return true;
}
