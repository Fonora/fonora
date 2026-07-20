/**
 * Piper neural TTS, synthesize Fonora IPA via phoneme IDs (lazy-loads model from HuggingFace).
 */
import { segmentIpa } from './ipa-espeak-format.js';
import { playEspeakSamples, primeAudioContext } from './espeak-audio.js';
import {
  ONNX_WASM_BASE_PATH,
  ONNX_WASM_CDN_BASE,
  PIPER_VOICE_BASE_URL,
} from './fonora-config.js';

export const PIPER_VOICE_OPTIONS = [
  { id: 'en_US-lessac-medium', label: 'Lessac (US, natural)' },
  { id: 'en_US-libritts_r-medium', label: 'LibriTTS R (US, natural)' },
  { id: 'en_GB-alba-medium', label: 'Alba (British, natural)' },
];

/** Piper neural voices for multilingual Samples playback (lazy-loaded from HuggingFace). */
export const PIPER_VOICE_BY_LANG = {
  en: 'en_US-lessac-medium',
  es: 'es_ES-davefx-medium',
  fr: 'fr_FR-siwis-medium',
  de: 'de_DE-thorsten-medium',
  ar: 'ar_JO-kareem-medium',
  zh: 'zh_CN-huayan-medium',
};

const PIPER_SPLIT = {
  dʒ: ['d', 'ʒ'],
  tʃ: ['t', 'ʃ'],
  eɪ: ['e', 'ɪ'],
  aɪ: ['a', 'ɪ'],
  ɔɪ: ['ɔ', 'ɪ'],
  aʊ: ['a', 'ʊ'],
  oʊ: ['o', 'ʊ'],
  əʊ: ['ə', 'ʊ'],
  ɪə: ['ɪ', 'ə'],
  eə: ['e', 'ə'],
  ʊə: ['ʊ', 'ə'],
  'aː': ['a', 'ː'],
  'iː': ['i', 'ː'],
  'uː': ['u', 'ː'],
  'oː': ['o', 'ː'],
  'eː': ['e', 'ː'],
  'ɜː': ['ɜ', 'ː'],
  'ɔː': ['ɔ', 'ː'],
  'æː': ['æ', 'ː'],
};

const STRESS_MARKS = new Set(['ˈ', 'ˌ']);
const VOWEL_LIKE = /[aeiouæɑɒɔəɚɝɐɨʉɯɪʊɜɞɵʏyɛœøʌaɪaʊoʊeɪɔɪ]/;

/**
 * Lax vowels. LibriTTS sounds better without forced primary stress on these
 * (open KIT drifts less). Lessac / Alba sound better WITH the original stress.
 */
const LAX_NO_AUTO_STRESS = new Set(['ɪ', 'ʊ', 'æ', 'ʌ', 'ɛ', 'ə', 'ɐ', 'ɒ', 'ɨ']);

/** Voices that should skip auto-stress on lax vowels. */
const PIPER_VOICES_SKIP_LAX_STRESS = new Set(['en_US-libritts_r-medium']);

/** True when this Piper voice should leave lax vowels unstressed. */
export function piperSkipsLaxAutoStress(voice) {
  return PIPER_VOICES_SKIP_LAX_STRESS.has(String(voice || ''));
}

/** Soft aliases when a voice lacks an exact IPA segment (never hard-fail listen). */
const PIPER_PHONE_FALLBACKS = {
  ɡ: 'g',
  ɾ: 't',
  ɹ: 'r',
  ɻ: 'r',
  ɫ: 'l',
  ɬ: 'l',
  ɲ: 'n',
  ŋ: 'n',
  ɟ: 'j',
  ʔ: '',
  ɸ: 'f',
  β: 'v',
  θ: 't',
  ð: 'd',
  ʃ: 's',
  ʒ: 'z',
  x: 'h',
  ɣ: 'g',
  ħ: 'h',
  ʕ: 'a',
};

/** Compact probe covering core Fonoran vowel qualities for voice gating. */
export const FONORAN_CORE_IPA_PROBE = 'mɪ mi bɛ sæ sʌ bʊ bɑ';

const PIPER_CACHE_NAME = 'fonora-piper-v3';

let initPromise = null;
let initError = null;
let voiceId = null;
let voiceData = null;
let onnxRuntime = null;
let onnxWasmBasePath = null;

function voiceOnnxUrl(baseUrl, voice) {
  return `${baseUrl}/${voice}/${voice}.onnx`;
}

function voiceConfigUrl(baseUrl, voice) {
  return `${baseUrl}/${voice}/${voice}.onnx.json`;
}

function isValidVoiceConfig(config) {
  return Boolean(config?.phoneme_id_map && config?.inference && config?.audio);
}

async function resolveOnnxBytes(modelRef) {
  if (modelRef instanceof Uint8Array) return modelRef;
  if (modelRef instanceof ArrayBuffer) return new Uint8Array(modelRef);
  if (typeof modelRef === 'string') {
    const res = await fetch(modelRef);
    if (!res.ok) throw new Error('Could not read Piper model bytes');
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error('Unsupported Piper model format');
}

function voiceFilesFromBytes(config, onnxBytes) {
  const blobUrl = URL.createObjectURL(new Blob([onnxBytes], { type: 'application/octet-stream' }));
  return [config, blobUrl];
}

async function readCachedVoiceFiles(baseUrl, voice) {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(PIPER_CACHE_NAME);
    const onnxRes = await cache.match(voiceOnnxUrl(baseUrl, voice));
    const jsonRes = await cache.match(voiceConfigUrl(baseUrl, voice));
    if (!onnxRes?.ok || !jsonRes?.ok) return null;
    const [onnxBuffer, configText] = await Promise.all([
      onnxRes.arrayBuffer(),
      jsonRes.text(),
    ]);
    const config = JSON.parse(configText);
    if (!isValidVoiceConfig(config) || !onnxBuffer?.byteLength) return null;
    return voiceFilesFromBytes(config, new Uint8Array(onnxBuffer));
  } catch {
    return null;
  }
}

async function storeVoiceFiles(baseUrl, voice, files) {
  if (typeof caches === 'undefined') return;
  try {
    const config = files[0];
    if (!isValidVoiceConfig(config)) return;
    const onnxBytes = await resolveOnnxBytes(files[1]);
    const cache = await caches.open(PIPER_CACHE_NAME);
    await Promise.all([
      cache.put(voiceOnnxUrl(baseUrl, voice), new Response(onnxBytes)),
      cache.put(voiceConfigUrl(baseUrl, voice), new Response(JSON.stringify(config), {
        headers: { 'Content-Type': 'application/json' },
      })),
    ]);
  } catch {
    // Cache write failures are non-fatal.
  }
}

async function fetchVoiceFiles(provider, voice, onProgress) {
  const cached = await readCachedVoiceFiles(PIPER_VOICE_BASE_URL, voice);
  if (cached) {
    onProgress?.('Loading cached voice model…');
    return cached;
  }

  onProgress?.('Downloading voice model (~20–60 MB, one-time)…');
  const data = await provider.fetch(voice);
  void storeVoiceFiles(PIPER_VOICE_BASE_URL, voice, data);
  return data;
}

export function getPiperVoiceForLang(lang) {
  return PIPER_VOICE_BY_LANG[lang] ?? null;
}

/**
 * Playback plan for Samples, Piper neural only (no eSpeak IPA fallback).
 * @returns {{ engine: 'piper', piperVoice: string } | null}
 */
export function getSamplePlaybackPlan(lang) {
  const piperVoice = getPiperVoiceForLang(lang);
  if (!piperVoice) return null;
  return { engine: 'piper', piperVoice };
}

function expandSegmentsForPiper(segments) {
  const out = [];
  for (const segment of segments) {
    const split = PIPER_SPLIT[segment];
    if (split) out.push(...split);
    else out.push(segment);
  }
  return out;
}

function isConsonantSchwaClip(segments) {
  const nuclei = segments.filter((segment) => !STRESS_MARKS.has(segment) && VOWEL_LIKE.test(segment));
  return nuclei.length === 1 && nuclei[0] === 'ə' && segments.includes('ə');
}

/**
 * Resolve a Piper phoneme id, soft-mapping unknowns instead of throwing.
 * @returns {number | null}
 */
export function resolvePiperPhonemeId(segment, phonemeIdMap) {
  const direct = phonemeIdMap?.[segment];
  if (direct?.length) return direct[0];

  const fallback = PIPER_PHONE_FALLBACKS[segment];
  if (fallback === '') return null;
  if (fallback && phonemeIdMap?.[fallback]?.length) return phonemeIdMap[fallback][0];

  // Last resort: skip unmapped length/diacritic-like junk rather than kill audio.
  return null;
}

/** True when a voice inventory can speak the Fonoran core vowel probe (soft-map allowed). */
export function piperVoiceCoversFonoranCore(phonemeIdMap) {
  return canMapIpaToPiper(FONORAN_CORE_IPA_PROBE, phonemeIdMap);
}

function appendPiperWordPhonemeIds(ids, ipaWord, phonemeIdMap, pad, options = {}) {
  const segments = expandSegmentsForPiper(segmentIpa(ipaWord));
  const schwaClip = Boolean(options.teachingClip) && isConsonantSchwaClip(segments);
  let stressed = false;

  for (const segment of segments) {
    if (STRESS_MARKS.has(segment)) continue;

    const unstressedSchwa = schwaClip && segment === 'ə';
    // Default: stress lax vowels (Lessac/Alba). Opt-in skip for LibriTTS only.
    const skipStress = Boolean(options.skipLaxAutoStress)
      && LAX_NO_AUTO_STRESS.has(segment)
      && !options.forceStress;
    if (
      !stressed
      && VOWEL_LIKE.test(segment)
      && phonemeIdMap['ˈ']
      && !unstressedSchwa
      && !skipStress
    ) {
      ids.push(pad, phonemeIdMap['ˈ'][0]);
      stressed = true;
    }

    const phonemeId = resolvePiperPhonemeId(segment, phonemeIdMap);
    if (phonemeId == null) continue;
    ids.push(pad, phonemeId);
  }
}

/** Map compact IPA to Piper phoneme ID sequence (^ … $ with pad tokens). */
export function ipaToPiperPhonemeIds(ipa, phonemeIdMap, options = {}) {
  const pad = phonemeIdMap._?.[0];
  const bos = phonemeIdMap['^']?.[0];
  const eos = phonemeIdMap['$']?.[0];
  if (pad == null || bos == null || eos == null) {
    throw new Error('Invalid Piper phoneme map');
  }

  const words = String(ipa || '').trim().split(/\s+/).filter(Boolean);
  const ids = [bos];
  for (const word of words) {
    appendPiperWordPhonemeIds(ids, word, phonemeIdMap, pad, options);
  }

  ids.push(pad, eos);
  return ids;
}

/**
 * True when IPA can be mapped for Piper (soft-map allowed).
 * Still false if the voice lacks BOS/EOS/pad scaffolding.
 */
export function canMapIpaToPiper(ipa, phonemeIdMap) {
  try {
    const ids = ipaToPiperPhonemeIds(ipa, phonemeIdMap);
    return Array.isArray(ids) && ids.length > 2;
  } catch {
    return false;
  }
}

async function loadPiperModule() {
  return import('/vendor/piper-tts-web/piper-tts-web.js');
}

/** Turn a site-relative or absolute path into a URL base suitable for `new URL(relative, base)`. */
function resolveAssetBaseUrl(path) {
  const withSlash = path.endsWith('/') ? path : `${path}/`;
  if (/^https?:\/\//i.test(withSlash)) {
    return withSlash;
  }
  if (typeof window === 'undefined' || !window.location?.href) {
    return withSlash;
  }
  if (window.location.protocol === 'file:') {
    return null;
  }
  const rooted = withSlash.startsWith('/')
    ? `${window.location.origin}${withSlash}`
    : new URL(withSlash, window.location.href).href;
  return rooted.endsWith('/') ? rooted : `${rooted}/`;
}

async function probeOnnxWasmBase(resolvedBaseUrl) {
  if (!resolvedBaseUrl) return false;

  let url;
  try {
    url = new URL('ort-wasm-simd-threaded.wasm', resolvedBaseUrl).href;
  } catch {
    return false;
  }

  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveOnnxWasmBasePath() {
  if (onnxWasmBasePath) return onnxWasmBasePath;

  const localBase = resolveAssetBaseUrl(ONNX_WASM_BASE_PATH);
  if (localBase && (await probeOnnxWasmBase(localBase))) {
    onnxWasmBasePath = localBase;
    return onnxWasmBasePath;
  }

  const cdnBase = resolveAssetBaseUrl(ONNX_WASM_CDN_BASE);
  if (cdnBase && (await probeOnnxWasmBase(cdnBase))) {
    onnxWasmBasePath = cdnBase;
    return onnxWasmBasePath;
  }

  throw new Error('ONNX Runtime WASM not found at /vendor/onnx/ or CDN fallback');
}

function createOnnxRuntime(mod, basePath) {
  const numThreads = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated)
    ? navigator.hardwareConcurrency
    : 1;
  return new mod.OnnxWebRuntime({
    basePath,
    numThreads,
  });
}

async function ensurePiper(voice, onProgress) {
  if (voiceData && voiceId === voice && onnxRuntime) return { voiceData, onnxRuntime };

  if (!initPromise || voiceId !== voice) {
    voiceId = voice;
    initError = null;
    onnxWasmBasePath = null;
    initPromise = (async () => {
      onProgress?.('Loading neural voice engine…');
      const mod = await loadPiperModule();
      const provider = new mod.HuggingFaceVoiceProvider({ baseUrl: PIPER_VOICE_BASE_URL });
      const data = await fetchVoiceFiles(provider, voice, onProgress);
      const wasmBasePath = await resolveOnnxWasmBasePath();
      const runtime = createOnnxRuntime(mod, wasmBasePath);
      voiceData = data;
      onnxRuntime = runtime;
      return { voiceData: data, onnxRuntime: runtime };
    })().catch((err) => {
      initError = err;
      initPromise = null;
      voiceData = null;
      onnxRuntime = null;
      onnxWasmBasePath = null;
      throw err;
    });
  }

  return initPromise;
}

export async function initPiperAudio(voice = 'en_US-lessac-medium', onProgress) {
  try {
    await ensurePiper(voice, onProgress);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

export function isPiperAudioReady(activeVoice = voiceId) {
  return Boolean(voiceData && onnxRuntime && voiceId === activeVoice);
}

export function getPiperInitError() {
  return initError?.message || null;
}

export async function synthesizePiperIpa(ipa, voice = 'en_US-lessac-medium', onProgress, options = {}) {
  const trimmed = String(ipa || '').trim();
  if (!trimmed) return null;

  const { voiceData: data, onnxRuntime: runtime } = await ensurePiper(voice, onProgress);
  const config = data[0];
  if (!isValidVoiceConfig(config)) {
    throw new Error('Invalid Piper voice configuration');
  }
  const phonemeOpts = {
    ...options,
    skipLaxAutoStress: options.skipLaxAutoStress ?? piperSkipsLaxAutoStress(voice),
  };
  const phonemeIds = ipaToPiperPhonemeIds(trimmed, config.phoneme_id_map, phonemeOpts);
  let payload = data;
  if (options.lengthScale != null && config.inference) {
    payload = [{ ...config, inference: { ...config.inference, length_scale: options.lengthScale } }, data[1]];
  }
  const response = await runtime.generate(
    { phoneme_ids: phonemeIds, phonemes: [], text: trimmed },
    payload,
    0,
  );

  const buffer = await response.file.arrayBuffer();
  return decodeWavPcm(new Uint8Array(buffer));
}

function decodeWavPcm(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataOffset = 44;
  const numSamples = (bytes.byteLength - dataOffset) / (bitsPerSample / 8);
  const pcm = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    pcm[i] = view.getInt16(dataOffset + i * 2, true);
  }
  return { samples: pcm, sampleRate };
}

export async function playPiperIpa(ipa, voice = 'en_US-lessac-medium', onProgress, options = {}) {
  primeAudioContext();
  const decoded = await synthesizePiperIpa(ipa, voice, onProgress, options);
  if (!decoded?.samples?.length) {
    throw new Error('Neural voice produced no audio');
  }
  await playEspeakSamples(decoded.samples, decoded.sampleRate, options);
}
