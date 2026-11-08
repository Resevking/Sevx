import { useEffect, useState } from 'react';
import { ALL_STEPS, PHASES, SetupStep } from './content';
import { LinkButton, Note } from './ui';

interface Props {
    username: string;
    done: string[];
    loaded: boolean;
    onToggle: (id: string) => void;
    onReset: () => void;
    onOpenCalculator: () => void;
}

export default function SetupChecklist({ username, done, loaded, onToggle, onReset, onOpenCalculator }: Props) {
    const doneSet = new Set(done);
    const total = ALL_STEPS.length;
    const doneCount = ALL_STEPS.filter((s) => doneSet.has(s.id)).length;
    const required = ALL_STEPS.filter((s) => s.required);
    const requiredLeft = required.filter((s) => !doneSet.has(s.id));
    const percent = Math.round((doneCount / total) * 100);

    const [openId, setOpenId] = useState<string | null>(null);

    // Once the saved progress is loaded, open the first step that is not done yet.
    useEffect(() => {
        if (!loaded) return;
        const next = ALL_STEPS.find((s) => !done.includes(s.id));
        setOpenId(next ? next.id : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loaded]);

    const toggle = (step: SetupStep) => {
        const willBeDone = !doneSet.has(step.id);
        onToggle(step.id);
        if (willBeDone) {
            const index = ALL_STEPS.findIndex((s) => s.id === step.id);
            const next = ALL_STEPS.slice(index + 1).find((s) => !doneSet.has(s.id));
            setOpenId(next ? next.id : null);
        }
    };

    let stepNumber = 0;

    return (
        <div className="space-y-8">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Fortschritt: {doneCount} von {total} Schritten
                    </p>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {requiredLeft.length === 0
                            ? 'Alle Pflichtschritte erledigt'
                            : `Noch ${requiredLeft.length} Pflichtschritt${requiredLeft.length === 1 ? '' : 'e'}`}
                    </p>
                </div>
                <div
                    className="mt-3 h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                    role="progressbar"
                    aria-valuenow={percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Fortschritt der Einrichtung"
                >
                    <div className="h-full rounded-full bg-violet-600 transition-all duration-500 dark:bg-violet-500" style={{ width: `${percent}%` }} />
                </div>
                {requiredLeft.length === 0 && (
                    <div className="mt-4">
                        <Note tone="success">
                            <strong>Du bist startklar!</strong> Alle Pflichtschritte sind erledigt. Falls beim Streamen etwas hakt, schau im Bereich «Probleme
                            lösen» nach.
                        </Note>
                    </div>
                )}
            </div>

            {PHASES.map((phase, phaseIndex) => {
                const phaseDone = phase.steps.filter((s) => doneSet.has(s.id)).length;
                return (
                    <section key={phase.id} aria-labelledby={`phase-${phase.id}`}>
                        <div className="mb-3 flex items-baseline justify-between gap-3">
                            <h2 id={`phase-${phase.id}`} className="text-lg font-semibold normal-case tracking-normal text-zinc-900 dark:text-zinc-50">
                                <span className="mr-2 text-violet-600 dark:text-violet-400">{phaseIndex + 1}.</span>
                                {phase.title}
                            </h2>
                            <span className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                                {phaseDone}/{phase.steps.length}
                            </span>
                        </div>
                        <ol className="space-y-2">
                            {phase.steps.map((step) => {
                                stepNumber += 1;
                                const isDone = doneSet.has(step.id);
                                const isOpen = openId === step.id;
                                const panelId = `step-panel-${step.id}`;
                                return (
                                    <li
                                        key={step.id}
                                        data-step={step.id}
                                        className={`rounded-xl border bg-white transition dark:bg-zinc-900 ${
                                            isOpen ? 'border-violet-300 shadow-sm dark:border-violet-800' : 'border-zinc-200 dark:border-zinc-800'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3 p-3 sm:p-4">
                                            <label className="mt-0.5 flex shrink-0 cursor-pointer items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isDone}
                                                    onChange={() => toggle(step)}
                                                    className="peer sr-only"
                                                    aria-label={`${step.title} als erledigt markieren`}
                                                />
                                                <span
                                                    aria-hidden="true"
                                                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-semibold transition peer-focus-visible:ring-2 peer-focus-visible:ring-violet-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-zinc-900 ${
                                                        isDone
                                                            ? 'border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500'
                                                            : 'border-zinc-300 text-zinc-500 hover:border-violet-400 dark:border-zinc-600 dark:text-zinc-400'
                                                    }`}
                                                >
                                                    {isDone ? (
                                                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                            <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                    ) : (
                                                        stepNumber
                                                    )}
                                                </span>
                                            </label>
                                            <button
                                                type="button"
                                                className="min-w-0 flex-1 text-left"
                                                aria-expanded={isOpen}
                                                aria-controls={panelId}
                                                onClick={() => setOpenId(isOpen ? null : step.id)}
                                            >
                                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <span
                                                        className={`font-medium ${isDone ? 'text-zinc-500 line-through decoration-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-50'}`}
                                                    >
                                                        {step.title}
                                                    </span>
                                                    {step.required && !isDone && (
                                                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                                                            Pflicht
                                                        </span>
                                                    )}
                                                </span>
                                                <span className="mt-0.5 block text-sm text-zinc-600 dark:text-zinc-400">{step.summary}</span>
                                            </button>
                                            <svg
                                                aria-hidden="true"
                                                viewBox="0 0 16 16"
                                                className={`mt-1.5 h-4 w-4 shrink-0 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                            >
                                                <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </div>
                                        {isOpen && (
                                            <div id={panelId} className="border-t border-zinc-100 px-3 pb-4 pt-3 sm:px-4 sm:pl-[3.25rem] dark:border-zinc-800">
                                                <div className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{step.body}</div>
                                                <div className="mt-4 flex flex-wrap items-center gap-2">
                                                    {step.opensCalculator && (
                                                        <button
                                                            type="button"
                                                            onClick={onOpenCalculator}
                                                            className="inline-flex items-center rounded-md bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 dark:text-zinc-950"
                                                        >
                                                            OBS-Rechner öffnen →
                                                        </button>
                                                    )}
                                                    {step.links?.map((link) => (
                                                        <LinkButton key={link.label} href={link.href(username)}>
                                                            {link.label}
                                                        </LinkButton>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() => toggle(step)}
                                                        className="ml-auto text-sm font-medium text-violet-700 hover:underline dark:text-violet-300"
                                                    >
                                                        {isDone ? 'Doch nicht erledigt' : 'Erledigt ✓'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    </section>
                );
            })}

            {doneCount > 0 && (
                <div className="text-center">
                    <button
                        type="button"
                        onClick={() => {
                            if (window.confirm('Fortschritt wirklich zurücksetzen?')) {
                                onReset();
                                setOpenId(ALL_STEPS[0].id);
                            }
                        }}
                        className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                        Fortschritt zurücksetzen
                    </button>
                </div>
            )}
        </div>
    );
}
