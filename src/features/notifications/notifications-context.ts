import {createContext,useContext} from 'react';
import type {NotificationSnapshot,NotificationPreferences} from './contract';
export type NotificationStore={ready:boolean;data:NotificationSnapshot|null;error:string;loading:boolean;busy:boolean;hasMore:boolean;
 reload:()=>Promise<void>;more:()=>Promise<void>;markAll:()=>Promise<void>;open:(id:string)=>Promise<void>;
 save:(p:NotificationPreferences)=>Promise<void>;panelOpen:boolean;setPanelOpen:(open:boolean)=>void};
export const NotificationsContext=createContext<NotificationStore|null>(null);
export const useNotifications=()=>useContext(NotificationsContext);
