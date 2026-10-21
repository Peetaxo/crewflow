import React from 'react';
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { parseSnapshot,type NotificationSnapshot } from './contract';
import { NotificationsProvider } from './NotificationsProvider';
import {useNotifications} from './notifications-context';
const mocks=vi.hoisted(()=>({read:vi.fn(),call:vi.fn(),open:vi.fn(),save:vi.fn(),navigate:vi.fn(),connect:vi.fn(async()=>()=>{})}));
const ids={user:'10000000-0000-4000-8000-000000000001',profile:'10000000-0000-4000-8000-000000000002',other:'20000000-0000-4000-8000-000000000001'};
let auth={currentUserId:ids.user,currentProfileId:ids.profile,role:'crew',isAuthenticated:true,isLoading:false,isRoleSwitching:false};
vi.mock('../../app/providers/useAuth',()=>({useAuth:()=>auth}));
vi.mock('../../context/useAppContext',()=>({useAppContext:()=>({openNotificationTarget:mocks.navigate})}));
vi.mock('../../lib/app-config',()=>({appDataSource:'supabase'}));
vi.mock('./service',()=>({readNotifications:mocks.read,notificationCall:mocks.call,openNotification:mocks.open,saveNotificationPreferences:mocks.save}));
vi.mock('./native-push',()=>({connectNativePush:mocks.connect}));
function snapshot(title='Moje směna',suffix=3):NotificationSnapshot {
 return {items:[{id:`10000000-0000-4000-8000-${String(suffix).padStart(12,'0')}`,recipient_user_id:auth.currentUserId,recipient_profile_id:auth.currentProfileId,
  category:'applications',kind:'assignment_confirmed',title,body:'Potvrzeno',created_at:'2026-10-21T09:00:00Z',read_at:null,group_key:null,urgent:false,target:{tab:'events'}}],
  unread:1,asOf:'2026-10-21T09:01:00Z',preferences:{push_enabled:true,categories:{},quiet_enabled:true,quiet_from:'22:00',quiet_to:'07:00',timezone:'Europe/Prague'},deliveryReady:false};
}
function Probe() {const n=useNotifications()!;return <><div>{n.data?.items.map(i=><p key={i.id}>{i.title}</p>)}</div><p>{n.loading?'Načítám':''}</p>
 <button onClick={()=>{void n.more();}}>Starší</button><button onClick={()=>{void n.markAll();}}>Přečíst</button><button onClick={()=>{void n.open('10000000-0000-4000-8000-000000000003').catch(()=>{});}}>Otevřít</button></>;}
const tree=()=> <NotificationsProvider><Probe/></NotificationsProvider>;
beforeEach(()=>{vi.clearAllMocks();auth={currentUserId:ids.user,currentProfileId:ids.profile,role:'crew',isAuthenticated:true,isLoading:false,isRoleSwitching:false};mocks.read.mockImplementation(async()=>snapshot());mocks.call.mockResolvedValue(null);});
describe('Notification identity and history',()=>{
 it('rejects server data belonging to another account even with valid notification shapes',()=>{
  const bad=snapshot();bad.items[0].recipient_user_id=ids.other;
  expect(()=>parseSnapshot(bad,ids.user,ids.profile)).toThrow('nepatří');
 });
 it('never shows the previous account while the next account is loading',async()=>{
  const view=render(tree());await screen.findByText('Moje směna');
  let resolve!:(value:NotificationSnapshot)=>void;mocks.read.mockReturnValue(new Promise(r=>{resolve=r;}));
  auth={...auth,currentUserId:ids.other,currentProfileId:ids.other};view.rerender(tree());
  expect(screen.queryByText('Moje směna')).not.toBeInTheDocument();
  await act(async()=>resolve(snapshot('Druhý účet')));expect(await screen.findByText('Druhý účet')).toBeInTheDocument();
 });
 it('ignores an old request that resolves after an identity change',async()=>{
  let resolve!:(value:NotificationSnapshot)=>void;const old=snapshot('Starý účet');mocks.read.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
  const view=render(tree());auth={...auth,currentUserId:ids.other,currentProfileId:ids.other};view.rerender(tree());
  await screen.findByText('Moje směna');await act(async()=>resolve(old));expect(screen.queryByText('Starý účet')).not.toBeInTheDocument();
 });
 it('uses the loaded server cutoff for mark-all without inventing a client timestamp',async()=>{
  render(tree());await screen.findByText('Moje směna');fireEvent.click(screen.getByText('Přečíst'));
  await waitFor(()=>expect(mocks.call).toHaveBeenCalledWith('read_my_notifications',{p_before:'2026-10-21T09:01:00Z'}));
 });
 it('keeps an older page visible instead of immediately replacing it with a fresh first page',async()=>{
  render(tree());await screen.findByText('Moje směna');mocks.read.mockResolvedValueOnce(snapshot('Starší směna',4));
  fireEvent.click(screen.getByText('Starší'));await screen.findByText('Starší směna');
  expect(screen.getByText('Moje směna')).toBeInTheDocument();expect(mocks.read).toHaveBeenCalledTimes(2);
 });
 it('does not navigate when an open result resolves after sign-out',async()=>{
  const view=render(tree());await screen.findByText('Moje směna');let resolve!:(value:unknown)=>void;
  mocks.open.mockReturnValue(new Promise(r=>{resolve=r;}));const n=snapshot().items[0];fireEvent.click(screen.getByText('Otevřít'));
  auth={...auth,isAuthenticated:false};view.rerender(tree());await act(async()=>resolve(n));expect(mocks.navigate).not.toHaveBeenCalled();
 });
});
