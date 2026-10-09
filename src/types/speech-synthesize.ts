/**
 * Speech Synthesis Capability Types
 *
 * Platform capability `speech:synthesize@v1` — text to speech on the local
 * fleet. Asynchronous: `capabilities.run` returns a run; the audio is an
 * artifact. The capability is gated by `ENABLE_SPEECH_SYNTHESIS` on the
 * platform (default off), so a client may see it only once enabled.
 *
 * The shapes are flat and camelCase. The platform rejects unknown input
 * fields rather than dropping them, so a misspelt option fails loudly.
 * */

/** Capability slug, for `client.capabilities.run(...)`. */
export const SPEECH_SYNTHESIZE = 'speech:synthesize' as const;

/** Engines available at launch. */
export type SpeechEngine = 'kokoro' | 'chatterbox';

/**
 * Fleet priority class. `interactive` is deliberately absent: a call over
 * this capability is never one a person is waiting on inside a request.
 * Default is the platform's `SPEECH_DEFAULT_PRIORITY` (`batch`).
 */
export type SpeechPriority = 'production' | 'batch' | 'backfill';

/** Input contract for `speech:synthesize@v1`. */
export interface SpeechSynthesizeInput {
  /**
   * UTF-8 text, NFC-normalised by the platform. Plain text only: no SSML.
   * 1-2000 characters at the contract; each engine has a tighter cap
   * (read it from the capability's `experienceMeta`). Over the cap is
   * refused with `text_too_long`, never truncated or split.
   */
  text: string;

  /** Which engine renders the speech. */
  engine: SpeechEngine;

  /** kokoro: REQUIRED preset id, e.g. `af_heart`. chatterbox: not accepted. */
  voice?: string;

  /**
   * chatterbox: optional reference voice, an artifact id owned by the calling
   * app. kokoro: not accepted. The platform checks ownership and format only.
   */
  referenceAudioArtifactId?: string;

  /** kokoro only. 0.5 to 2. */
  speed?: number;

  /** chatterbox only. 0.25 to 2. */
  exaggeration?: number;

  /** chatterbox only. 0 to 1. */
  cfgWeight?: number;

  /** Best effort; the result reports `seedApplied`. Integer 0 to 2147483647. */
  seed?: number;

  /** Fleet class for this call. */
  priority?: SpeechPriority;
}

/** A non-fatal note on a successful synthesis. Never changes success. */
export interface SpeechWarning {
  /** e.g. `possible_truncation`, `seed_not_deterministic`, `reference_audio_trimmed`. */
  code: string;
  message: string;
}

/**
 * Output of `speech:synthesize@v1`: the artifact's metadata. The primary
 * output is the audio file itself, as an artifact (`semanticType: "audio"`).
 *
 * Everything under "what actually served" comes from the executing worker,
 * never from the request or the alias. The result carries no worker or host
 * name and no echo of the text.
 */
export interface SpeechSynthesizeResult {
  /** Storage URL. Treat as a bearer capability; do not forward credentials to it. */
  url: string;
  storageKey: string;
  contentType: 'audio/wav';
  sizeBytes: number;
  /** Lowercase hex SHA-256 of the file. */
  sha256: string;

  /** PCM s16le, mono. `sampleRate` is reported, not promised: read it. */
  durationMs: number;
  sampleRate: number;
  channels: 1;
  bitDepth: 16;

  servedEngine: SpeechEngine;
  /** `af_heart`-style preset, `chatterbox-default`, or `reference`. */
  servedVoice: string;
  /** The model id the runtime reported, e.g. `kokoro-82m`. */
  servedModel: string;
  /** `null` when the worker declared none. */
  modelRevision: string | null;
  /** e.g. `tts`. */
  runtime: string;
  /** Observed by the server; free string. `null` when unknown. */
  deviceObserved: string | null;
  /** `perth` for chatterbox output, otherwise `null`. */
  watermark: 'perth' | null;
  /** `null` when no seed was applied. */
  seedApplied: number | null;
  /** `false` when `modelRevision` or the device is unknown. */
  attributable: boolean;

  jobId: string;
  inputChars: number;
  /** Worker-measured; `null` if unreported. */
  wallMs: number | null;
  warnings: SpeechWarning[];
}
