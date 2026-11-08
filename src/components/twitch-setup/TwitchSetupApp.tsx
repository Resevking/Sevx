import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react';
import SetupChecklist from './SetupChecklist';
import SettingsCalculator from './SettingsCalculator';
import Troubleshooter from './Troubleshooter';
import { ALL_STEPS } from './content';
import { normalizeUsername, useStoredState } from './ui';

type Tab = 'einrichtung' | 'obs' | 'probleme';

const TABS: { id: Tab; label: string; short: string }[] = [
    { id: 'einrichtung', label: 'Einrichtung', short: 'Einrichtung' },
    { id: 'obs', label: 'OBS-Rechner', short: 'OBS' },
    { id: 'probleme', label: 'Probleme lösen', short: 'Probleme' }
];

/** 'web' runs as a page of the website, 'desktop' inside the downloadable Windows app. */
export type Variant = 'web' | 'desktop';

const STORAGE_PLACE: Record<Variant, string> = {
    web: 'in diesem Browser',
    desktop: 'auf diesem PC'
};

const INTRO: Record<Tab, string> = {
    einrichtung: 'Arbeite die Schritte von oben nach unten ab.',
    obs: 'Beantworte ein paar Fragen zu deinem Internet und PC – du bekommst passende Einstellungen für OBS Studio.',
    probleme: 'Die häufigsten Fehler beim Streamen auf Twitch – mit Ursache und Lösung.'
};

function isTab(value: string): value is Tab {
    return TABS.some((t) => t.id === value);
}

interface Props {
    variant: Variant;
    /** Optional link shown above the title, e.g. back to the website's home page. */
    backLink?: ReactNode;
}

export default function TwitchSetupApp({ variant, backLink }: Props) {
    const [tab, setTab] = useState<Tab>('einrichtung');
    const [usernameRaw, setUsernameRaw] = useStoredState('twitch-setup:username', '');
    const [done, setDone, doneLoaded] = useStoredState<string[]>('twitch-setup:done', []);
    const tabsRef = useRef<HTMLDivElement>(null);

    const username = normalizeUsername(usernameRaw);
    const usernameInvalid = usernameRaw.trim() !== '' && !username;
    const doneCount = ALL_STEPS.filter((s) => done.includes(s.id)).length;

    useEffect(() => {
        const fromHash = () => {
            const hash = window.location.hash.replace('#', '');
            if (isTab(hash)) setTab(hash);
        };
        fromHash();
        window.addEventListener('hashchange', fromHash);
        return () => window.removeEventListener('hashchange', fromHash);
    }, []);

    const selectTab = (next: Tab, scroll = false) => {
        setTab(next);
        try {
            window.history.replaceState(null, '', `#${next}`);
        } catch {
            // ignore
        }
        if (scroll) {
            tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const nextIndex = (index + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length;
        selectTab(TABS[nextIndex].id);
        document.getElementById(`tab-${TABS[nextIndex].id}`)?.focus();
    };

    const toggleStep = (id: string) => setDone((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    return (
        <div className="min-h-screen bg-zinc-50 font-sans text-zinc-800 antialiased dark:bg-zinc-950 dark:text-zinc-200">
            <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
                {backLink && <div className="mb-6">{backLink}</div>}

                <header className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem] md:items-end">
                    <div>
                        <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">Stream-Starthilfe</p>
                        <h1 className="mt-1 text-3xl font-bold normal-case tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
                            Twitch Setup-Assistent
                        </h1>
                        <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
                            Vom neuen Konto bis zum ersten Livestream: eine Checkliste mit allen Schritten, passende OBS-Einstellungen für dein Internet und
                            deinen PC und Lösungen für die häufigsten Probleme.
                        </p>
                    </div>
                    <div>
                        <label htmlFor="twitch-name" className="mb-1.5 block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            Dein Twitch-Name <span className="font-normal text-zinc-500 dark:text-zinc-400">(optional)</span>
                        </label>
                        <input
                            id="twitch-name"
                            type="text"
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            placeholder="z. B. sevx"
                            value={usernameRaw}
                            onChange={(e) => setUsernameRaw(e.target.value)}
                            aria-describedby="twitch-name-help"
                            aria-invalid={usernameInvalid}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                        />
                        <p
                            id="twitch-name-help"
                            className={`mt-1.5 text-xs ${usernameInvalid ? 'text-red-600 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'}`}
                        >
                            {usernameInvalid
                                ? 'Twitch-Namen bestehen nur aus Buchstaben, Zahlen und _ (3–25 Zeichen).'
                                : 'Damit führen die Links direkt zu deinem Creator Dashboard.'}
                        </p>
                    </div>
                </header>

                <div ref={tabsRef} className="mt-8 scroll-mt-4">
                    <div
                        role="tablist"
                        aria-label="Bereiche"
                        className="flex gap-1 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                    >
                        {TABS.map((t, i) => {
                            const active = tab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    id={`tab-${t.id}`}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    aria-controls={`panel-${t.id}`}
                                    tabIndex={active ? 0 : -1}
                                    onClick={() => selectTab(t.id)}
                                    onKeyDown={(e) => onTabKeyDown(e, i)}
                                    className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-semibold transition-colors focus:outline-none sm:px-3 focus-visible:ring-2 focus-visible:ring-violet-500 ${
                                        active
                                            ? 'bg-violet-600 text-white shadow-sm dark:bg-violet-500 dark:text-zinc-950'
                                            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100'
                                    }`}
                                >
                                    <span className="sm:hidden">{t.short}</span>
                                    <span className="hidden sm:inline">{t.label}</span>
                                    {t.id === 'einrichtung' && doneLoaded && (
                                        <span
                                            className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                                                active ? 'bg-white/20' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                                            }`}
                                        >
                                            {doneCount}/{ALL_STEPS.length}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                    {INTRO[tab]}
                    {tab === 'einrichtung' && ` Dein Fortschritt wird ${STORAGE_PLACE[variant]} gespeichert.`}
                </p>

                <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-5">
                    {tab === 'einrichtung' && (
                        <SetupChecklist
                            username={username}
                            done={done}
                            loaded={doneLoaded}
                            onToggle={toggleStep}
                            onReset={() => setDone([])}
                            onOpenCalculator={() => selectTab('obs', true)}
                        />
                    )}
                    {tab === 'obs' && <SettingsCalculator />}
                    {tab === 'probleme' && <Troubleshooter username={username} />}
                </div>

                <footer className="mt-16 border-t border-zinc-200 pt-6 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    Kein offizielles Angebot von Twitch oder OBS. Twitch passt Menüs und Vorgaben gelegentlich an – im Zweifel gelten die Angaben im Twitch Help
                    Center. Deine Eingaben bleiben {STORAGE_PLACE[variant]} und werden nirgends hin gesendet.
                </footer>
            </div>
        </div>
    );
}
