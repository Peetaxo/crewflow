import {createNotificationHandler} from './handler.ts';
declare const Deno:{env:{get:(key:string)=>string|undefined};serve:(handler:(req:Request)=>Promise<Response>)=>void};
Deno.serve(createNotificationHandler(key=>Deno.env.get(key)));
