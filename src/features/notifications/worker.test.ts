import { describe,expect,it,vi } from 'vitest';
import { deliverJobs,type Job } from '../../../supabase/functions/send-notifications/worker';
import type {Device,PushPayload} from '../../../supabase/functions/send-notifications/push';
import { createPushSender } from '../../../supabase/functions/send-notifications/push';
const device=(id:string)=>({id,platform:'ios' as const,token:'test-token-long-enough',environment:'development' as const});
function job(id:string,user='u1',group='event',category='new_shifts'):Job {return {notification:{id,recipient_user_id:user,category,group_key:group,title:`Směna ${id}`,body:'Nová směna',urgent:false},lease:id,devices:[device('phone')]};}
describe('Notification worker delivery',()=>{
 it('combines one action group without combining users or notification categories',async()=>{
  const send=vi.fn(async(_device:Device,_payload:PushPayload)=>({ok:true}));const finish=vi.fn(async(_job:Job,_delivered:string[],_invalid:string[],_error:string|null)=>{});
  await deliverJobs([job('a'),job('b'),job('c','u2'),job('d','u1','event','applications')],send,finish);
  expect(send).toHaveBeenCalledTimes(3);expect(send.mock.calls[0][1]).toMatchObject({notificationIds:['a','b'],title:'Nové směny (2)',group:'new_shifts:event'});
  expect(finish).toHaveBeenCalledTimes(4);
 });
 it('records successes separately from transient failures and expired device tokens',async()=>{
  const j=job('a');j.devices=[device('ok'),device('retry'),device('expired')];const finish=vi.fn(async(_job:Job,_delivered:string[],_invalid:string[],_error:string|null)=>{});
  await deliverJobs([j],async d=>d.id==='ok'?{ok:true}:d.id==='expired'?{ok:false,invalid:true,error:'unregistered'}:{ok:false,error:'apns_503'},finish);
  expect(finish).toHaveBeenCalledWith(j,['ok'],['expired'],'apns_503');
 });
 it('does not resend a retried notification to an already-delivered device omitted by the database',async()=>{
  const a=job('a');a.devices=[device('new-phone')];const b=job('b');b.devices=[device('old-phone'),device('new-phone')];
  const send=vi.fn(async(_device:Device,_payload:PushPayload)=>({ok:true}));await deliverJobs([a,b],send,async()=>{});
  const old=send.mock.calls.find(([d])=>d.id==='old-phone');expect(old?.[1].notificationIds).toEqual(['b']);
 });
 it('bounds transport concurrency and converts thrown transport errors into retryable results',async()=>{
  let active=0;let max=0;const finish=vi.fn(async(_job:Job,_delivered:string[],_invalid:string[],_error:string|null)=>{});
  await deliverJobs(Array.from({length:12},(_,i)=>job(String(i),'u'+i)),async()=>{
    active++;max=Math.max(active,max);await new Promise(r=>setTimeout(r,1));active--;throw Error('network secret must not escape');
  },finish);
  expect(max).toBeLessThanOrEqual(4);expect(max).toBeGreaterThan(1);expect(finish).toHaveBeenCalledTimes(12);
  expect(finish.mock.calls.every(c=>c[3]==='push_transport_failed')).toBe(true);
 });
 it('does not contact providers when credentials are absent',async()=>{
  const request=vi.fn();const send=createPushSender(()=>undefined,request);
  expect(await send(device('a'),{title:'a',body:'b',notificationId:'a',notificationIds:['a'],group:'g',urgent:false})).toEqual({ok:false,error:'apns_not_configured'});
  expect(request).not.toHaveBeenCalled();
 });
});
