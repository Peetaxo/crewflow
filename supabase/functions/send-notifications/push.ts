export type Device={id:string;platform:'ios'|'android';token:string;environment:'development'|'production'};
export type PushPayload={title:string;body:string;notificationId:string;notificationIds:string[];group:string;urgent:boolean};
export type PushResult={ok:boolean;invalid?:boolean;error?:string};
type Env=(key:string)=>string|undefined;
const encoder=new TextEncoder();
function base64url(input:Uint8Array|string) {
  const bytes=typeof input==='string'?encoder.encode(input):input;
  return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join('')).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
async function jwt(header:object,payload:object,pem:string,algorithm:'ES256'|'RS256') {
  const bytes=Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),c=>c.charCodeAt(0));
  const algo=algorithm==='ES256'?{name:'ECDSA',namedCurve:'P-256'}:{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'};
  const key=await crypto.subtle.importKey('pkcs8',bytes,algo,false,['sign']);
  const content=base64url(JSON.stringify(header))+'.'+base64url(JSON.stringify(payload));
  const signature=await crypto.subtle.sign(algorithm==='ES256'?{name:'ECDSA',hash:'SHA-256'}:{name:'RSASSA-PKCS1-v1_5'},key,encoder.encode(content));
  return content+'.'+base64url(new Uint8Array(signature));
}
export function configuredProviders(env:Env) {
  return {
    ios:Boolean(env('APNS_KEY_ID')&&env('APNS_TEAM_ID')&&env('APNS_PRIVATE_KEY')&&env('APNS_BUNDLE_ID')),
    android:Boolean(env('FCM_SERVICE_ACCOUNT')),
  };
}
export function createPushSender(env:Env,request:typeof fetch=fetch) {
  let appleToken:{value:string;expires:number}|undefined;
  let googleToken:{value:string;expires:number}|undefined;
  const send=async(device:Device,payload:PushPayload):Promise<PushResult>=>{
    const now=Math.floor(Date.now()/1000);
    try {
      if(device.platform==='ios') {
        if(!configuredProviders(env).ios) return {ok:false,error:'apns_not_configured'};
        if(!appleToken||appleToken.expires<now) appleToken={value:await jwt({alg:'ES256',kid:env('APNS_KEY_ID')},{iss:env('APNS_TEAM_ID'),iat:now},env('APNS_PRIVATE_KEY')!.replace(/\\n/g,'\n'),'ES256'),expires:now+3000};
        const response=await request(`https://${device.environment==='development'?'api.sandbox.push.apple.com':'api.push.apple.com'}/3/device/${encodeURIComponent(device.token)}`,{
          method:'POST',signal:AbortSignal.timeout(12000),headers:{authorization:`bearer ${appleToken.value}`,'apns-topic':env('APNS_BUNDLE_ID')!,
            'apns-push-type':'alert','apns-priority':payload.urgent?'10':'5','apns-collapse-id':payload.group.slice(0,64),'apns-expiration':String(now+3600)},
          body:JSON.stringify({aps:{alert:{title:payload.title,body:payload.body},sound:'default'},notificationId:payload.notificationId,notificationIds:payload.notificationIds}),
        });
        if(response.ok) return {ok:true};
        const body=await response.json().catch(()=>({}));
        return {ok:false,invalid:response.status===410||['BadDeviceToken','DeviceTokenNotForTopic','Unregistered'].includes(body.reason),error:`apns_${response.status}`};
      }
      if(!configuredProviders(env).android) return {ok:false,error:'fcm_not_configured'};
      const account=JSON.parse(env('FCM_SERVICE_ACCOUNT')!);
      if(!googleToken||googleToken.expires<now) {
        const assertion=await jwt({alg:'RS256',typ:'JWT'},{iss:account.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600},account.private_key,'RS256');
        const response=await request('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(10000),
          headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
        if(!response.ok) return {ok:false,error:`fcm_auth_${response.status}`};
        const token=await response.json();if(typeof token.access_token!=='string') return {ok:false,error:'fcm_auth_invalid'};
        googleToken={value:token.access_token,expires:now+Math.min(Number(token.expires_in)||300,3300)};
      }
      const response=await request(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,{
        method:'POST',signal:AbortSignal.timeout(12000),headers:{authorization:`Bearer ${googleToken.value}`,'Content-Type':'application/json'},
        body:JSON.stringify({message:{token:device.token,notification:{title:payload.title,body:payload.body},
          data:{notificationId:payload.notificationId,notificationIds:JSON.stringify(payload.notificationIds)},
          android:{priority:payload.urgent?'HIGH':'NORMAL',ttl:'3600s',collapse_key:payload.group,notification:{channel_id:'nodu',tag:payload.group}}}}),
      });
      if(response.ok) return {ok:true};
      const body=await response.json().catch(()=>({}));
      const invalid=body.error?.details?.some((x:{errorCode?:string})=>x.errorCode==='UNREGISTERED')===true;
      return {ok:false,invalid,error:`fcm_${response.status}`};
    } catch {return {ok:false,error:'push_transport_failed'};}
  };
  return send;
}
