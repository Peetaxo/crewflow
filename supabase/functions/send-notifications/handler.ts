import { configuredProviders,createPushSender } from './push.ts';
import { deliverJobs,type Job } from './worker.ts';
export function createNotificationHandler(env:(key:string)=>string|undefined,request:typeof fetch=fetch) {
const send=createPushSender(env,request);
const rpc=async(name:string,args:object)=>{
  const key=env('SUPABASE_SERVICE_ROLE_KEY');const url=env('SUPABASE_URL');
  if(!key||!url) throw new Error('server_not_configured');
  const response=await request(`${url}/rest/v1/rpc/${name}`,{method:'POST',signal:AbortSignal.timeout(10000),
    headers:{apikey:key,authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
  if(!response.ok) throw new Error(response.status===403?'unauthorized':'database_request_failed');
  const text=await response.text();return text?JSON.parse(text):null;
};
return async (req:Request)=>{
  if(req.method!=='POST') return new Response('Method not allowed',{status:405});
  const secret=req.headers.get('x-notification-secret');if(!secret||secret.length>200) return new Response('Unauthorized',{status:401});
  try {
    if(!await rpc('authorize_notification_worker',{p_secret:secret})) return new Response('Unauthorized',{status:401});
    const providers=configuredProviders(env);
    if(!providers.ios&&!providers.android) return Response.json({error:'push_providers_not_configured'},{status:503});
    const jobs=await rpc('claim_notification_push',{p_secret:secret,p_platforms:Object.entries(providers).filter(([,enabled])=>enabled).map(([platform])=>platform)}) as Job[];
    const count=await deliverJobs(jobs,send,async(job,delivered,invalid,error)=>{
      await rpc('finish_notification_push',{p_id:job.notification.id,p_lease:job.lease,p_delivered:delivered,p_invalid:invalid,p_error:error});
    });
    return Response.json({processed:jobs.length,deliveries:count});
  } catch(error) {return Response.json({error:error instanceof Error&&error.message==='unauthorized'?'unauthorized':'notification_worker_failed'},{status:error instanceof Error&&error.message==='unauthorized'?401:500});}
};
}
