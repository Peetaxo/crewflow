import type { Device,PushPayload,PushResult } from './push.ts';
export interface Job {
  notification:{id:string;recipient_user_id:string;category:string;group_key:string|null;title:string;body:string;urgent:boolean};
  lease:string;devices:Device[];
}
export function groupJobs(jobs:Job[]) {
  const groups=new Map<string,Job[]>();
  for(const job of jobs) {
    const n=job.notification;
    const key=JSON.stringify([n.recipient_user_id,n.category,n.group_key??n.id,n.urgent]);
    groups.set(key,[...(groups.get(key)??[]),job]);
  }
  return [...groups.values()];
}
export async function deliverJobs(jobs:Job[],send:(device:Device,payload:PushPayload)=>Promise<PushResult>,
 finish:(job:Job,delivered:string[],invalid:string[],error:string|null)=>Promise<void>) {
  let deliveredCount=0;
  const tasks:Array<()=>Promise<void>>=[];
  const results:Array<{group:Job[];outcomes:Map<string,PushResult>}>=[];
  for(const group of groupJobs(jobs)) {
    const deviceIds=[...new Set(group.flatMap(j=>j.devices.map(d=>d.id)))];
    const outcomes=new Map<string,PushResult>();
    results.push({group,outcomes});
    for(const id of deviceIds) {
      tasks.push(async()=>{
      const subset=group.filter(j=>j.devices.some(d=>d.id===id));const n=subset[0].notification;
      const titles:Record<string,string>={new_shifts:'Nové směny',applications:'Novinky k přihláškám',timelogs:'Novinky k výkazům'};
      const payload:PushPayload={notificationId:n.id,notificationIds:subset.map(j=>j.notification.id),group:`${n.category}:${n.group_key??n.id}`,urgent:n.urgent,
        title:subset.length===1?n.title:`${titles[n.category]??'Nová upozornění'} (${subset.length})`,
        body:subset.length===1?n.body:subset.map(j=>j.notification.title).slice(0,4).join(' · ').slice(0,500)};
      let result:PushResult;
      try {result=await send(subset[0].devices.find(d=>d.id===id)!,payload);} catch {result={ok:false,error:'push_transport_failed'};}
      outcomes.set(id,result);
      if(result.ok) deliveredCount++;
      });
    }
  }
  let next=0;
  await Promise.all(Array.from({length:Math.min(4,tasks.length)},async()=>{
    while(next<tasks.length) {const task=tasks[next++];await task();}
  }));
  for(const {group,outcomes} of results) {
    for(const job of group) {
      const delivered=job.devices.filter(d=>outcomes.get(d.id)?.ok).map(d=>d.id);
      const invalid=job.devices.filter(d=>outcomes.get(d.id)?.invalid).map(d=>d.id);
      const error=job.devices.map(d=>outcomes.get(d.id)).find(r=>r&&!r.ok&&!r.invalid)?.error??null;
      await finish(job,delivered,invalid,error);
    }
  }
  return deliveredCount;
}
