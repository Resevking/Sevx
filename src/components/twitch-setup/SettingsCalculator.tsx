import { CalculatorInput, Canvas, Connection, ContentType, CpuPower, Gpu, recommend, recommendationAsText, videoBudget } from './recommend';
import { Choice, CopyButton, ExtLink, Note, useStoredState } from './ui';

const DEFAULT_INPUT: CalculatorInput & { uploadText: string } = {
    uploadMbps: 0,
    uploadText: '',
    connection: 'lan',
    gpu: 'nvidia',
    cpu: 'mid',
    content: 'fast',
    canvas: '1080'
};

const VERDICT = {
    good: { label: 'Passt', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
    tight: { label: 'Knapp', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
    critical: { label: 'Kritisch', className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' }
};

export default function SettingsCalculator() {
    const [input, setInput] = useStoredState('twitch-setup:calculator', DEFAULT_INPUT);
    const update = (patch: Partial<typeof DEFAULT_INPUT>) => setInput((prev) => ({ ...DEFAULT_INPUT, ...prev, ...patch }));

    const upload = input.uploadMbps;
    const hasUpload = Number.isFinite(upload) && upload > 0;
    const rec = hasUpload ? recommend(input) : null;
    const usesCpu = input.gpu === 'none' || input.gpu === 'unknown';
    const headroomPct = input.connection === 'wifi' ? 60 : 75;

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
            <form
                className="space-y-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
                onSubmit={(e) => e.preventDefault()}
                aria-label="Angaben zu deinem PC und Internet"
            >
                <div>
                    <label htmlFor="upload" className="mb-2 block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        Upload-Geschwindigkeit
                    </label>
                    <div className="flex items-center gap-2">
                        <div className="relative w-36">
                            <input
                                id="upload"
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="any"
                                placeholder="z. B. 20"
                                value={input.uploadText}
                                onChange={(e) => {
                                    const text = e.target.value;
                                    update({ uploadText: text, uploadMbps: parseFloat(text.replace(',', '.')) || 0 });
                                }}
                                className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-3 pr-16 text-base tabular-nums text-zinc-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-zinc-500 dark:text-zinc-400">
                                Mbit/s
                            </span>
                        </div>
                        <ExtLink href="https://www.speedtest.net/" className="text-sm">
                            Speedtest
                        </ExtLink>
                    </div>
                    <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">Wichtig ist der Wert bei «Upload», nicht «Download».</p>
                </div>

                <Choice<Connection>
                    legend="Verbindung"
                    columns={2}
                    value={input.connection}
                    onChange={(connection) => update({ connection })}
                    options={[
                        { value: 'lan', label: 'LAN-Kabel', hint: 'stabil' },
                        { value: 'wifi', label: 'WLAN', hint: 'schwankt' }
                    ]}
                />

                <Choice<Gpu>
                    legend="Grafikkarte"
                    value={input.gpu}
                    onChange={(gpu) => update({ gpu })}
                    options={[
                        { value: 'nvidia', label: 'NVIDIA', hint: 'GeForce GTX/RTX' },
                        { value: 'amd', label: 'AMD', hint: 'Radeon' },
                        { value: 'intel', label: 'Intel', hint: 'Arc / integriert' },
                        { value: 'apple', label: 'Mac', hint: 'Apple M1 oder neuer' },
                        { value: 'none', label: 'Keine', hint: 'nur Prozessor' },
                        { value: 'unknown', label: 'Weiss nicht', hint: '' }
                    ]}
                />

                {usesCpu && (
                    <Choice<CpuPower>
                        legend="Prozessor"
                        help="Ohne Hardware-Encoder kodiert der Prozessor das Video – das braucht viel Leistung."
                        value={input.cpu}
                        onChange={(cpu) => update({ cpu })}
                        options={[
                            { value: 'low', label: 'Schwach', hint: '4 Kerne / älter' },
                            { value: 'mid', label: 'Mittel', hint: '6 Kerne' },
                            { value: 'high', label: 'Stark', hint: '8+ Kerne' }
                        ]}
                    />
                )}

                <Choice<ContentType>
                    legend="Was streamst du?"
                    value={input.content}
                    onChange={(content) => update({ content })}
                    options={[
                        { value: 'fast', label: 'Schnelle Spiele', hint: 'Shooter, Rennen' },
                        { value: 'calm', label: 'Ruhige Spiele', hint: 'Strategie, Minecraft' },
                        { value: 'chat', label: 'Just Chatting', hint: 'Talk, Kunst, Musik' }
                    ]}
                />

                <Choice<Canvas>
                    legend="Auflösung deines Monitors"
                    value={input.canvas}
                    onChange={(canvas) => update({ canvas })}
                    options={[
                        { value: '1080', label: 'Full HD', hint: '1920×1080' },
                        { value: '1440', label: 'WQHD', hint: '2560×1440' },
                        { value: '2160', label: '4K', hint: '3840×2160' }
                    ]}
                />
            </form>

            <div className="space-y-4" aria-live="polite">
                {!rec ? (
                    <div className="flex min-h-[16rem] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
                        <p className="font-medium text-zinc-900 dark:text-zinc-100">Gib deine Upload-Geschwindigkeit ein</p>
                        <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                            Mach einen Speedtest (am besten per LAN-Kabel) und trag den Upload-Wert links ein. Dann erscheinen hier deine OBS-Einstellungen.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Empfehlung</p>
                                    <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">{rec.tierLabel}</p>
                                    <p className="mt-1 text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
                                        {rec.videoBitrate} Kbps Video + {rec.audioBitrate} kbps Audio
                                    </p>
                                </div>
                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${VERDICT[rec.verdict].className}`}>
                                    {VERDICT[rec.verdict].label}
                                </span>
                            </div>
                            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                                Von {upload.toLocaleString('de-CH')} Mbit/s Upload nutzen wir höchstens {headroomPct} % (
                                {videoBudget(upload, input.connection).toLocaleString('de-CH')} Kbps für Video), damit Reserven für Schwankungen bleiben. Twitch
                                empfiehlt maximal 6000 Kbps.
                            </p>
                        </div>

                        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 sm:px-5 dark:border-zinc-800">
                                <h2 className="text-base font-semibold normal-case tracking-normal text-zinc-900 dark:text-zinc-50">So stellst du OBS ein</h2>
                                <CopyButton text={recommendationAsText(rec)} label="Alles kopieren" />
                            </div>
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {rec.groups.map((group) => (
                                    <div key={group.path} className="px-4 py-4 sm:px-5">
                                        <p className="mb-2 text-xs font-semibold text-violet-700 dark:text-violet-300">{group.path}</p>
                                        <dl className="space-y-2.5">
                                            {group.settings.map((s) => (
                                                <div key={s.label} className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                                    <dt className="text-sm text-zinc-600 dark:text-zinc-400">
                                                        {s.label}
                                                        <span className="block text-xs text-zinc-400 dark:text-zinc-500">{s.labelEn}</span>
                                                    </dt>
                                                    <dd className="text-sm">
                                                        <span className="font-semibold text-zinc-900 dark:text-zinc-50">{s.value}</span>
                                                        {s.note && <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{s.note}</span>}
                                                    </dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {rec.tips.length > 0 && (
                            <div className="space-y-2">
                                {rec.tips.map((tip) => (
                                    <Note key={tip} tone={rec.verdict === 'critical' && tip === rec.tips[0] ? 'warn' : 'info'}>
                                        {tip}
                                    </Note>
                                ))}
                            </div>
                        )}

                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            Die Namen in OBS können je nach Version leicht abweichen. Darunter steht jeweils die englische Bezeichnung.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
