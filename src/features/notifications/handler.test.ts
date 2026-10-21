import {describe,expect,it,vi} from 'vitest';
import {createNotificationHandler} from '../../../supabase/functions/send-notifications/handler';
const env=(key:string)=>({SUPABASE_URL:'https://notification-tests.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-server-key'}[key]);
describe('Notification worker request authorization',()=>{
 it('rejects requests without a server secret before any database or provider call',async()=>{
  const request=vi.fn();const handle=createNotificationHandler(env,request);
  expect((await handle(new Request('https://worker.invalid',{method:'POST'}))).status).toBe(401);
  expect(request).not.toHaveBeenCalled();
 });
 it('rejects non-POST requests before any database or provider call',async()=>{
  const request=vi.fn();const handle=createNotificationHandler(env,request);
  expect((await handle(new Request('https://worker.invalid'))).status).toBe(405);expect(request).not.toHaveBeenCalled();
 });
 it('validates the custom secret with the server credential and never claims work for a wrong secret',async()=>{
  const request=vi.fn(async()=>Response.json(false));const handle=createNotificationHandler(env,request);
  const response=await handle(new Request('https://worker.invalid',{method:'POST',headers:{'x-notification-secret':'wrong'}}));
  expect(response.status).toBe(401);expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith('https://notification-tests.invalid/rest/v1/rpc/authorize_notification_worker',expect.objectContaining({body:JSON.stringify({p_secret:'wrong'}),headers:expect.objectContaining({authorization:'Bearer test-server-key'})}));
 });
 it('leaves the queue untouched when no provider is configured',async()=>{
  const request=vi.fn(async()=>Response.json(true));const handle=createNotificationHandler(env,request);
  const response=await handle(new Request('https://worker.invalid',{method:'POST',headers:{'x-notification-secret':'valid-test-secret'}}));
  expect(response.status).toBe(503);expect(request).toHaveBeenCalledTimes(1);
 });
});
