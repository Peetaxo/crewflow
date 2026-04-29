import { useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  FileText,
  Receipt,
  Search,
  Users,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';

type WelcomeViewProps = {
  onLogin: () => void;
  onRegister: () => void;
};

type ShowcaseMetric = {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'error' | 'accent';
};

type ShowcaseRow = {
  title: string;
  meta: string;
  badge: string;
  amount?: string;
};

type ShowcaseItem = {
  title: string;
  kicker: string;
  heading: string;
  description: string;
  navActive: string;
  badge: string;
  metrics: ShowcaseMetric[];
  rows: ShowcaseRow[];
  mode?: string;
};

const showcaseItems: ShowcaseItem[] = [
  {
    title: 'Dashboard',
    kicker: 'Pilot overview',
    heading: 'Dashboard',
    description: 'Stejny prehled, jaky vidi vedeni a provoz: fronty ke schvaleni, fakturace, uctenky a akce, ktere nejsou plne obsazene.',
    navActive: 'Dashboard',
    badge: 'Pohled COO',
    metrics: [
      { label: 'Vykazy cekaji na me', value: '12', tone: 'warning' },
      { label: 'Faktury v procesu', value: '4', tone: 'warning' },
      { label: 'Uctenky v procesu', value: '3', tone: 'accent' },
      { label: 'Schvalene hodiny', value: '186h', tone: 'success' },
      { label: 'Akce bez obsazeni', value: '2', tone: 'error' },
    ],
    rows: [
      { title: 'Anna K.', meta: 'Festival instalace · LIVE-0426', badge: '7.5h', amount: '2 250 Kc' },
      { title: 'Petr S.', meta: 'Brand roadshow · ROAD-1120', badge: '6.0h', amount: '1 800 Kc' },
      { title: 'Expo deinstal', meta: '30. 4. - Praha · 16/20 crew', badge: 'chybi crew' },
    ],
  },
  {
    title: 'Akce',
    kicker: 'Event Planner',
    heading: 'Festival instalace',
    description: 'Detail akce drzi Job Number, obsazenost, faze dne, crew, timelogy, uctenky a financni souhrn v jednom kontextu.',
    navActive: 'Akce',
    badge: 'LIVE-0426',
    metrics: [
      { label: 'Obsazenost', value: '18/20', tone: 'warning' },
      { label: 'Celkem hodiny', value: '64.5h', tone: 'success' },
      { label: 'Naklady na crew', value: '19 350 Kc', tone: 'accent' },
      { label: 'Uctenky', value: '3 840 Kc', tone: 'accent' },
    ],
    rows: [
      { title: 'Martin H.', meta: 'Crew Lead · instal + provoz', badge: 'potvrzeno' },
      { title: 'Runner', meta: '2 pozice · 07:00 - 18:00', badge: 'chybi' },
      { title: 'Technik', meta: '3 pozice · deinstal', badge: 'OK' },
    ],
  },
  {
    title: 'Timelogy',
    kicker: 'Timesheets',
    heading: 'Timelogy',
    description: 'Schvalovani bezi po Job Number nebo po lidech. CrewHead posila vykaz COO, COO uzavira kontrolu pro fakturaci.',
    navActive: 'Timelogy',
    badge: '',
    mode: 'Po Job Number',
    metrics: [
      { label: 'Vse', value: '48' },
      { label: 'Ceka CH', value: '8', tone: 'warning' },
      { label: 'Ceka COO', value: '4', tone: 'warning' },
      { label: 'Schvaleno', value: '23', tone: 'success' },
    ],
    rows: [
      { title: 'LIVE-0426', meta: 'Festival instalace · 6 vykazu', badge: 'Schvalit vse' },
      { title: 'Anna K.', meta: '30. 4. · 09:00 - 16:30 · instal', badge: 'pending CH', amount: '7.5h' },
      { title: 'Tomas B.', meta: '30. 4. · 18:00 - 23:30 · provoz', badge: 'pending COO', amount: '5.5h' },
    ],
  },
  {
    title: 'Faktury',
    kicker: 'Billing',
    heading: 'Faktury',
    description: 'Self-billing ukazuje jen skutecne vytvorene faktury. Schvalene timelogy se preklapi do draftu, PDF a stavu platby.',
    navActive: 'Faktury',
    badge: 'Self-billing',
    metrics: [
      { label: 'Ceka ve fakturaci', value: '4', tone: 'warning' },
      { label: '72h na namitku', value: '2', tone: 'accent' },
      { label: 'Zaplaceno', value: '18', tone: 'success' },
    ],
    rows: [
      { title: 'SF-2026-NOVAK-T-0001', meta: 'Anna K. · LIVE-0426', badge: 'odeslano', amount: '9 840 Kc' },
      { title: 'SF-2026-SVOBODA-P-0002', meta: 'Petr S. · ROAD-1120', badge: 'PDF', amount: '7 200 Kc' },
      { title: 'SF-2026-BARTOS-T-0003', meta: 'Vice akci · cestovne + uctenky', badge: 'zaplaceno', amount: '12 450 Kc' },
    ],
  },
  {
    title: 'Crew',
    kicker: 'People',
    heading: 'Crew',
    description: 'Crew profil drzi sazbu, tagy, spolehlivost, kontakty, fakturacni udaje a navaznost na smeny, timelogy a vyplaty.',
    navActive: 'Crew',
    badge: 'Sazby a tagy',
    metrics: [
      { label: 'Aktivni crew', value: '42', tone: 'success' },
      { label: 'Ridicu', value: '14', tone: 'accent' },
      { label: 'Overit', value: '5', tone: 'warning' },
    ],
    rows: [
      { title: 'Anna K.', meta: 'Praha · Ridic · Spolehlivy', badge: '350 Kc/h' },
      { title: 'Petr S.', meta: 'Brno · Technik · Overit', badge: '320 Kc/h' },
      { title: 'Tomas B.', meta: 'Plzen · Runner · Spolehlivy', badge: '280 Kc/h' },
    ],
  },
];

const roles = [
  ['Vedeni', 'Vidi fronty ke schvaleni, naklady na akce, stav fakturace a rizika v obsazeni bez prochazeni chatu.'],
  ['Operativa', 'Ridi akce, crew, terminy, faze dne, uctenky a timelogy v jednom provoznim toku.'],
  ['Crew', 'Ma svoje smeny, vlastni timelogy, uctenky, faktury a prehled o tom, co je zaplacene.'],
];

const reveal = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.18 },
  transition: { duration: 0.58, ease: [0.2, 0.8, 0.2, 1] },
} as const;

const toneClass = (tone: ShowcaseMetric['tone'] = 'accent') => {
  if (tone === 'success') return 'border-[color:var(--nodu-success-border)] bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]';
  if (tone === 'warning') return 'border-[color:var(--nodu-warning-border)] bg-[color:var(--nodu-warning-bg)] text-[color:var(--nodu-warning-text)]';
  if (tone === 'error') return 'border-[color:var(--nodu-error-border)] bg-[color:var(--nodu-error-bg)] text-[color:var(--nodu-error-text)]';
  return 'border-[color:rgb(var(--nodu-accent-rgb)/0.22)] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]';
};

const scrollToId = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const WelcomeView = ({ onLogin, onRegister }: WelcomeViewProps) => {
  const [activeShowcase, setActiveShowcase] = useState(0);
  const showcaseRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startScroll: number; pointerId: number } | null>(null);

  const scrollShowcaseTo = (index: number) => {
    const nextIndex = Math.min(Math.max(index, 0), showcaseItems.length - 1);
    setActiveShowcase(nextIndex);
    const card = showcaseRef.current?.querySelector<HTMLElement>(`[data-showcase-card="${nextIndex}"]`);
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const syncShowcaseIndex = () => {
    const track = showcaseRef.current;
    if (!track) return;

    const trackCenter = track.getBoundingClientRect().left + track.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    track.querySelectorAll<HTMLElement>('[data-showcase-card]').forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - trackCenter);
      if (distance < closestDistance) {
        closestIndex = index;
        closestDistance = distance;
      }
    });

    setActiveShowcase(closestIndex);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[color:var(--nodu-paper)] text-[color:var(--nodu-text)]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_82%_10%,rgb(var(--nodu-accent-rgb)/0.11),transparent_26%),linear-gradient(180deg,rgb(var(--nodu-surface-rgb)/0.98),rgb(var(--nodu-paper-strong-rgb)/0.96))]" />

      <div className="relative mx-auto w-[min(1180px,calc(100%-32px))] py-6 sm:w-[min(1180px,calc(100%-48px))]">
        <Header onLogin={onLogin} onRegister={onRegister} />

        <section className="grid min-h-[88vh] scroll-mt-28 items-center gap-12 py-24 lg:grid-cols-[0.78fr_1.22fr] lg:gap-16 lg:py-28">
          <motion.div {...reveal}>
            <div className="nodu-dashboard-kicker text-[color:var(--nodu-accent)]">Postavene primo na miru</div>
            <h1 className="mt-4 max-w-[740px] text-[clamp(50px,6.1vw,88px)] font-semibold leading-[0.98] tracking-[-0.045em]">
              Cely provoz od akce po fakturu.
            </h1>
            <p className="mt-7 max-w-xl text-[19px] leading-relaxed text-[color:var(--nodu-text-soft)]">
              Nodu propojuje akce, crew, timelogy, uctenky, schvalovani a self-billing. Verejna stranka ukazuje produkt tak, jak opravdu funguje uvnitr.
            </p>
          </motion.div>

          <motion.div {...reveal}>
            <HeroBrandCard />
          </motion.div>
        </section>

        <section id="proc" className="grid min-h-[82vh] scroll-mt-28 items-center gap-12 py-20 lg:grid-cols-[0.85fr_1.15fr] lg:py-28">
          <motion.div {...reveal}>
            <div className="nodu-dashboard-kicker text-[color:var(--nodu-accent)]">Proc vzniklo Nodu</div>
            <h2 className="mt-4 max-w-2xl text-[clamp(40px,5vw,72px)] font-semibold leading-[1] tracking-[-0.045em]">Podle realneho provozu.</h2>
            <p className="mt-7 max-w-xl text-[18px] leading-relaxed text-[color:var(--nodu-text-soft)]">
              Nodu vzniklo pro tymy, ktere potrebuji rychle videt, kdo je obsazeny, co ceka na schvaleni a jak provoz navazuje na finance. Misto rucniho skladani podkladu drzi kazdy krok ve stejnem kontextu.
            </p>
          </motion.div>
          <motion.div {...reveal} className="nodu-panel rounded-[28px] p-6">
            {[
              ['1', 'Job Number jako spojovaci bod', 'Projekt, akce, timelog, uctenka i faktura drzi stejny kontext.'],
              ['2', 'Role vidi jen to, co potrebuji', 'Crew, CrewHead, COO a vedeni pracuji nad stejnymi daty jinou optikou.'],
              ['3', 'Fakturace navazuje na schvaleni', 'Self-billing je prirozeny konec toku, ne oddelena agenda bokem.'],
            ].map(([number, title, text]) => (
              <div key={number} className="grid grid-cols-[42px_1fr] gap-4 border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] py-5 last:border-b-0">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[color:var(--nodu-text)] font-semibold text-[color:var(--nodu-paper)]">{number}</span>
                <div>
                  <strong className="text-lg text-[color:var(--nodu-text)]">{title}</strong>
                  <p className="mt-1 text-[15px] leading-relaxed text-[color:var(--nodu-text-soft)]">{text}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </section>

        <section id="workflow" className="min-h-[82vh] scroll-mt-28 py-20 lg:py-28">
          <motion.div {...reveal}>
            <div className="nodu-dashboard-kicker text-[color:var(--nodu-accent)]">Workflow</div>
            <h2 className="mt-4 max-w-3xl text-[clamp(40px,5vw,72px)] font-semibold leading-[1] tracking-[-0.045em]">Kazdy krok predava kontext dalsimu.</h2>
            <p className="mt-7 max-w-2xl text-[18px] leading-relaxed text-[color:var(--nodu-text-soft)]">
              Nodu neni jen seznam akci. Je to tok od planovani pres vykazy az po finance.
            </p>
          </motion.div>
          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {[
              ['01', 'Projekt a akce', 'Klient, projekt, termin, mesto, kontakt, dresscode a faze dne vzniknou jako jeden provozni celek.'],
              ['02', 'Crew a timelogy', 'Obsazeni a odpracovane hodiny zustavaji pripojene k akci i Job Numberu.'],
              ['03', 'Schvaleni a faktura', 'CrewHead kontroluje, COO uzavira, self-billing vytvari fakturu a PDF.'],
            ].map(([number, title, text]) => (
              <motion.div key={number} {...reveal} className="nodu-panel min-h-[270px] rounded-[28px] p-6">
                <span className="grid h-14 w-14 place-items-center rounded-[20px] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] font-semibold text-[color:var(--nodu-accent)]">{number}</span>
                <h3 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">{title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[color:var(--nodu-text-soft)]">{text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="ukazka" className="scroll-mt-28 py-20 lg:py-28">
          <motion.div {...reveal} className="max-w-4xl">
            <div className="nodu-dashboard-kicker text-[color:var(--nodu-accent)]">Realna aplikace</div>
            <h2 className="mt-4 text-[clamp(40px,5vw,72px)] font-semibold leading-[1] tracking-[-0.045em]">Ukazky odpovidaji skutecnym obrazovkam.</h2>
            <p className="mt-7 max-w-2xl text-[18px] leading-relaxed text-[color:var(--nodu-text-soft)]">
              Misto obecnych mockupu ukazujeme stejny jazyk, karty, badge a fronty, ktere se pouzivaji uvnitr aplikace.
            </p>
          </motion.div>

          <div
            ref={showcaseRef}
            className="mt-12 flex cursor-grab snap-x snap-mandatory gap-7 overflow-x-auto scroll-smooth pb-8 [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
            onPointerDown={(event) => {
              const track = showcaseRef.current;
              if (!track || (event.pointerType === 'mouse' && event.button !== 0)) return;
              dragState.current = { startX: event.clientX, startScroll: track.scrollLeft, pointerId: event.pointerId };
              track.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const track = showcaseRef.current;
              const drag = dragState.current;
              if (!track || !drag || drag.pointerId !== event.pointerId) return;
              track.scrollLeft = drag.startScroll - (event.clientX - drag.startX);
            }}
            onPointerUp={(event) => {
              const track = showcaseRef.current;
              const drag = dragState.current;
              if (!track || !drag || drag.pointerId !== event.pointerId) return;
              dragState.current = null;
              if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
              syncShowcaseIndex();
            }}
            onScroll={() => window.requestAnimationFrame(syncShowcaseIndex)}
          >
            {showcaseItems.map((item, index) => (
              <article key={item.title} data-showcase-card={index} className="flex-[0_0_min(920px,calc(100vw-64px))] snap-center">
                <AppWindow active={item.navActive}>
                  <ProductScreen item={item} />
                </AppWindow>
              </article>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              {showcaseItems.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  aria-label={`Zobrazit ${item.title}`}
                  className={`h-2.5 rounded-full transition-all ${activeShowcase === index ? 'w-9 bg-[color:var(--nodu-accent)]' : 'w-2.5 bg-[color:rgb(var(--nodu-text-rgb)/0.2)]'}`}
                  onClick={() => scrollShowcaseTo(index)}
                />
              ))}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={() => scrollShowcaseTo(activeShowcase - 1)}><ArrowLeft size={18} /></Button>
              <Button type="button" size="icon" className="rounded-full" onClick={() => scrollShowcaseTo(activeShowcase + 1)}><ArrowRight size={18} /></Button>
            </div>
          </div>
        </section>

        <section className="-mx-[calc((100vw-min(1180px,calc(100vw-48px)))/2)] bg-[color:var(--nodu-text)] px-[calc((100vw-min(1180px,calc(100vw-48px)))/2)] py-24 text-[color:var(--nodu-paper)] lg:py-28">
          <motion.div {...reveal}>
            <div className="nodu-dashboard-kicker text-[color:rgb(var(--nodu-accent-rgb)/0.92)]">Co Nodu hlida</div>
            <h2 className="mt-4 max-w-4xl text-[clamp(40px,5vw,72px)] font-semibold leading-[1] tracking-[-0.045em]">Blokace jsou videt driv, nez se zacnou resit pozde.</h2>
            <p className="mt-7 max-w-2xl text-[18px] leading-relaxed text-[color:rgb(var(--nodu-paper-rgb)/0.72)]">
              Appka uz dnes pracuje s daty, ze kterych jde skladat provozni prehledy: obsazenost akci, stavy timelogu, uctenky, faktury, hodiny a naklady.
            </p>
          </motion.div>
          <div className="mt-12 grid gap-5 md:grid-cols-4">
            {[
              [Users, 'Chybejici crew', 'Obsazenost podle akce a faze dne.', 'akce'],
              [Clock3, 'Cekajici timelogy', 'Fronty CH a COO podle role.', 'schvalovani'],
              [Receipt, 'Uctenky v procesu', 'Submitted, approved a reimbursed.', 'uctenky'],
              [FileText, 'Self-billing', 'Draft, odeslano, PDF a zaplaceno.', 'fakturace'],
            ].map(([Icon, title, text, tag]) => (
              <motion.div key={String(title)} {...reveal} className="min-h-[230px] rounded-[26px] border border-white/10 bg-white/5 p-6">
                <Icon className="mb-8 text-[color:rgb(var(--nodu-accent-rgb)/0.92)]" size={26} />
                <strong className="block text-2xl">{String(title)}</strong>
                <p className="mt-4 text-[15px] leading-relaxed text-[color:rgb(var(--nodu-paper-rgb)/0.72)]">{String(text)}</p>
                <span className="mt-5 inline-flex rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-[color:rgb(var(--nodu-paper-rgb)/0.82)]">{String(tag)}</span>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="role" className="scroll-mt-28 py-20 lg:py-28">
          <motion.div {...reveal}>
            <div className="nodu-dashboard-kicker text-[color:var(--nodu-accent)]">Role</div>
            <h2 className="mt-4 max-w-4xl text-[clamp(40px,5vw,72px)] font-semibold leading-[1] tracking-[-0.045em]">Jeden system, ruzne pohledy.</h2>
          </motion.div>
          <div className="mt-12 grid gap-7 lg:grid-cols-3">
            {roles.map(([title, text], index) => (
              <motion.div key={title} {...reveal} className={`nodu-panel min-h-[250px] rounded-[28px] p-7 ${index === 1 ? 'lg:mt-12' : ''}`}>
                <h3 className="text-3xl font-semibold tracking-[-0.03em]">{title}</h3>
                <p className="mt-7 text-[16px] leading-relaxed text-[color:var(--nodu-text-soft)]">{text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="py-20 lg:py-28">
          <motion.div {...reveal}>
            <div className="nodu-dashboard-kicker text-[color:var(--nodu-accent)]">Prehledy a grafy</div>
            <h2 className="mt-4 max-w-4xl text-[clamp(40px,5vw,72px)] font-semibold leading-[1] tracking-[-0.045em]">Data, ktera pomahaji ridit provoz.</h2>
            <p className="mt-7 max-w-2xl text-[18px] leading-relaxed text-[color:var(--nodu-text-soft)]">
              Prehledy ukazuji, kde se blizi kapacitni problem, kolik prace uz proslo schvalenim a jak se provozni rozhodnuti propisuji do nakladu.
            </p>
          </motion.div>
          <div className="mt-12 grid gap-7 lg:grid-cols-3">
            <InsightCard title="Vedeni" icon={<BarChart3 size={22} />} text="Naklady podle akce, hodiny podle projektu, fronta schvaleni a fakturace v procesu." />
            <InsightCard title="Operativa" icon={<CheckCircle2 size={22} />} text="Obsazenost, chybejici role, cekajici vykazy a prace, ktera blokuje dalsi krok." />
            <CrewInsightCard />
          </div>
        </section>

        <section className="grid min-h-[56vh] place-items-center py-20 lg:py-28">
          <motion.div {...reveal} className="nodu-panel w-[min(860px,100%)] rounded-[30px] p-10 text-center sm:p-14">
            <div className="nodu-dashboard-kicker text-[color:var(--nodu-accent)]">Vstup do Nodu</div>
            <h2 className="mt-4 text-[clamp(40px,5vw,72px)] font-semibold leading-[1] tracking-[-0.045em]">Mate pristup do Nodu?</h2>
            <p className="mx-auto mt-7 max-w-xl text-[18px] leading-relaxed text-[color:var(--nodu-text-soft)]">Prihlaste se do provozniho systemu, nebo pozadejte o pristup pro svuj tym.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button type="button" variant="outline" className="h-11 rounded-full px-6 font-semibold" onClick={onLogin}>Prihlasit se</Button>
              <Button type="button" className="h-11 rounded-full px-6 font-semibold" onClick={onRegister}>Pozadat o pristup</Button>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
};

const Header = ({ onLogin, onRegister }: WelcomeViewProps) => (
  <header className="sticky top-4 z-30 grid min-h-[64px] grid-cols-[auto_auto] items-center gap-5 rounded-[22px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.86)] px-4 py-3 shadow-[0_18px_46px_rgb(var(--nodu-text-rgb)/0.08)] backdrop-blur lg:grid-cols-[auto_1fr_auto] lg:px-6">
    <button type="button" className="flex items-center gap-2 text-left" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      <img src="/nodu-wordmark.svg" alt="nodu." className="h-7 w-auto" />
    </button>
    <nav className="hidden items-center gap-6 text-sm font-semibold text-[color:var(--nodu-text-soft)] lg:flex">
      <button type="button" className="hover:text-[color:var(--nodu-text)]" onClick={() => scrollToId('proc')}>Proc Nodu</button>
      <button type="button" className="hover:text-[color:var(--nodu-text)]" onClick={() => scrollToId('workflow')}>Workflow</button>
      <button type="button" className="hover:text-[color:var(--nodu-text)]" onClick={() => scrollToId('ukazka')}>Ukazka</button>
      <button type="button" className="hover:text-[color:var(--nodu-text)]" onClick={() => scrollToId('role')}>Role</button>
    </nav>
    <div className="ml-auto flex items-center gap-2">
      <Button type="button" variant="outline" className="h-10 rounded-full px-5 font-semibold" onClick={onLogin}>
        Prihlasit
      </Button>
      <Button type="button" className="hidden h-10 rounded-full px-5 font-semibold sm:inline-flex" onClick={onRegister}>
        Pozadat o pristup
      </Button>
    </div>
  </header>
);

const HeroBrandCard = () => (
  <div className="relative overflow-hidden rounded-[34px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.9)] p-8 shadow-[0_28px_70px_rgb(var(--nodu-text-rgb)/0.12)] sm:p-10">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgb(var(--nodu-accent-rgb)/0.16),transparent_32%)]" />
    <div className="relative min-h-[460px]">
      <div className="flex items-center gap-4">
        <img src="/nodu-mark.svg" alt="" className="h-16 w-16" />
        <img src="/nodu-wordmark.svg" alt="nodu." className="h-10 w-auto" />
      </div>

      <p className="mt-12 max-w-lg text-[clamp(30px,3vw,48px)] font-semibold leading-[1.05] tracking-[-0.04em] text-[color:var(--nodu-text)]">
        Jedno misto, kde se propoji akce, lide, schvalovani i penize.
      </p>
      <p className="mt-6 max-w-md text-[17px] leading-relaxed text-[color:var(--nodu-text-soft)]">
        Nodu drzi provozni kontext pohromade od prvniho planu az po self-billing.
      </p>

      <div className="absolute bottom-0 left-0 right-0 grid gap-3 sm:grid-cols-2">
        {[
          ['LIVE-0426', 'Job Number jako spolecna linka'],
          ['18/20 crew', 'obsazenost bez dohledavani'],
          ['12 vykazu', 'fronta pro schvaleni'],
          ['self-billing', 'navazna fakturace'],
        ].map(([value, label]) => (
          <div key={value} className="rounded-[22px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.82)] p-4 shadow-[0_12px_28px_rgb(var(--nodu-text-rgb)/0.06)]">
            <div className="text-[13px] font-semibold text-[color:var(--nodu-accent)]">{value}</div>
            <div className="mt-1 text-[12px] leading-5 text-[color:var(--nodu-text-soft)]">{label}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const AppWindow = ({ active, children, className = '' }: { active: string; children: ReactNode; className?: string }) => (
  <div className={`overflow-hidden rounded-[30px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.96)] shadow-[0_28px_70px_rgb(var(--nodu-text-rgb)/0.12)] ${className}`}>
    <div className="grid min-h-[520px] md:grid-cols-[190px_1fr] xl:grid-cols-[220px_1fr]">
      <MockSidebar active={active} />
      <div className="min-w-0 bg-[color:rgb(var(--nodu-surface-rgb)/0.88)] p-5 sm:p-6">
        {children}
      </div>
    </div>
  </div>
);

const MockSidebar = ({ active }: { active: string }) => {
  const items = ['Dashboard', 'Moje smeny', 'Akce', 'Crew', 'Timelogy', 'Faktury', 'Uctenky'];

  return (
    <aside className="hidden border-r border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[linear-gradient(180deg,rgb(var(--nodu-paper-rgb)/0.96),rgb(var(--nodu-paper-strong-rgb)/0.92))] p-4 md:block">
      <div className="mb-4 flex items-center gap-3">
        <img src="/nodu-mark.svg" alt="" className="h-8 w-8" />
        <img src="/nodu-wordmark.svg" alt="nodu." className="h-5 w-auto" />
      </div>
      <div className="nodu-sidebar-control mb-4 flex items-center gap-2 rounded-xl border border-[color:var(--nodu-border)] px-3 py-2.5 text-[11px] text-[color:var(--nodu-text-soft)]">
        <Search size={14} />
        Hledat akci, job...
      </div>
      <div className="mb-4 rounded-xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.72)] px-3 py-2 text-[11px] font-semibold text-[color:var(--nodu-accent)]">
        Prihlasena role: COO
      </div>
      <nav className="space-y-1">
        {items.map((item) => {
          const isActive = item === active;
          return (
            <div key={item} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-[12px] ${isActive ? 'border-[color:rgb(var(--nodu-accent-rgb)/0.24)] bg-[color:rgb(var(--nodu-accent-rgb)/0.1)] font-semibold text-[color:var(--nodu-accent)]' : 'border-transparent text-[color:var(--nodu-text-soft)]'}`}>
              <span>{item}</span>
              {(item === 'Timelogy' || item === 'Faktury') && <span className="rounded-full bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] px-1.5 text-[10px] text-[color:var(--nodu-accent)]">{item === 'Timelogy' ? 12 : 4}</span>}
            </div>
          );
        })}
      </nav>
    </aside>
  );
};

const DashboardPreview = () => (
  <div className="nodu-dashboard-shell p-0">
    <div className="mb-6">
      <p className="nodu-dashboard-kicker">Pilot overview</p>
      <h2 className="nodu-dashboard-heading">Dashboard</h2>
      <p className="nodu-dashboard-lead">Pohled COO · Duben 2026</p>
    </div>
    <MetricGrid
      metrics={[
        { label: 'Vykazy cekaji na me', value: '12', tone: 'warning' },
        { label: 'Faktury v procesu', value: '4', tone: 'warning' },
        { label: 'Uctenky v procesu', value: '3', tone: 'accent' },
        { label: 'Schvalene hodiny', value: '186h', tone: 'success' },
        { label: 'Akce bez obsazeni', value: '2', tone: 'error' },
      ]}
    />
    <div className="mt-5 grid gap-4 2xl:grid-cols-5">
      <div className="nodu-dashboard-panel rounded-[28px] p-5 2xl:col-span-3">
        <h3 className="nodu-dashboard-panel-title mb-3">Timelogy ke zpracovani</h3>
        <div className="space-y-2">
          {[
            ['AK', 'Anna K.', 'Festival instalace', 'LIVE-0426', '7.5h', '2 250 Kc'],
            ['PS', 'Petr S.', 'Brand roadshow', 'ROAD-1120', '6.0h', '1 800 Kc'],
            ['TB', 'Tomas B.', 'Expo deinstal', 'EXPO-0904', '8.0h', '2 400 Kc'],
          ].map(([initials, name, event, job, hours, amount], index) => (
            <div key={name} className="nodu-dashboard-row flex items-center gap-3 rounded-[20px] border px-3 py-3">
              <div className="av h-8 w-8 text-[10px]" style={{ backgroundColor: ['#E1F5EE', '#EEEDFE', '#FAEEDA'][index], color: ['#0F6E56', '#534AB7', '#854F0B'][index] }}>{initials}</div>
              <div className="min-w-0 flex-1">
                <div className="nodu-dashboard-row-title">{name}</div>
                <div className="nodu-dashboard-row-meta mt-1 gap-2">
                  <span>{event}</span>
                  <span className="jn nodu-job-badge">{job}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="nodu-dashboard-row-value">{hours}</div>
                <div className="text-[11px] text-[color:var(--nodu-text-soft)]">{amount}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="nodu-dashboard-panel rounded-[28px] p-5 2xl:col-span-2">
        <h3 className="nodu-dashboard-panel-title mb-3">Nadchazejici akce</h3>
        <EventMiniCard job="LIVE-0426" title="Festival instalace" meta="30. 4. - Praha" crew="18/20 crew" percent={90} warning />
        <EventMiniCard job="ROAD-1120" title="Brand roadshow" meta="2. 5. - Brno" crew="12/12 crew" percent={100} />
      </div>
    </div>
  </div>
);

const ProductScreen = ({ item }: { item: ShowcaseItem }) => (
  <div className="min-h-[560px]">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="nodu-dashboard-kicker">{item.kicker}</div>
        <h3 className="mt-1 text-[32px] font-semibold leading-none tracking-[-0.04em] text-[color:var(--nodu-text)]">{item.heading}</h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--nodu-text-soft)]">{item.description}</p>
      </div>
      {item.badge && <span className="jn nodu-job-badge px-3 py-1.5 text-xs">{item.badge}</span>}
    </div>
    {item.mode && (
      <div className="mb-4 inline-flex rounded-[18px] border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.92)] p-1 shadow-[0_12px_28px_rgb(var(--nodu-text-rgb)/0.08)]">
        <span className="rounded-[14px] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] px-3.5 py-2 text-[11px] font-medium text-[color:var(--nodu-accent)]">Po Job Number</span>
        <span className="px-3.5 py-2 text-[11px] font-medium text-[color:var(--nodu-text-soft)]">Po lidech</span>
      </div>
    )}
    <MetricGrid metrics={item.metrics} />
    <div className="nodu-panel mt-5 rounded-[28px] p-5">
      <div className="mb-4 flex items-center justify-between border-b border-[color:rgb(var(--nodu-text-rgb)/0.08)] pb-3">
        <strong className="text-sm text-[color:var(--nodu-text)]">{item.title === 'Akce' ? 'Prirazena Crew' : item.title === 'Crew' ? 'Lide a sazby' : item.title === 'Faktury' ? 'Self-billing system' : item.title === 'Timelogy' ? 'Job Number' : 'Pracovni fronta'}</strong>
        <span className="text-[11px] text-[color:var(--nodu-text-soft)]">{item.rows.length} polozky</span>
      </div>
      <div className="space-y-3">
        {item.rows.map((row, index) => (
          <div key={`${item.title}-${row.title}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-[color:rgb(var(--nodu-text-rgb)/0.08)] bg-[color:rgb(var(--nodu-surface-rgb)/0.82)] px-3 py-3">
            <div className="av h-8 w-8 text-[10px]" style={{ backgroundColor: ['#E1F5EE', '#EEEDFE', '#E6F1FB'][index % 3], color: ['#0F6E56', '#534AB7', '#185FA5'][index % 3] }}>
              {row.title.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-[color:var(--nodu-text)]">{row.title}</div>
              <div className="mt-0.5 truncate text-xs text-[color:var(--nodu-text-soft)]">{row.meta}</div>
            </div>
            <div className="text-right">
              <span className="inline-flex rounded-full bg-[color:rgb(var(--nodu-accent-rgb)/0.1)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--nodu-accent)]">{row.badge}</span>
              {row.amount && <div className="mt-1 text-[11px] font-semibold text-[color:var(--nodu-text)]">{row.amount}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MetricGrid = ({ metrics }: { metrics: ShowcaseMetric[] }) => (
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {metrics.map((metric) => (
      <div key={metric.label} className={`rounded-[20px] border p-4 ${toneClass(metric.tone)}`}>
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">{metric.label}</div>
        <div className="mt-3 text-[26px] font-semibold leading-none text-[color:var(--nodu-text)]">{metric.value}</div>
      </div>
    ))}
  </div>
);

const EventMiniCard = ({ job, title, meta, crew, percent, warning = false }: { job: string; title: string; meta: string; crew: string; percent: number; warning?: boolean }) => (
  <div className="nodu-dashboard-row mb-3 rounded-[22px] border px-3 pb-3 pt-3">
    <div className="mb-1.5 flex items-center gap-2">
      <span className="jn nodu-job-badge">{job}</span>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${warning ? 'bg-[color:var(--nodu-warning-bg)] text-[color:var(--nodu-warning-text)]' : 'bg-[color:var(--nodu-success-bg)] text-[color:var(--nodu-success-text)]'}`}>{warning ? 'chybi crew' : 'plne'}</span>
    </div>
    <div className="nodu-dashboard-row-title">{title}</div>
    <div className="nodu-dashboard-row-meta mt-0.5">{meta}</div>
    <div className="nodu-dashboard-progress-track mt-2">
      <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: warning ? 'var(--nodu-warning-text)' : 'var(--nodu-success-text)' }} />
    </div>
    <div className="mt-1 text-[10px] text-[color:var(--nodu-text-soft)]">{crew}</div>
  </div>
);

const InsightCard = ({ title, text, icon }: { title: string; text: string; icon: ReactNode }) => (
  <motion.div {...reveal} className="nodu-panel min-h-[430px] rounded-[28px] p-7">
    <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]">{icon}</div>
    <h3 className="mt-6 text-3xl font-semibold tracking-[-0.03em]">{title}</h3>
    <p className="mt-3 text-[16px] leading-relaxed text-[color:var(--nodu-text-soft)]">{text}</p>
    {title === 'Vedeni' ? <FinancePreview /> : <OperationsPreview />}
  </motion.div>
);

const FinancePreview = () => (
  <div className="mt-7 rounded-3xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.82)] p-5">
    <strong>Financni statistika</strong>
    <div className="mt-4 grid grid-cols-2 gap-3">
      {[
        ['920k', 'rozpocet'],
        ['680k', 'naklady'],
        ['240k', 'rezerva'],
        ['26%', 'marze'],
      ].map(([value, label]) => (
        <div key={label} className="rounded-2xl border border-[color:var(--nodu-border)] bg-[color:var(--nodu-surface)] p-3">
          <strong className="block text-2xl">{value}</strong>
          <span className="text-xs text-[color:var(--nodu-text-soft)]">{label}</span>
        </div>
      ))}
    </div>
    {[
      ['Rozpocet', '100%', '920k', 'bg-[color:var(--nodu-text)]'],
      ['Naklady', '74%', '680k', 'bg-[color:var(--nodu-accent)]'],
      ['Fakturace', '58%', '534k', 'bg-[color:var(--nodu-success-text)]'],
    ].map(([label, value, amount, color]) => (
      <div key={label} className="mt-4 grid grid-cols-[78px_1fr_48px] items-center gap-3 text-xs text-[color:var(--nodu-text-soft)]">
        <span>{label}</span>
        <div className="h-3 overflow-hidden rounded-full bg-[color:rgb(var(--nodu-text-rgb)/0.08)]"><div className={`h-full rounded-full ${color}`} style={{ width: value }} /></div>
        <strong>{amount}</strong>
      </div>
    ))}
  </div>
);

const OperationsPreview = () => (
  <div className="mt-7 rounded-3xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.82)] p-5">
    <strong>Provozni prehled</strong>
    <div className="mt-4 grid grid-cols-2 gap-3">
      {[
        ['2', 'akce bez obsazeni'],
        ['12', 'ceka na schvaleni'],
        ['186h', 'schvaleno'],
        ['4', 'faktury v procesu'],
      ].map(([value, label]) => (
        <div key={label} className="rounded-2xl border border-[color:var(--nodu-border)] bg-[color:var(--nodu-surface)] p-3">
          <strong className="block text-2xl">{value}</strong>
          <span className="text-xs text-[color:var(--nodu-text-soft)]">{label}</span>
        </div>
      ))}
    </div>
    {[
      ['Obsazenost', '82%'],
      ['Schvaleno', '68%'],
      ['Fakturace', '54%'],
    ].map(([label, value]) => (
      <div key={label} className="mt-4 grid grid-cols-[86px_1fr_42px] items-center gap-3 text-xs text-[color:var(--nodu-text-soft)]">
        <span>{label}</span>
        <div className="h-3 overflow-hidden rounded-full bg-[color:rgb(var(--nodu-text-rgb)/0.08)]"><div className="h-full rounded-full bg-[color:var(--nodu-accent)]" style={{ width: value }} /></div>
        <strong>{value}</strong>
      </div>
    ))}
  </div>
);

const CrewInsightCard = () => (
  <motion.div {...reveal} className="nodu-panel min-h-[430px] rounded-[28px] p-7">
    <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[color:rgb(var(--nodu-accent-rgb)/0.12)] text-[color:var(--nodu-accent)]"><Users size={22} /></div>
    <h3 className="mt-6 text-3xl font-semibold tracking-[-0.03em]">Crew</h3>
    <p className="mt-3 text-[16px] leading-relaxed text-[color:var(--nodu-text-soft)]">Vydelek lze skladat z timelogu, sazby, kilometru, uctenek a stavu faktury.</p>
    <div className="mt-7 rounded-3xl border border-[color:var(--nodu-border)] bg-[color:rgb(var(--nodu-surface-rgb)/0.82)] p-5">
      <strong>Vydelek podle mesicu</strong>
      <div className="mt-6 flex h-40 items-end justify-between gap-2 rounded-3xl border border-[color:var(--nodu-border)] bg-[linear-gradient(to_top,rgb(var(--nodu-text-rgb)/0.06)_1px,transparent_1px)] bg-[length:100%_33%] px-4 pb-8 pt-4">
        {[
          ['Led', '42%'],
          ['Uno', '55%'],
          ['Bre', '48%'],
          ['Dub', '78%'],
          ['Kve', '66%'],
          ['Cvn', '88%'],
        ].map(([label, height]) => (
          <div key={label} className="relative w-full max-w-8 rounded-b-lg rounded-t-full bg-[color:var(--nodu-accent)]" style={{ height }}>
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-[color:var(--nodu-text-soft)]">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[color:var(--nodu-border)] bg-[color:var(--nodu-surface)] p-3"><strong className="block text-2xl">24 800</strong><span className="text-xs text-[color:var(--nodu-text-soft)]">vydelek tento mesic</span></div>
        <div className="rounded-2xl border border-[color:var(--nodu-border)] bg-[color:var(--nodu-surface)] p-3"><strong className="block text-2xl">62 h</strong><span className="text-xs text-[color:var(--nodu-text-soft)]">odpracovano</span></div>
      </div>
    </div>
  </motion.div>
);

export default WelcomeView;
