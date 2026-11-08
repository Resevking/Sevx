import { useState } from 'react';
import { PROBLEMS } from './content';
import { LinkButton } from './ui';

function matches(query: string, text: string): boolean {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const haystack = text.toLowerCase();
    return words.every((w) => haystack.includes(w));
}

export default function Troubleshooter({ username }: { username: string }) {
    const [query, setQuery] = useState('');
    const visible = PROBLEMS.filter((p) => !query.trim() || matches(query, `${p.title} ${p.keywords} ${p.cause}`));

    return (
        <div className="space-y-4">
            <div>
                <label htmlFor="problem-search" className="mb-2 block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Was passiert bei dir?
                </label>
                <input
                    id="problem-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="z. B. ruckelt, kein Ton, schwarzes Bild, Stream-Key …"
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
            </div>

            {visible.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                    Nichts gefunden. Versuch ein anderes Stichwort – oder lösche die Suche, um alle Probleme zu sehen.
                </p>
            ) : (
                <ul className="space-y-2">
                    {visible.map((p) => (
                        <li key={p.id}>
                            <details className="group rounded-xl border border-zinc-200 bg-white open:border-violet-300 open:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:open:border-violet-800">
                                <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 font-medium text-zinc-900 marker:hidden dark:text-zinc-50 [&::-webkit-details-marker]:hidden">
                                    <span>{p.title}</span>
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 16 16"
                                        className="mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </summary>
                                <div className="border-t border-zinc-100 px-4 pb-4 pt-3 text-sm leading-relaxed text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                                    <p>
                                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">Ursache: </span>
                                        {p.cause}
                                    </p>
                                    <p className="mt-3 font-semibold text-zinc-900 dark:text-zinc-100">So löst du es:</p>
                                    <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 marker:text-zinc-400 dark:marker:text-zinc-500">
                                        {p.fixes.map((fix, i) => (
                                            <li key={i}>{fix}</li>
                                        ))}
                                    </ol>
                                    {p.links && (
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {p.links.map((link) => (
                                                <LinkButton key={link.label} href={link.href(username)}>
                                                    {link.label}
                                                </LinkButton>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </details>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
