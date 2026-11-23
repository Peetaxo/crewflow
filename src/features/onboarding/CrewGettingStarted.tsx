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
        <CardDescription>Od výběru první směny po odevzdání hodin.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ol className="list-decimal space-y-4 pl-5 text-sm leading-6 marker:font-semibold marker:text-[color:var(--nodu-accent)]">
          <li><strong>Přihlas se na směnu.</strong> V Akcích najdi nabídku, otevři detail směny a přihlas se.</li>
          <li><strong>Počkej na potvrzení.</strong> Koordinátor potvrdí tvoje zařazení. Potvrzení uvidíš v Přehledu a pod zvonečkem, kde najdeš i případné změny.</li>
          <li><strong>Odevzdej hodiny.</strong> Po směně v části Moje výkazy doplň hodiny a odešli je ke kontrole. Doplň i případné účtenky. Pokud vystavuješ vlastní fakturu, můžeš ji přiložit už k hodinám.</li>
        </ol>
        <div className="space-y-2 text-sm leading-6 text-[color:var(--nodu-text-soft)]">
          <p>Schválené podklady a hotová PDF najdeš ve Fakturách.</p>
          <p>V Nastavení si kdykoli otevřeš Jak používat nodu nebo doplníš profil a fakturační údaje.</p>
          <p>Pokud se zasekneš, ozvi se koordinátorovi směny nebo člověku, který tě pozval.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Button type="button" className="min-h-11 h-auto whitespace-normal" onClick={onContinue}>Přejít na přehled</Button>
          <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" onClick={onClose}>{fromSettings ? 'Zpět do nastavení' : 'Přeskočit'}</Button>
        </div>
      </CardContent>
    </Card>
  </main>;
}
