import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock3, FileText, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';

type WelcomeViewProps = {
  onLogin: () => void;
  onRegister: () => void;
};

const showcaseItems = [
  {
    title: 'Dashboard',
    label: 'Provozni prehled',
    heading: 'Dnesni provoz',
    badge: 'LIVE-0426',
    metrics: [
      ['18 / 20', 'pozic obsazeno'],
      ['12', 'timelogu ke kontrole'],
      ['4', 'akce tento tyden'],
      ['3', 'faktury navazuji'],
    ],
    rows: [
      ['Festival instalace', 'LIVE-0426 - dnes 18:00', 'chybi crew'],
      ['Brand roadshow', 'ROAD-1120 - zitra', 'schvalit'],
      ['Expo deinstal', 'EXPO-0904 - fakturace', 'COO'],
    ],
  },
  {
    title: 'Akce',
    label: 'Detail eventu',
    heading: 'Festival instalace',
    badge: 'JN LIVE-0426',
    metrics: [
      ['Instal', '8 lidi - 07:00'],
      ['Provoz', '6 lidi - 18:00'],
      ['Deinstal', '4 lidi - 23:30'],
    ],
    rows: [
      ['Crew Lead', 'Martin H.', 'potvrzeno'],
      ['Runner', '2 pozice', 'chybi'],
      ['Technik', '3 pozice', 'OK'],
    ],
  },
  {
    title: 'Timelogy',
    label: 'Schvalovani',
    heading: 'Ke kontrole',
    badge: '12 polozek',
    metrics: [
      ['CrewHead', 'prvni kontrola'],
      ['COO', 'finalni schvaleni'],
    ],
    rows: [
      ['Anna K.', 'LIVE-0426 - 7.5 h', 'CrewHead'],
      ['Petr S.', 'ROAD-1120 - 6 h', 'COO'],
      ['Lucie M.', 'EXPO-0904 - 5 h', 'namitka'],
      ['Tomas B.', 'LIVE-0426 - 8 h', 'OK'],
    ],
  },
  {
    title: 'Faktury',
    label: 'Self-billing',
    heading: 'Navazna fakturace',
    badge: 'po COO',
    metrics: [
      ['72 h', 'lhuta pro namitku'],
      ['4', 'cekaji na uzavreni'],
    ],
    rows: [
      ['INV-2026-014', 'Anna K. - LIVE-0426', 'odeslano'],
      ['INV-2026-015', 'Petr S. - ROAD-1120', '72 h'],
      ['INV-2026-016', 'Tomas B. - LIVE-0426', 'k proplaceni'],
    ],
  },
];

const roles = [
  ['Vedeni', 'Vidi rizika, stav schvalovani a financni navaznosti bez dohledavani v provoznich chatech.'],
  ['Operativa', 'Resi obsazeni akci, kontrolu vykazu a kazdodenni prehled nad tim, co brzdi provoz.'],
  ['Crew', 'Ma jasne smeny, vlastni timelogy a prehled o fakturach bez zbytecneho ptani.'],
];

const reveal = {
  initial: { opacity: 0, y: 36, scale: 0.99 },
  whileInView: { opacity: 1, y: 0, scale: 1 },
  viewport: { once: false, margin: '-10% 0px -12% 0px' },
  transition: { duration: 0.65, ease: [0.2, 0.8, 0.2, 1] },
} as const;

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
    <div className="min-h-screen overflow-x-hidden bg-[#f8f5ef] text-[#111]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_12%,rgba(249,115,22,0.12),transparent_26%),linear-gradient(120deg,rgba(255,255,255,0.88),rgba(248,245,239,0.94))]" />

      <div className="relative mx-auto w-[min(1180px,calc(100%-32px))] py-6 sm:w-[min(1180px,calc(100%-48px))]">
        <header className="sticky top-4 z-30 grid min-h-[62px] grid-cols-[auto_auto] items-center gap-5 rounded-[20px] border border-black/10 bg-white/80 px-4 py-3 shadow-[0_18px_46px_rgba(31,24,15,0.08)] backdrop-blur lg:grid-cols-[auto_1fr_auto] lg:px-6">
          <button type="button" className="text-left text-[28px] font-black tracking-normal" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            nodu<span className="text-orange-500">.</span>
          </button>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-[#6b6258] lg:flex">
            <button type="button" className="hover:text-black" onClick={() => scrollToId('proc')}>Proc Nodu</button>
            <button type="button" className="hover:text-black" onClick={() => scrollToId('workflow')}>Workflow</button>
            <button type="button" className="hover:text-black" onClick={() => scrollToId('ukazka')}>Ukazka</button>
            <button type="button" className="hover:text-black" onClick={() => scrollToId('role')}>Role</button>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="outline" className="h-10 rounded-full border-black/10 bg-white px-5 font-bold hover:bg-white" onClick={onLogin}>
              Prihlasit
            </Button>
            <Button type="button" className="hidden h-10 rounded-full bg-black px-5 font-bold text-white hover:bg-black/90 sm:inline-flex" onClick={onRegister}>
              Registrovat
            </Button>
          </div>
        </header>

        <section className="grid min-h-[88vh] scroll-mt-28 items-center gap-12 py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:py-32">
          <motion.div {...reveal}>
            <div className="text-[13px] font-black uppercase tracking-[0.08em] text-orange-500">Postavene primo na miru</div>
            <h1 className="mt-4 max-w-[740px] text-[clamp(54px,6.6vw,96px)] font-black leading-[0.98] tracking-normal">
              Cely provoz od akce po fakturu.
            </h1>
            <p className="mt-7 max-w-xl text-[19px] leading-relaxed text-[#655f57]">
              Nodu je provozni system pro eventove tymy, ktere potrebuji mit lidi, vykazy, schvalovani a fakturaci v jednom navazujicim toku.
            </p>
          </motion.div>

          <motion.div {...reveal} className="overflow-hidden rounded-[28px] border border-black/10 bg-white/85 shadow-[0_34px_80px_rgba(31,24,15,0.12)] backdrop-blur">
            <div className="flex h-14 items-center justify-between border-b border-black/10 px-5">
              <div className="flex gap-2"><span className="h-3 w-3 rounded-full bg-stone-300" /><span className="h-3 w-3 rounded-full bg-stone-300" /><span className="h-3 w-3 rounded-full bg-stone-300" /></div>
              <strong>Dashboard</strong>
              <span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-orange-700">LIVE-0426</span>
            </div>
            <div className="grid min-h-[450px] md:grid-cols-[150px_1fr]">
              <aside className="hidden border-r border-black/10 bg-[#fbfaf7] p-4 md:block">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className={`mb-3 h-9 rounded-xl ${index === 0 ? 'border border-orange-200 bg-orange-50' : 'bg-stone-200/60'}`} />
                ))}
              </aside>
              <div className="p-6">
                <div className="flex items-end justify-between gap-4">
                  <h2 className="text-4xl font-black">Provozni prehled</h2>
                  <span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-orange-700">12 ceka</span>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    ['18/20', 'crew obsazeno'],
                    ['12', 'timelogu ke kontrole'],
                    ['4', 'faktury navazuji'],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-2xl border border-stone-200 bg-[#fffdf9] p-4">
                      <strong className="block text-3xl">{value}</strong>
                      <span className="text-sm text-[#736b61]">{label}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 overflow-hidden rounded-3xl border border-stone-200">
                  {[
                    ['Festival instalace', 'LIVE-0426 - dnes 18:00', 'chybi crew'],
                    ['Brand roadshow', 'ROAD-1120 - zitra', 'schvalit'],
                    ['Expo deinstal', 'EXPO-0904 - fakturace', 'COO'],
                  ].map(([title, meta, status]) => (
                    <div key={title} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-stone-100 p-4 last:border-b-0">
                      <div><strong>{title}</strong><br /><span className="text-sm text-[#736b61]">{meta}</span></div>
                      <span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-orange-700">{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section id="proc" className="grid min-h-[88vh] scroll-mt-28 items-center gap-16 py-24 lg:grid-cols-2 lg:py-32">
          <motion.div {...reveal}>
            <div className="text-[13px] font-black uppercase tracking-[0.08em] text-orange-500">Proc vzniklo Nodu</div>
            <h2 className="mt-4 max-w-2xl text-[clamp(42px,5vw,78px)] font-black leading-[0.98]">Podle realneho provozu.</h2>
            <p className="mt-7 max-w-xl text-[19px] leading-relaxed text-[#655f57]">
              Nodu vznika kolem prace eventove a produkcni firmy: kratke terminy, promenlive tymy, vic schvalovacich kroku a potreba navazat provoz na penize bez rucniho skladani podkladu.
            </p>
          </motion.div>
          <motion.div {...reveal} className="rounded-[28px] border border-black/10 bg-white/85 p-8 shadow-[0_34px_80px_rgba(31,24,15,0.12)]">
            {[
              ['1', 'Job Number jako spojovaci bod', 'Projekt, akce, timelog i faktura drzi stejny kontext.'],
              ['2', 'Role vidi jen to, co potrebuji', 'Crew, operativa i vedeni pracuji nad stejnymi daty jinou optikou.'],
              ['3', 'Fakturace navazuje na schvaleni', 'Self-billing neni oddelena agenda, ale prirozeny konec provozniho toku.'],
            ].map(([number, title, text]) => (
              <div key={number} className="grid grid-cols-[42px_1fr] gap-4 py-4">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-black font-black text-white">{number}</span>
                <div><strong className="text-lg">{title}</strong><p className="mt-1 text-[15px] leading-relaxed text-[#655f57]">{text}</p></div>
              </div>
            ))}
          </motion.div>
        </section>

        <section id="workflow" className="min-h-[88vh] scroll-mt-28 py-24 lg:py-32">
          <motion.div {...reveal}>
            <div className="text-[13px] font-black uppercase tracking-[0.08em] text-orange-500">Workflow</div>
            <h2 className="mt-4 max-w-3xl text-[clamp(42px,5vw,78px)] font-black leading-[0.98]">Kazdy krok predava kontext dalsimu.</h2>
            <p className="mt-7 max-w-2xl text-[19px] leading-relaxed text-[#655f57]">
              Job Number zustava spolecnou linkou pro projekt, akci, lidi, vykazy i faktury.
            </p>
          </motion.div>
          <div className="mt-14 grid gap-8">
            {[
              ['01', 'Projekt a akce', 'Klient, projekt a konkretni event vzniknou jako jeden provozni celek.'],
              ['02', 'Crew a timelogy', 'Obsazeni a odpracovane hodiny zustavaji pripojene ke stejnemu kontextu.'],
              ['03', 'Schvaleni a faktura', 'Po kontrole CrewHeadem a COO muze navazat self-billing bez rucniho skladani podkladu.'],
            ].map(([number, title, text]) => (
              <motion.div key={number} {...reveal} className="grid gap-5 rounded-[28px] border border-black/10 bg-white/85 p-8 shadow-[0_26px_60px_rgba(31,24,15,0.08)] sm:grid-cols-[86px_1fr]">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-black font-black text-white">{number}</span>
                <div><h3 className="text-3xl font-black">{title}</h3><p className="mt-3 text-[17px] leading-relaxed text-[#655f57]">{text}</p></div>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="ukazka" className="scroll-mt-28 py-24 lg:py-32">
          <motion.div {...reveal} className="max-w-4xl">
            <div className="text-[13px] font-black uppercase tracking-[0.08em] text-orange-500">Realna aplikace</div>
            <h2 className="mt-4 text-[clamp(42px,5vw,78px)] font-black leading-[0.98]">Projdete si Nodu tak, jak navazuje v provozu.</h2>
            <p className="mt-7 max-w-2xl text-[18px] leading-relaxed text-[#655f57]">
              Od celkoveho prehledu pres detail akce a schvalovani az po self-billing fakturaci.
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
              <article key={item.title} data-showcase-card={index} className="min-h-[520px] flex-[0_0_min(760px,calc(100vw-64px))] snap-center overflow-hidden rounded-[28px] border border-black/10 bg-white/85 shadow-[0_26px_60px_rgba(31,24,15,0.10)]">
                <div className="flex h-16 items-center justify-between border-b border-black/10 bg-[#fffdf9] px-5">
                  <strong className="text-xl">{item.title}</strong>
                  <span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-orange-700">{item.label}</span>
                </div>
                <div className="grid min-h-[456px] md:grid-cols-[150px_1fr]">
                  <aside className="hidden border-r border-black/10 bg-[#fbfaf7] p-4 md:block">
                    {Array.from({ length: 4 }).map((_, sideIndex) => (
                      <div key={sideIndex} className={`mb-3 h-9 rounded-xl ${sideIndex === index ? 'border border-orange-200 bg-orange-50' : 'bg-stone-200/60'}`} />
                    ))}
                  </aside>
                  <div className="p-6">
                    <div className="flex items-end justify-between gap-4">
                      <h3 className="text-4xl font-black">{item.heading}</h3>
                      <span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-orange-700">{item.badge}</span>
                    </div>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      {item.metrics.map(([value, label]) => (
                        <div key={`${item.title}-${value}`} className="rounded-2xl border border-stone-200 bg-[#fffdf9] p-4">
                          <strong className="block text-2xl">{value}</strong>
                          <span className="text-sm text-[#736b61]">{label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 overflow-hidden rounded-3xl border border-stone-200">
                      {item.rows.map(([title, meta, status]) => (
                        <div key={`${item.title}-${title}`} className="grid grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_auto] items-center gap-4 border-b border-stone-100 p-4 last:border-b-0">
                          <strong>{title}</strong>
                          <span className="justify-self-start text-left text-sm text-[#736b61]">{meta}</span>
                          <span className="justify-self-end rounded-full bg-orange-50 px-3 py-2 text-xs font-black text-orange-700">{status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
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
                  className={`h-2.5 rounded-full transition-all ${activeShowcase === index ? 'w-9 bg-orange-500' : 'w-2.5 bg-black/20'}`}
                  onClick={() => scrollShowcaseTo(index)}
                />
              ))}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" size="icon" className="rounded-full" onClick={() => scrollShowcaseTo(activeShowcase - 1)}><ArrowLeft size={18} /></Button>
              <Button type="button" size="icon" className="rounded-full bg-black text-white hover:bg-black/90" onClick={() => scrollShowcaseTo(activeShowcase + 1)}><ArrowRight size={18} /></Button>
            </div>
          </div>
        </section>

        <section className="-mx-[calc((100vw-min(1180px,calc(100vw-48px)))/2)] min-h-[86vh] bg-black px-[calc((100vw-min(1180px,calc(100vw-48px)))/2)] py-24 text-white lg:py-32">
          <motion.div {...reveal}>
            <div className="text-[13px] font-black uppercase tracking-[0.08em] text-orange-400">Co Nodu hlida</div>
            <h2 className="mt-4 max-w-4xl text-[clamp(42px,5vw,78px)] font-black leading-[0.98]">Blokace jsou videt driv, nez z nich vznikne chaos.</h2>
            <p className="mt-7 max-w-2xl text-[19px] leading-relaxed text-stone-300">
              Nodu pomaha s kazdodenni orientaci: co chybi, co ceka na schvaleni, co brzdi fakturaci a kde je potreba zasah.
            </p>
          </motion.div>
          <div className="mt-14 grid gap-5 md:grid-cols-4">
            {[
              [Users, 'Chybejici crew', 'Akce ukaze neobsazene role a rizikove faze.', 'obsazeni'],
              [Clock3, 'Cekajici timelogy', 'CrewHead a COO vidi, co blokuje dalsi krok.', 'schvalovani'],
              [FileText, '72 hodin na namitku', 'Self-billing drzi jasny stav po odeslani faktury.', 'fakturace'],
              [CheckCircle2, 'Rozpocet a rizika', 'Vedeni vidi naklady, marzi a provozni dopady.', 'prehled'],
            ].map(([Icon, title, text, tag]) => (
              <motion.div key={String(title)} {...reveal} className="min-h-[230px] rounded-[26px] border border-white/10 bg-white/5 p-6">
                <Icon className="mb-8 text-orange-300" size={26} />
                <strong className="block text-2xl">{String(title)}</strong>
                <p className="mt-4 text-[15px] leading-relaxed text-stone-300">{String(text)}</p>
                <span className="mt-5 inline-flex rounded-full bg-orange-500/20 px-3 py-2 text-xs font-black text-orange-200">{String(tag)}</span>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="role" className="scroll-mt-28 py-24 lg:py-32">
          <motion.div {...reveal}>
            <div className="text-[13px] font-black uppercase tracking-[0.08em] text-orange-500">Role</div>
            <h2 className="mt-4 max-w-4xl text-[clamp(42px,5vw,78px)] font-black leading-[0.98]">Jeden system, ruzne pohledy.</h2>
          </motion.div>
          <div className="mt-14 grid gap-7 lg:grid-cols-3">
            {roles.map(([title, text], index) => (
              <motion.div key={title} {...reveal} className={`min-h-[260px] rounded-[28px] border border-black/10 bg-white/85 p-8 shadow-[0_26px_60px_rgba(31,24,15,0.08)] ${index === 1 ? 'lg:mt-12' : ''}`}>
                <h3 className="text-3xl font-black">{title}</h3>
                <p className="mt-7 text-[17px] leading-relaxed text-[#655f57]">{text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="py-24 lg:py-32">
          <motion.div {...reveal}>
            <div className="text-[13px] font-black uppercase tracking-[0.08em] text-orange-500">Grafy a prehledy</div>
            <h2 className="mt-4 max-w-4xl text-[clamp(42px,5vw,78px)] font-black leading-[0.98]">Kazda role vidi data, ktera ji pomahaji rozhodovat.</h2>
            <p className="mt-7 max-w-2xl text-[19px] leading-relaxed text-[#655f57]">
              Nodu umi prelozit provoz do grafu, trendu a osobnich prehledu.
            </p>
          </motion.div>
          <div className="mt-14 grid gap-7 lg:grid-cols-3">
            <InsightCard title="Vedeni" text="Rozpocet, naklady, cashflow, vytizeni crew a schvalovaci fronta podle projektu nebo klienta." />
            <InsightCard title="Operativa" text="Obsazeni akci, rizika, cekajici schvaleni a prace, ktera muze brzdit dalsi krok." />
            <CrewInsightCard />
          </div>
        </section>

        <section className="grid min-h-[60vh] place-items-center py-24">
          <motion.div {...reveal} className="w-[min(860px,100%)] rounded-[28px] border border-black/10 bg-white/85 p-10 text-center shadow-[0_34px_80px_rgba(31,24,15,0.12)] sm:p-14">
            <div className="text-[13px] font-black uppercase tracking-[0.08em] text-orange-500">Vstup do Nodu</div>
            <h2 className="mt-4 text-[clamp(42px,5vw,78px)] font-black leading-[0.98]">Mate pristup do Nodu?</h2>
            <p className="mx-auto mt-7 max-w-xl text-[19px] leading-relaxed text-[#655f57]">Prihlaste se do provozniho systemu, nebo pozadejte o registraci pro svuj tym.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button type="button" variant="outline" className="h-11 rounded-full px-6 font-bold" onClick={onLogin}>Prihlasit se</Button>
              <Button type="button" className="h-11 rounded-full bg-black px-6 font-bold text-white hover:bg-black/90" onClick={onRegister}>Pozadat o registraci</Button>
            </div>
          </motion.div>
        </section>
      </div>
    </div>
  );
};

const InsightCard = ({ title, text }: { title: string; text: string }) => (
  <motion.div {...reveal} className="min-h-[430px] rounded-[28px] border border-black/10 bg-white/85 p-7 shadow-[0_26px_60px_rgba(31,24,15,0.08)]">
    <h3 className="text-3xl font-black">{title}</h3>
    <p className="mt-3 text-[16px] leading-relaxed text-[#655f57]">{text}</p>
    <div className="mt-7 rounded-3xl border border-stone-200 bg-[#fffdf9] p-5">
      <strong>Manazersky prehled</strong>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[
          ['31%', 'marze projektu'],
          ['1.8M', 'ceka ve fakturaci'],
          ['86%', 'vytizeni crew'],
          ['12', 'blokuje tok'],
        ].map(([value, label]) => (
          <div key={label} className="rounded-2xl border border-stone-200 bg-white p-3">
            <strong className="block text-2xl">{value}</strong>
            <span className="text-xs text-[#736b61]">{label}</span>
          </div>
        ))}
      </div>
      {[
        ['Budget', '92%', '920k', 'bg-emerald-600'],
        ['Naklady', '68%', '680k', 'bg-orange-500'],
        ['Fakturace', '74%', '740k', 'bg-black'],
      ].map(([label, value, amount, color]) => (
        <div key={label} className="mt-4 grid grid-cols-[74px_1fr_56px] items-center gap-3 text-xs text-[#736b61]">
          <span>{label}</span>
          <div className="h-3 overflow-hidden rounded-full bg-stone-200"><div className={`h-full rounded-full ${color}`} style={{ width: value }} /></div>
          <strong>{amount}</strong>
        </div>
      ))}
    </div>
  </motion.div>
);

const CrewInsightCard = () => (
  <motion.div {...reveal} className="min-h-[430px] rounded-[28px] border border-black/10 bg-white/85 p-7 shadow-[0_26px_60px_rgba(31,24,15,0.08)]">
    <h3 className="text-3xl font-black">Crew</h3>
    <p className="mt-3 text-[16px] leading-relaxed text-[#655f57]">Vydelek v case, odpracovane hodiny, nadchazejici smeny a stav vyplaty.</p>
    <div className="mt-7 rounded-3xl border border-stone-200 bg-[#fffdf9] p-5">
      <strong>Vydelek podle mesicu</strong>
      <div className="mt-6 flex h-40 items-end justify-between gap-2 rounded-3xl border border-stone-200 bg-[linear-gradient(to_top,rgba(17,17,17,0.06)_1px,transparent_1px)] bg-[length:100%_33%] px-4 pb-8 pt-4">
        {[
          ['Led', '42%'],
          ['Uno', '55%'],
          ['Bre', '48%'],
          ['Dub', '78%'],
          ['Kve', '66%'],
          ['Cvn', '88%'],
        ].map(([label, height]) => (
          <div key={label} className="relative w-full max-w-8 rounded-t-full rounded-b-lg bg-gradient-to-b from-orange-500 to-black" style={{ height }}>
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-[#736b61]">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-3"><strong className="block text-2xl">24 800</strong><span className="text-xs text-[#736b61]">vydelek tento mesic</span></div>
        <div className="rounded-2xl border border-stone-200 bg-white p-3"><strong className="block text-2xl">62 h</strong><span className="text-xs text-[#736b61]">odpracovano</span></div>
      </div>
    </div>
  </motion.div>
);

export default WelcomeView;
