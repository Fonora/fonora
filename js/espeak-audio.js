/**
 * eSpeak NG audio synthesis (WASM) for phonetic playback in the browser.
 */
import EspeakInitializer from '../vendor/espeak-audio/espeak-ng.js';
import { ipaToEspeakSynthesisInput } from './ipa-espeak-format.js';

let initPromise = null;
let initError = null;
let worker = null;
let audioContext = null;
let currentSource = null;

function int16ToFloat32(samples) {
  const float32 = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    float32[i] = samples[i] / 32768;
  }
  return float32;
}

function mergeInt16Chunks(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function toInt16Array(samples) {
  if (samples instanceof Int16Array) return new Int16Array(samples);
  if (ArrayBuffer.isView(samples)) {
    return new Int16Array(samples.buffer, samples.byteOffset, samples.byteLength / 2);
  }
  return Int16Array.from(samples);
}

async function getWorker() {
  if (worker) return worker;
  if (initError) throw initError;
  if (!initPromise) {
    initPromise = (async () => {
      const module = await EspeakInitializer();
      worker = await new module.eSpeakNGWorker();
      return worker;
    })().catch((err) => {
      initError = err;
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
  return worker;
}

export async function initEspeakAudio() {
  try {
    await getWorker();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

export function isEspeakAudioReady() {
  return Boolean(worker);
}

export function getEspeakAudioInitError() {
  return initError?.message || null;
}

/** Call synchronously from a user click/tap before any await, unlocks Web Audio. */
export function primeAudioContext() {
  if (typeof window === 'undefined') return;
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioContext = new Ctx();
  }
  if (audioContext?.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
}

function stopCurrentPlayback() {
  if (!currentSource) return;
  try {
    currentSource.stop();
  } catch {
    // already stopped
  }
  currentSource = null;
}

function stripEspeakIpa(ipa) {
  return String(ipa || '').replace(/_/g, '').trim();
}

/** Fast IPA lookup via the persistent audio worker (reuses WASM, ~100× faster than ipa.js). */
export async function textToIpaAudio(text, voice = 'en-us') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  const instance = await getWorker();
  instance.set_voice(voice);
  return stripEspeakIpa(instance.synthesize_ipa(trimmed).ipa);
}

/** Create a voice-scoped IPA lookup for batch lexicon builds. */
export async function createIpaAudioLookup(voice = 'en-us') {
  const instance = await getWorker();
  instance.set_voice(voice);
  return (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return '';
    return stripEspeakIpa(instance.synthesize_ipa(trimmed).ipa);
  };
}

async function synthesizeWithWorker(instance, text) {
  const chunks = [];
  let settled = false;

  await new Promise((resolve) => {
    instance.synthesize(text, (samples, events) => {
      if (samples?.length) {
        chunks.push(toInt16Array(samples));
      }
      if (events?.some((event) => event.type === 'end') && !settled) {
        settled = true;
        resolve();
      }
    });

    // Callbacks may run synchronously before synthesize() returns.
    queueMicrotask(() => {
      if (!settled && chunks.length) {
        settled = true;
        resolve();
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, 2000);
  });

  return chunks.length ? mergeInt16Chunks(chunks) : new Int16Array(0);
}

export async function synthesizeEspeakAudio(text, voice = 'en-us') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const instance = await getWorker();
  instance.set_voice(voice);
  return synthesizeWithWorker(instance, trimmed);
}

/** Synthesize compact IPA (Unicode) using eSpeak's underscore phoneme input format. */
export async function synthesizeEspeakIpa(ipa, voice = 'en-us') {
  const espeakInput = ipaToEspeakSynthesisInput(ipa);
  if (!espeakInput) return null;

  const instance = await getWorker();
  instance.set_voice(voice);
  return synthesizeWithWorker(instance, espeakInput);
}

export function cancelEspeakAudio() {
  stopCurrentPlayback();
}

export async function playEspeakSamples(samples, sampleRate = 22050) {
  if (!samples?.length) return;

  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('Web Audio API unavailable');
    audioContext = new Ctx();
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  stopCurrentPlayback();

  const float32 = int16ToFloat32(samples);
  const buffer = audioContext.createBuffer(1, float32.length, sampleRate);
  buffer.copyToChannel(float32, 0);

  await new Promise((resolve, reject) => {
    const source = audioContext.createBufferSource();
    currentSource = source;
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.onended = () => {
      if (currentSource === source) currentSource = null;
      resolve();
    };
    try {
      source.start(0);
    } catch (err) {
      currentSource = null;
      reject(err);
    }
  });
}

export async function speakEspeakText(text, voice = 'en-us') {
  const samples = await synthesizeEspeakAudio(text, voice);
  if (!samples?.length) return;
  await playEspeakSamples(samples);
}
