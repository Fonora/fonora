/**
 * Piper neural TTS — synthesize Fonora IPA via phoneme IDs (lazy-loads model from HuggingFace).
 */
import { segmentIpa } from './ipa-espeak-format.js';
import { playEspeakSamples, primeAudioContext } from './espeak-audio.js';

export const PIPER_VOICE_OPTIONS = [
  { id: 'en_US-lessac-medium', label: 'Lessac (US, natural)' },
  { id: 'en_US-libritts_r-medium', label: 'LibriTTS R (US, natural)' },
  { id: 'en_GB-alba-medium', label: 'Alba (British, natural)' },
];

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
};

const STRESS_MARKS = new Set(['ˈ', 'ˌ']);
const VOWEL_LIKE = /[aeiouæɑɒɔəɚɝɐɨʉɯɪʊɜɞɵʏyɛœøʌaɪaʊoʊeɪɔɪ]/;

let initPromise = null;
let initError = null;
let voiceId = null;
let voiceData = null;
let onnxRuntime = null;

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

async function loadPiperModule() {
  return import('/node_modules/piper-tts-web/dist/piper-tts-web.js');
}

function createOnnxRuntime(mod) {
  const numThreads = (typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated)
    ? navigator.hardwareConcurrency
    : 1;
  return new mod.OnnxWebRuntime({
    basePath: '/vendor/onnx/',
    numThreads,
  });
}

async function ensurePiper(voice, onProgress) {
  if (voiceData && voiceId === voice && onnxRuntime) return { voiceData, onnxRuntime };

  if (!initPromise || voiceId !== voice) {
    voiceId = voice;
    initError = null;
    initPromise = (async () => {
      onProgress?.('Loading neural voice engine…');
      const mod = await loadPiperModule();
      const provider = new mod.HuggingFaceVoiceProvider();
      onProgress?.('Downloading voice model (~60 MB, one-time)…');
      const data = await provider.fetch(voice);
      const runtime = createOnnxRuntime(mod);
      voiceData = data;
      onnxRuntime = runtime;
      return { voiceData: data, onnxRuntime: runtime };
    })().catch((err) => {
      initError = err;
      initPromise = null;
      voiceData = null;
      onnxRuntime = null;
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
