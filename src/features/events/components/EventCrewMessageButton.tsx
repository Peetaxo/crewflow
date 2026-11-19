import { useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import type { Contractor } from '../../../types';

const pluginName = 'CrewMessages';
const messages = registerPlugin<{
  compose(options: { recipients: string[] }): Promise<void>;
}>(pluginName);

function recipientNumber(phone: string) {
  const number = phone.trim().replace(/[\s().-]/g, '').replace(/^00/, '+');
  if (!/^\+?\d{6,15}$/.test(number)) return null;
  if (/^[1-9]\d{8}$/.test(number)) return '+420' + number;
  if (/^42[01]\d{9}$/.test(number)) return '+' + number;
  return number;
}

export function EventCrewMessageButton({ crew }: { crew: Pick<Contractor, 'phone' | 'name'>[] }) {
  const [opening, setOpening] = useState(false);
  if (!crew.length || !Capacitor.isPluginAvailable(pluginName)) return null;

  const numbers = new Set<string>();
  const missing: string[] = [];
  for (const person of crew) {
    const phone = recipientNumber(person.phone ?? '');
    if (phone) numbers.add(phone);
    else missing.push(person.name);
  }

  async function compose() {
    setOpening(true);
    try {
      await messages.compose({ recipients: [...numbers] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Zprávy se nepodařilo otevřít.');
    } finally {
      setOpening(false);
    }
  }

  return <div className="ml-auto min-w-0 max-w-full break-words text-right">
    <Button type="button" variant="outline" size="sm" disabled={opening || numbers.size === 0} onClick={compose}>
      <MessageSquare size={16} aria-hidden="true" />Napsat crew
    </Button>
    {missing.length > 0 && <p className="mt-1 text-xs text-muted-foreground">
      Bez platného čísla: {missing.join(', ')}
    </p>}
  </div>;
}
