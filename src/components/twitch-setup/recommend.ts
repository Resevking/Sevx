/**
 * Calculates OBS settings for streaming to Twitch from a few simple questions
 * (upload speed, connection type, graphics card, CPU, content type, monitor resolution).
 *
 * Values follow Twitch's broadcasting guidelines for H.264 streams:
 * max. 6000 kbps video, CBR, 2 s keyframe interval, AAC audio at 160 kbps / 48 kHz.
 */

export type Gpu = 'nvidia' | 'amd' | 'intel' | 'apple' | 'none' | 'unknown';
export type CpuPower = 'low' | 'mid' | 'high';
export type ContentType = 'fast' | 'calm' | 'chat';
export type Connection = 'lan' | 'wifi';
export type Canvas = '1080' | '1440' | '2160';

export interface CalculatorInput {
    uploadMbps: number;
    connection: Connection;
    gpu: Gpu;
    cpu: CpuPower;
    content: ContentType;
    canvas: Canvas;
}

export interface Setting {
    label: string;
    labelEn: string;
    value: string;
    note?: string;
}

export interface SettingGroup {
    title: string;
    path: string;
    settings: Setting[];
}

export type Verdict = 'good' | 'tight' | 'critical';

export interface Recommendation {
    tierLabel: string;
    width: number;
    height: number;
    fps: 30 | 60;
    videoBitrate: number;
    audioBitrate: number;
    totalBitrate: number;
    verdict: Verdict;
    groups: SettingGroup[];
    tips: string[];
}

export const MAX_VIDEO_BITRATE = 6000;
export const AUDIO_BITRATE = 160;

interface Tier {
    id: '1080p60' | '1080p30' | '720p60' | '720p30' | '480p30';
    width: number;
    height: number;
    fps: 30 | 60;
    /** Bitrate recommended by Twitch for this resolution/frame rate. */
    ideal: number;
    /** Lowest bitrate at which this tier still looks acceptable. */
    min: number;
}

const TIERS: Record<Tier['id'], Tier> = {
    '1080p60': { id: '1080p60', width: 1920, height: 1080, fps: 60, ideal: 6000, min: 5000 },
    '1080p30': { id: '1080p30', width: 1920, height: 1080, fps: 30, ideal: 4500, min: 4000 },
    '720p60': { id: '720p60', width: 1280, height: 720, fps: 60, ideal: 4500, min: 3500 },
    '720p30': { id: '720p30', width: 1280, height: 720, fps: 30, ideal: 3000, min: 2500 },
    '480p30': { id: '480p30', width: 854, height: 480, fps: 30, ideal: 1500, min: 0 }
};

/** Preferred tiers per content type, best first. Fast games favour frame rate over resolution. */
const TIER_ORDER: Record<ContentType, Tier['id'][]> = {
    fast: ['1080p60', '720p60', '720p30', '480p30'],
    calm: ['1080p60', '1080p30', '720p60', '720p30', '480p30'],
    chat: ['1080p30', '720p30', '480p30']
};

const CANVAS_SIZE: Record<Canvas, [number, number]> = {
    '1080': [1920, 1080],
    '1440': [2560, 1440],
    '2160': [3840, 2160]
};

type EncoderStrength = 'strong' | 'medium' | 'weak';

function encoderStrength(gpu: Gpu, cpu: CpuPower): EncoderStrength {
    if (gpu === 'nvidia' || gpu === 'amd' || gpu === 'intel' || gpu === 'apple') return 'strong';
    if (cpu === 'high') return 'strong';
    if (cpu === 'mid') return 'medium';
    return 'weak';
}

function tierAllowed(tier: Tier, strength: EncoderStrength): boolean {
    if (strength === 'strong') return true;
    if (strength === 'medium') return tier.id !== '1080p60';
    return tier.id === '720p30' || tier.id === '480p30';
}

/** Video bitrate (kbps) that safely fits the upload, leaving headroom for fluctuations and other traffic. */
export function videoBudget(uploadMbps: number, connection: Connection): number {
    if (!Number.isFinite(uploadMbps) || uploadMbps <= 0) return 0;
    const headroom = connection === 'wifi' ? 0.6 : 0.75;
    const usable = uploadMbps * 1000 * headroom - AUDIO_BITRATE;
    const rounded = Math.floor(usable / 100) * 100;
    return Math.max(0, Math.min(MAX_VIDEO_BITRATE, rounded));
}

function encoderSettings(input: CalculatorInput): Setting[] {
    const { gpu, cpu } = input;
    switch (gpu) {
        case 'nvidia':
            return [
                { label: 'Video-Encoder', labelEn: 'Video Encoder', value: 'NVIDIA NVENC H.264' },
                {
                    label: 'Voreinstellung',
                    labelEn: 'Preset',
                    value: 'P5: Langsam (Gute Qualität)',
                    note: 'Bei «Kodierung überlastet» auf P4 wechseln.'
                },
                { label: 'Abstimmung', labelEn: 'Tuning', value: 'Hohe Qualität (High Quality)' },
                { label: 'Mehrfachdurchlauf-Modus', labelEn: 'Multipass Mode', value: 'Zwei Durchläufe (Viertelauflösung)' },
                { label: 'Profil', labelEn: 'Profile', value: 'high' },
                { label: 'Max. B-Frames', labelEn: 'Max B-frames', value: '2' }
            ];
        case 'amd':
            return [
                { label: 'Video-Encoder', labelEn: 'Video Encoder', value: 'AMD HW H.264 (AVC)' },
                { label: 'Voreinstellung', labelEn: 'Preset', value: 'Qualität (Quality)', note: 'Bei «Kodierung überlastet» auf «Ausgeglichen» wechseln.' },
                { label: 'Profil', labelEn: 'Profile', value: 'high' }
            ];
        case 'intel':
            return [
                { label: 'Video-Encoder', labelEn: 'Video Encoder', value: 'QuickSync H.264' },
                {
                    label: 'Zielnutzung',
                    labelEn: 'Target Usage',
                    value: 'TU4: Balanced',
                    note: 'Läuft es stabil, kannst du TU3 oder TU2 für mehr Qualität testen.'
                },
                { label: 'Profil', labelEn: 'Profile', value: 'high' }
            ];
        case 'apple':
            return [
                { label: 'Video-Encoder', labelEn: 'Video Encoder', value: 'Apple VT H264 Hardware Encoder' },
                { label: 'Profil', labelEn: 'Profile', value: 'high' }
            ];
        default: {
            const preset = cpu === 'high' ? 'faster' : cpu === 'mid' ? 'veryfast' : 'superfast';
            return [
                { label: 'Video-Encoder', labelEn: 'Video Encoder', value: 'x264 (Prozessor)' },
                {
                    label: 'CPU-Voreinstellung',
                    labelEn: 'CPU Usage Preset',
                    value: preset,
                    note: 'Schnellere Stufe (z. B. superfast) = weniger CPU-Last, etwas weniger Bildqualität.'
                },
                { label: 'Profil', labelEn: 'Profile', value: 'high' },
                { label: 'Abstimmung', labelEn: 'Tune', value: '(keine)' }
            ];
        }
    }
}

export function recommend(input: CalculatorInput): Recommendation {
    const budget = videoBudget(input.uploadMbps, input.connection);
    const strength = encoderStrength(input.gpu, input.cpu);

    const order = TIER_ORDER[input.content];
    const tier =
        order
            .map((id) => TIERS[id])
            .find((t) => {
                if (!tierAllowed(t, strength)) return false;
                // Fast games at 1080p60 need the full bitrate, otherwise 720p60 looks clearly better.
                const needed = input.content === 'fast' && t.id === '1080p60' ? t.ideal : t.min;
                return budget >= needed;
            }) ?? TIERS['480p30'];

    const videoBitrate = Math.max(budget > 0 ? Math.min(budget, tier.ideal) : 0, 0);
    const verdict: Verdict = budget >= 3000 ? 'good' : budget >= 1000 ? 'tight' : 'critical';

    const [canvasW, canvasH] = CANVAS_SIZE[input.canvas];
    const needsScaling = canvasW !== tier.width || canvasH !== tier.height;
    const scaleFilter = !needsScaling
        ? 'Keine Skalierung nötig'
        : strength === 'strong'
          ? 'Lanczos (geschärfte Skalierung, 36 Samples)'
          : 'Bikubisch (geschärfte Skalierung, 16 Samples)';

    const groups: SettingGroup[] = [
        {
            title: 'Stream',
            path: 'Einstellungen → Stream',
            settings: [
                { label: 'Dienst', labelEn: 'Service', value: 'Twitch' },
                {
                    label: 'Verbindung',
                    labelEn: 'Connection',
                    value: 'Konto verbinden (empfohlen)',
                    note: 'Alternative: «Stream-Key verwenden» und den Key aus dem Dashboard einfügen.'
                },
                { label: 'Server', labelEn: 'Server', value: 'Automatisch (empfohlen)' }
            ]
        },
        {
            title: 'Ausgabe',
            path: 'Einstellungen → Ausgabe → Reiter «Streaming»',
            settings: [
                { label: 'Ausgabemodus', labelEn: 'Output Mode', value: 'Erweitert', note: 'Ganz oben im Ausgabe-Fenster umstellen.' },
                ...encoderSettings(input),
                { label: 'Qualitätsregelung', labelEn: 'Rate Control', value: 'CBR' },
                { label: 'Bitrate', labelEn: 'Bitrate', value: `${videoBitrate} Kbps` },
                { label: 'Keyframe-Intervall', labelEn: 'Keyframe Interval', value: '2 s', note: 'Twitch verlangt 2 Sekunden. «0» (auto) nicht verwenden.' }
            ]
        },
        {
            title: 'Audio-Bitrate',
            path: 'Einstellungen → Ausgabe → Reiter «Audio»',
            settings: [{ label: 'Audio-Bitrate (Spur 1)', labelEn: 'Audio Bitrate', value: `${AUDIO_BITRATE} kbps` }]
        },
        {
            title: 'Audio',
            path: 'Einstellungen → Audio',
            settings: [
                { label: 'Abtastrate', labelEn: 'Sample Rate', value: '48 kHz' },
                { label: 'Kanäle', labelEn: 'Channels', value: 'Stereo' }
            ]
        },
        {
            title: 'Video',
            path: 'Einstellungen → Video',
            settings: [
                {
                    label: 'Basis-(Leinwand-)Auflösung',
                    labelEn: 'Base (Canvas) Resolution',
                    value: `${canvasW}x${canvasH}`,
                    note: 'Entspricht deinem Monitor.'
                },
                { label: 'Ausgabe-(skalierte) Auflösung', labelEn: 'Output (Scaled) Resolution', value: `${tier.width}x${tier.height}` },
                { label: 'Skalierungsfilter', labelEn: 'Downscale Filter', value: scaleFilter },
                { label: 'Gemeinsame FPS-Werte', labelEn: 'Common FPS Values', value: String(tier.fps) }
            ]
        },
        {
            title: 'Erweitert',
            path: 'Einstellungen → Erweitert → Netzwerk',
            settings: [
                {
                    label: 'Bitrate dynamisch ändern, um Überlastung zu bewältigen',
                    labelEn: 'Dynamically change bitrate to manage congestion',
                    value: 'Aktiviert',
                    note: 'Senkt die Bitrate kurz, statt dass der Stream bei Internet-Schwankungen ruckelt.'
                }
            ]
        }
    ];

    const tips: string[] = [];
    if (verdict === 'critical') {
        tips.push(
            'Dein Upload ist für einen stabilen Stream sehr knapp. Prüfe den Speedtest per LAN-Kabel, schliesse andere Geräte/Uploads oder frage deinen Anbieter nach einem Abo mit mehr Upload.'
        );
    }
    if (input.connection === 'wifi') {
        tips.push('WLAN schwankt stark. Mit einem LAN-Kabel wird dein Stream deutlich stabiler – und du kannst eine höhere Bitrate nutzen.');
    }
    if (input.content === 'fast' && tier.id === '720p60') {
        tips.push('Bei schnellen Spielen sieht 720p mit 60 FPS fast immer besser aus als 1080p mit zu wenig Bitrate (Klötzchenbildung).');
    }
    if (input.gpu === 'unknown') {
        tips.push(
            'Welche Grafikkarte du hast, siehst du unter Windows im Task-Manager → «Leistung» → «GPU» bzw. am Mac im Apple-Menü → «Über diesen Mac». Mit NVIDIA, AMD oder Intel-Grafik kannst du den Hardware-Encoder nutzen und entlastest deinen Prozessor stark.'
        );
    }
    if (strength === 'weak') {
        tips.push('Dein Prozessor muss Spiel und Stream gleichzeitig stemmen. Begrenze die FPS im Spiel (z. B. auf 60) und schliesse unnötige Programme.');
    }
    if (input.gpu === 'nvidia') {
        tips.push(
            'Optional: Mit einer NVIDIA-Grafikkarte kannst du in OBS unter Einstellungen → Stream «Enhanced Broadcasting» aktivieren. OBS sendet dann selbst mehrere Qualitätsstufen und wählt die Encoder-Einstellungen automatisch.'
        );
    }
    if (tier.id !== '480p30' && videoBitrate >= 4500) {
        tips.push(
            'Kleine Kanäle erhalten nicht immer Qualitätsstufen (Transkodierung). Dann müssen alle Zuschauer deine volle Bitrate laden. Klagen Zuschauer über Buffering, senke die Bitrate auf 3500–4500 Kbps.'
        );
    }

    return {
        tierLabel: `${tier.height}p · ${tier.fps} FPS`,
        width: tier.width,
        height: tier.height,
        fps: tier.fps,
        videoBitrate,
        audioBitrate: AUDIO_BITRATE,
        totalBitrate: videoBitrate + AUDIO_BITRATE,
        verdict,
        groups,
        tips
    };
}

/** Plain-text version of the recommendation, for copying into notes or a chat. */
export function recommendationAsText(rec: Recommendation): string {
    const lines = [`OBS-Einstellungen für Twitch – ${rec.tierLabel}, ${rec.videoBitrate} Kbps`, ''];
    for (const group of rec.groups) {
        lines.push(`[${group.path}]`);
        for (const s of group.settings) {
            lines.push(`  ${s.label}: ${s.value}`);
        }
        lines.push('');
    }
    return lines.join('\n').trim();
}
