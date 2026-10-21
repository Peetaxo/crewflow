import { supabase } from '../../lib/supabase';
import { notificationSchema, parseSnapshot, preferencesSchema, type NotificationPreferences } from './contract';

export async function notificationCall(name: string, args?: Record<string, unknown>) {
  if (!supabase) throw new Error('Pro upozornění se přihlaste.');
  const {data,error} = await (supabase.rpc as (name:string,args?:Record<string,unknown>)=>PromiseLike<{data:unknown;error:{message:string}|null}>)(name,args);
  if(error) throw new Error(error.message);
  return data;
}
export async function readNotifications(userId:string,profileId:string,beforeId?:string) {
  return parseSnapshot(await notificationCall('get_my_notifications',{p_before_id:beforeId??null}),userId,profileId);
}
export async function openNotification(id:string,userId:string,profileId:string) {
  const n=notificationSchema.parse(await notificationCall('open_my_notification',{p_id:id}));
  if(n.recipient_user_id!==userId||n.recipient_profile_id!==profileId) throw new Error('Upozornění nepatří přihlášenému účtu.');
  return n;
}
export async function saveNotificationPreferences(settings:NotificationPreferences) {
  await notificationCall('set_my_notification_preferences',{p_settings:preferencesSchema.parse(settings)});
}
