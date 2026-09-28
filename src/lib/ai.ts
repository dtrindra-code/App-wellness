// Thin wrapper over the artifact `sample` capability (ask Claude from the page).
// Outside a Claude viewer everything reports unavailable and callers hide the feature.

type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: <T = unknown>(input: string, opts?: Record<string, unknown>) => Promise<T>;
  limits: () => Promise<{ images?: { maxCount: number; mediaTypes: string[] } }>;
};

let samplePromise: Promise<SampleFn | null> | null = null;

function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    samplePromise = window.claude
      ? (window.claude.use('sample') as Promise<SampleFn | null>).catch(() => null)
      : Promise.resolve(null);
  }
  return samplePromise;
}

export async function aiAvailable(): Promise<boolean> {
  return (await getSample()) !== null;
}

export async function aiImagesAvailable(): Promise<boolean> {
  const s = await getSample();
  if (!s) return false;
  try {
    return !!(await s.limits()).images;
  } catch {
    return false;
  }
}

export interface AiError { code: string; message: string }

/** User-facing French message for a sample error code. */
export function aiErrorMessage(e: unknown): string {
  const code = (e as AiError)?.code;
  switch (code) {
    case 'not_granted':
    case 'sampling_disabled':
      return 'L’analyse par IA n’est pas autorisée sur cette page.';
    case 'rate_limited':
      return 'Trop de demandes d’un coup. Réessaie dans une minute.';
    case 'image_rejected':
      return 'Cette image n’a pas pu être lue. Essaie une autre photo (JPEG ou PNG).';
    case 'images_unavailable':
      return 'L’analyse de photos n’est pas disponible ici.';
    case 'invalid_json':
      return 'Réponse illisible. Réessaie, ou saisis les valeurs à la main.';
    case 'cancelled':
      return '';
    default:
      return 'L’analyse a échoué. Réessaie ou saisis à la main.';
  }
}

/** Ask Claude for JSON about one or more images. Throws AiError. */
export async function askJSON<T>(prompt: string, images?: Blob | Blob[], signal?: AbortSignal): Promise<T> {
  const s = await getSample();
  if (!s) throw { code: 'not_granted', message: 'sample unavailable' } as AiError;
  const opts: Record<string, unknown> = {};
  if (images) opts.images = images;
  if (signal) opts.signal = signal;
  return s.json<T>(prompt, opts);
}

/** Plain text answer (e.g. a short coaching note). Throws AiError. */
export async function askText(prompt: string, opts: { quick?: boolean; signal?: AbortSignal } = {}): Promise<string> {
  const s = await getSample();
  if (!s) throw { code: 'not_granted', message: 'sample unavailable' } as AiError;
  const { text } = await s(prompt, { modelTier: opts.quick ? 'quick' : 'default', signal: opts.signal });
  return text;
}
