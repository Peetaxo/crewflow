import { Bell, CheckCheck, RefreshCw, Settings } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Sheet,SheetContent,SheetDescription,SheetHeader,SheetTitle } from '../../components/ui/sheet';
import { useAppContext } from '../../context/useAppContext';
import { useNotifications } from './notifications-context';

export function NotificationBell({expanded=false}:{expanded?:boolean}) {
  const store=useNotifications();
  if(!store?.ready) return null;
  const count=store.data?.unread??0;
  return <button type="button" aria-label={`Upozornění${count?`, ${count} nepřečtených`:''}`} onClick={()=>store.setPanelOpen(true)}
    className={`relative inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[color:var(--nodu-border)] px-3 text-[color:var(--nodu-text)] ${expanded?'w-full justify-start':''}`}>
    <span className="relative"><Bell size={19}/>{count>0&&<span className="absolute -right-2 -top-2 rounded-full bg-[color:var(--nodu-accent)] px-1 text-[10px] font-bold text-white">{count>99?'99+':count}</span>}</span>
    {expanded&&<span className="text-sm">Upozornění</span>}
  </button>;
}
export function NotificationCenter() {
  const store=useNotifications();const app=useAppContext();
  if(!store?.ready) return null;
  return <Sheet open={store.panelOpen} onOpenChange={store.setPanelOpen}>
    <SheetContent className={`${app.darkMode?'dark':''} flex w-full flex-col bg-[color:var(--nodu-paper)] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] sm:max-w-md`}>
      <SheetHeader><SheetTitle>Upozornění</SheetTitle><SheetDescription>Směny, výkazy a vyúčtování na jednom místě.</SheetDescription></SheetHeader>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={store.busy||!store.data?.unread} onClick={()=>{void store.markAll().catch(()=>{});}}><CheckCheck size={15}/>Přečíst vše</Button>
        <Button variant="ghost" size="sm" onClick={()=>{store.setPanelOpen(false);app.setSettingsSection('notifications');app.setCurrentTab('settings');}}><Settings size={15}/>Nastavení</Button>
      </div>
      {store.error&&<div role="alert" className="rounded-xl border p-3 text-sm">{store.error}<Button variant="link" onClick={()=>{void store.reload();}}><RefreshCw size={14}/>Zkusit znovu</Button></div>}
      {store.loading&&!store.data&&<p role="status">Načítám upozornění…</p>}
      {!store.loading&&!store.error&&store.data?.items.length===0&&<p className="py-12 text-center text-sm text-[color:var(--nodu-text-soft)]">Zatím nemáte žádná upozornění.</p>}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ul className="space-y-2">{store.data?.items.map(n=><li key={n.id}>
          <button type="button" disabled={store.busy} onClick={()=>{void store.open(n.id).catch(()=>{});}}
            className={`w-full rounded-2xl border p-4 text-left text-[color:var(--nodu-text)] ${n.read_at?'border-[color:var(--nodu-border)]':'border-[color:var(--nodu-accent)] bg-[color:rgb(var(--nodu-accent-rgb)/0.06)]'}`}>
            <div className="flex items-start gap-2">{!n.read_at&&<span aria-label="Nepřečtené" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--nodu-accent)]"/>}<span className="font-semibold">{n.title}</span></div>
            <p className="mt-1 text-sm text-[color:var(--nodu-text-soft)]">{n.body}</p>
            <time dateTime={n.created_at} className="mt-2 block text-xs text-[color:var(--nodu-text-soft)]">{new Date(n.created_at).toLocaleString('cs-CZ',{dateStyle:'short',timeStyle:'short'})}</time>
          </button>
        </li>)}</ul>
        {store.hasMore&&<Button className="my-3 w-full" variant="outline" disabled={store.busy} onClick={()=>{void store.more().catch(()=>{});}}>Starší upozornění</Button>}
      </div>
    </SheetContent>
  </Sheet>;
}
