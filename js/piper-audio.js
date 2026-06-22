/**
 * Piper neural TTS — synthesize Fonora IPA via phoneme IDs (lazy-loads model from HuggingFace).
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

let initPromise = null;
let initError = null;
let voiceId = null;
let voiceData = null;
let onnxRuntime = null;
let onnxWasmBasePath = null;

export function getPiperVoiceForLang(lang) {
  return PIPER_VOICE_BY_LANG[lang] ?? null;
}

/**
 * Playback plan for Samples — Piper neural only (no eSpeak IPA fallback).
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

/** Map compact IPA to Piper phoneme ID sequence (^ … $ with pad tokens). */
export function ipaToPiperPhonemeIds(ipa, phonemeIdMap) {
  const pad = phonemeIdMap._?.[0];
  const bos = phonemeIdMap['^']?.[0];
  const eos = phonemeIdMap['$']?.[0];
  if (pad == null || bos == null || eos == null) {
    throw new Error('Invalid Piper phoneme map');
  }

  const segments = expandSegmentsForPiper(segmentIpa(ipa));
  const ids = [bos];
  let stressed = false;

  for (const segment of segments) {
    if (STRESS_MARKS.has(segment)) continue;

    if (!stressed && VOWEL_LIKE.test(segment) && phonemeIdMap['ˈ']) {
      ids.push(pad, phonemeIdMap['ˈ'][0]);
      stressed = true;
    }

    const mapped = phonemeIdMap[segment];
    if (!mapped?.length) {
      throw new Error(`Piper has no phoneme for “${segment}”`);
    }
    ids.push(pad, mapped[0]);
  }

  ids.push(pad, eos);
  return ids;
}

/** True when every IPA segment maps into a Piper voice phoneme inventory. */
export function canMapIpaToPiper(ipa, phonemeIdMap) {
  try {
    ipaToPiperPhonemeIds(ipa, phonemeIdMap);
    return true;
  } catch {
    return false;
  }
}

async function loadPiperModule() {
  return import('/vendor/piper-tts-web/piper-tts-web.js');
}

async function probeOnnxWasmBase(basePath) {
  const url = new URL('ort-wasm-simd-threaded.wasm', basePath).href;
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveOnnxWasmBasePath() {
  if (onnxWasmBasePath) return onnxWasmBasePath;
  if (await probeOnnxWasmBase(ONNX_WASM_BASE_PATH)) {
    onnxWasmBasePath = ONNX_WASM_BASE_PATH;
    return onnxWasmBasePath;
  }
  if (await probeOnnxWasmBase(ONNX_WASM_CDN_BASE)) {
    onnxWasmBasePath = ONNX_WASM_CDN_BASE;
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
      onProgress?.('Downloading voice model (~20–60 MB, one-time)…');
      const data = await provider.fetch(voice);
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

export async function synthesizePiperIpa(ipa, voice = 'en_US-lessac-medium', onProgress) {
  const trimmed = String(ipa || '').trim();
  if (!trimmed) return null;

  const { voiceData: data, onnxRuntime: runtime } = await ensurePiper(voice, onProgress);
  const config = data[0];
  const phonemeIds = ipaToPiperPhonemeIds(trimmed, config.phoneme_id_map);
  const response = await runtime.generate(
    { phoneme_ids: phonemeIds, phonemes: [], text: trimmed },
    data,
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

export async function playPiperIpa(ipa, voice = 'en_US-lessac-medium', onProgress) {
  primeAudioContext();
  const decoded = await synthesizePiperIpa(ipa, voice, onProgress);
  if (!decoded?.samples?.length) return;
  await playEspeakSamples(decoded.samples, decoded.sampleRate);
}
