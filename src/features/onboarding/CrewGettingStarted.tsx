import { useEffect, useRef } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '../../components/ui/card';

type Props = { onContinue: () => void; onClose: () => void; fromSettings: boolean };

export default function CrewGettingStarted({ onContinue, onClose, fromSettings }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);

  return <main className="h-full w-full overflow-y-auto text-[color:var(--nodu-text)]" style={{
    paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
    paddingLeft: 'max(1rem, env(safe-area-inset-left))',
    paddingRight: 'max(1rem, env(safe-area-inset-right))',
    paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
  }}>
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight">Jak používat nodu</h1>
        <CardDescription>Tři kroky pro první směnu. Průvodce můžeš kdykoliv otevřít v Nastavení.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ol className="list-decimal space-y-4 pl-5 text-sm leading-6 marker:font-semibold marker:text-[color:var(--nodu-accent)]">
          <li><strong>Vyber si směnu.</strong> V Moje směny najdi nabídku a přihlas se na směnu, která ti vyhovuje.</li>
          <li><strong>Počkej na potvrzení koordinátora.</strong> Přihláška ještě není potvrzená směna. Potvrzení uvidíš u směny.</li>
          <li><strong>Odevzdej odpracované hodiny a účtenky.</strong> Po směně je doplň v aplikaci ke kontrole.</li>
        </ol>
        <p className="text-sm leading-6 text-[color:var(--nodu-text-soft)]">Profil a fakturační údaje můžeš doplnit později v Nastavení.</p>
        <div className="flex flex-col gap-3">
          <Button type="button" className="min-h-11 h-auto whitespace-normal" onClick={onContinue}>Zobrazit směny</Button>
          <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={onClose}>{fromSettings ? 'Zpět do nastavení' : 'Přeskočit'}</Button>
        </div>
      </CardContent>
    </Card>
  </main>;
}
