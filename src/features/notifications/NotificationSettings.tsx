import { useEffect,useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card,CardContent,CardHeader,CardTitle } from '../../components/ui/card';
import { categoryLabels,type NotificationPreferences } from './contract';
import { enableNativePush,nativePushAvailable } from './native-push';
import { useNotifications } from './NotificationsProvider';
import { useAuth } from '../../app/providers/useAuth';

export function NotificationSettings() {
  const store=useNotifications();const auth=useAuth();
  const key=JSON.stringify([auth.currentUserId,auth.currentProfileId,auth.role]);
  return <NotificationSettingsForm key={key} store={store}/>;
}
function NotificationSettingsForm({store}:{store:ReturnType<typeof useNotifications>}) {
  const [draft,setDraft]=useState<NotificationPreferences|null>(store?.data?.preferences??null);
  const [connecting,setConnecting]=useState(false);
  useEffect(()=>{if(!draft&&store?.data) setDraft(store.data.preferences);},[draft,store?.data]);
  if(!store?.ready) return <p>Upozornění jsou dostupná po přihlášení k účtu NODU.</p>;
  if(!draft) return <div><p>{store.error||'Načítám nastavení…'}</p>{store.error&&<Button onClick={()=>{void store.reload();}}>Zkusit znovu</Button>}</div>;
  const update=(patch:Partial<NotificationPreferences>)=>setDraft({...draft,...patch});
  const connect=async()=>{
    setConnecting(true);
    try {const allowed=await enableNativePush();toast[allowed?'success':'error'](allowed?'Povolení je zapnuté. Telefon připojujeme k upozorněním.':'Upozornění nejsou povolená. Povolte je v nastavení telefonu.');}
    catch {toast.error('Upozornění se nepodařilo zapnout. Zkontrolujte nastavení telefonu a zkuste to znovu.');}
    finally {setConnecting(false);}
  };
  const categories=Object.entries(categoryLabels).filter(([id])=>!['staffing','system'].includes(id)||store.data?.items.some(n=>n.category===id));
  return <form className="max-w-3xl space-y-4" onSubmit={e=>{e.preventDefault();void store.save(draft).then(()=>toast.success('Nastavení upozornění uloženo.')).catch(()=>{});}}>
    <Card><CardHeader><CardTitle>Upozornění do telefonu</CardTitle></CardHeader><CardContent className="space-y-4">
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.push_enabled} onChange={e=>update({push_enabled:e.target.checked})}/>Posílat upozornění do telefonu</label>
      {nativePushAvailable()?<Button type="button" variant="outline" disabled={connecting} onClick={()=>{void connect();}}>{connecting?'Připojuji…':'Povolit upozornění na tomto telefonu'}</Button>:<p className="text-sm text-[color:var(--nodu-text-soft)]">Upozornění do telefonu zapnete v mobilní aplikaci. Historie pod zvonečkem je dostupná i na webu.</p>}
      <p className="text-sm text-[color:var(--nodu-text-soft)]">Vyberte zprávy do telefonu. Všechna upozornění se dál ukládají pod zvoneček.</p>
      {categories.map(([id,label])=><label key={id} className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" checked={draft.categories[id]!==false} onChange={e=>update({categories:{...draft.categories,[id]:e.target.checked}})}/>{label}</label>)}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Noční klid</CardTitle></CardHeader><CardContent className="space-y-4">
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.quiet_enabled} onChange={e=>update({quiet_enabled:e.target.checked})}/>Odložit běžná upozornění během nočního klidu</label>
      <div className="grid grid-cols-2 gap-4"><label className="text-sm">Od<Input type="time" required value={draft.quiet_from.slice(0,5)} onChange={e=>update({quiet_from:e.target.value})}/></label><label className="text-sm">Do<Input type="time" required value={draft.quiet_to.slice(0,5)} onChange={e=>update({quiet_to:e.target.value})}/></label></div>
      <label className="block text-sm">Časové pásmo<select className="mt-1 min-h-11 w-full rounded-xl border bg-[color:var(--nodu-bg)] p-2" value={draft.timezone} onChange={e=>update({timezone:e.target.value})}>{[...new Set(['Europe/Prague','Europe/Madrid','Europe/London',draft.timezone])].map(t=><option key={t}>{t}</option>)}</select></label>
      <p className="text-sm text-[color:var(--nodu-text-soft)]">Naléhavá změna nebo zrušení směny během následujících 24 hodin se odešle hned. Nastavení telefonu může doručení dále omezit.</p>
    </CardContent></Card>
    <Button disabled={store.busy||connecting} type="submit">{store.busy?'Ukládám…':'Uložit nastavení'}</Button>
  </form>;
}
