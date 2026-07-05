/**
 * Vertical learning-path module viewer for the Progress page.
 */
import { getSkillLesson, getSkillProgress } from './learn-gamification.js';
import { countDomainMastered, loadDomainStats } from './fonoran-course-phrases.js';
import { getScriptSoundModuleStates } from './fonora-script-curriculum.js';
import {
  domainModuleDescription,
  LESSONS_PER_DOMAIN,
  SCRIPT_SOUND_MODULES,
} from './learn-module-catalog.js';
import { icon } from './learn-icons.js';
import { escapeHtml } from './utils.js';

const TRACK_STORAGE_KEY = 'fonora-learn-module-track-v1';

/** @typedef {'fonoran' | 'fonora'} ModuleTrack */

/** @typedef {'locked' | 'current' | 'complete'} ModuleNodeState */

/** @typedef {{ id: string, label: string, level: number, description: string, state: ModuleNodeState, mastered: number, total: number, unit: string, lessonsDone?: number, lessonsTotal?: number, skillId: string, section?: string, navigateTab?: string }} PathModule */

let activeTrack = loadModuleTrack();
/** @type {HTMLElement | null} */
let tooltipEl = null;
/** @type {HTMLElement | null} */
let pathEl = null;
let toggleWired = false;
/** @type {PathModule[]} */
let renderedModules = [];

/** @returns {ModuleTrack} */
function loadModuleTrack() {
  try {
    return localStorage.getItem(TRACK_STORAGE_KEY) === 'fonora' ? 'fonora' : 'fonoran';
  } catch {
    return 'fonoran';
  }
}

/** @param {ModuleTrack} track */
function saveModuleTrack(track) {
  try {
    localStorage.setItem(TRACK_STORAGE_KEY, track);
  } catch {
    /* ignore */
  }
}

/** Fix domain state so only one node is "current". */
function normalizeDomainStates(modules) {
  let foundCurrent = false;
  return modules.map((mod) => {
    if (mod.state !== 'current') return mod;
    if (foundCurrent) return { ...mod, state: /** @type {ModuleNodeState} */ ('locked') };
    foundCurrent = true;
    return mod;
  });
}

/**
 * @param {Awaited<ReturnType<typeof loadDomainStats>>} stats
 * @param {import('./learn-gamification.js').LearnSkillId} skillId
 * @param {'fonoran' | 'fonora'} track
 * @returns {PathModule[]}
 */
function buildDomainModulesFromStats(stats, skillId, track) {
  const lessonIndex = getSkillLesson(skillId);
  const totalLessons = stats.length * LESSONS_PER_DOMAIN;
  const mastery = getSkillProgress(skillId).mastery ?? {};
  const navigateTab = track === 'fonora' ? 'script-writing' : 'fonoran-reading';

  const modules = stats.map((domain, idx) => {
    const domainMastered = countDomainMastered(mastery, domain.phraseIds ?? []);
    const startLesson = idx * LESSONS_PER_DOMAIN;
    const lessonsDone = Math.min(
      LESSONS_PER_DOMAIN,
      Math.max(0, lessonIndex - startLesson),
    );
    /** @type {ModuleNodeState} */
    let state = 'locked';
    if (lessonIndex >= startLesson + LESSONS_PER_DOMAIN || lessonIndex >= totalLessons) {
      state = 'complete';
    } else if (lessonIndex >= startLesson) {
      state = 'current';
    } else if (idx === 0 && lessonIndex === 0) {
      state = 'current';
    }

    return {
      id: domain.id,
      label: domain.label,
      level: domain.level,
      description: domainModuleDescription(domain.id, track),
      state,
      mastered: domainMastered,
      total: domain.translated || domain.total,
      unit: 'phrases',
      lessonsDone: state === 'complete' ? LESSONS_PER_DOMAIN : lessonsDone,
      lessonsTotal: LESSONS_PER_DOMAIN,
      skillId,
      navigateTab,
    };
  });

  return normalizeDomainStates(modules);
}

/**
 * @param {object | null} rules
 * @returns {PathModule[]}
 */
function buildFonoraPathModules(rules) {
  /** @type {PathModule[]} */
  const modules = [];

  if (rules) {
    const soundStates = getScriptSoundModuleStates(rules);
    for (let i = 0; i < soundStates.length; i += 1) {
      const mod = soundStates[i];
      const meta = SCRIPT_SOUND_MODULES[i];
      modules.push({
        id: mod.id,
        label: mod.label,
        level: mod.level,
        description: meta?.description ?? '',
        state: /** @type {ModuleNodeState} */ (mod.state),
        mastered: mod.mastered,
        total: mod.total,
        unit: mod.unit,
        lessonsDone: mod.lessonsDone,
        lessonsTotal: mod.lessonsTotal,
        skillId: mod.skillId,
        section: i === 0 ? 'Symbol foundations' : undefined,
        navigateTab: 'script-sounds',
      });
    }
  } else {
    SCRIPT_SOUND_MODULES.forEach((meta, i) => {
      modules.push({
        id: meta.id,
        label: meta.label,
        level: i + 1,
        description: meta.description,
        state: i === 0 ? 'current' : 'locked',
        mastered: 0,
        total: 0,
        unit: 'sounds',
        lessonsDone: 0,
        lessonsTotal: 1,
        skillId: meta.skillId,
        section: i === 0 ? 'Symbol foundations' : undefined,
        navigateTab: 'script-sounds',
      });
    });
  }

  return modules;
}

/**
 * @param {PathModule} mod
 */
function nodeInnerHtml(mod) {
  if (mod.state === 'complete') return icon('check', 'learn-module-path__node-icon');
  if (mod.state === 'locked') return icon('lock', 'learn-module-path__node-icon');
  return `<span class="learn-module-path__node-num">${mod.level}</span>`;
}

/**
 * @param {PathModule} mod
 */
function progressLine(mod) {
  if (mod.unit === 'sounds') {
    return `${mod.mastered}/${mod.total} sounds mastered`;
  }
  const lessonPart =
    mod.lessonsTotal != null && mod.lessonsDone != null
      ? `Lesson ${Math.min(mod.lessonsDone + 1, mod.lessonsTotal)}/${mod.lessonsTotal} · `
      : '';
  return `${lessonPart}${mod.mastered}/${mod.total} phrases mastered`;
}

/**
 * @param {PathModule} mod
 */
function renderTooltipContent(mod) {
  return `
    <p class="learn-module-tooltip__eyebrow">Module ${mod.level}</p>
    <h3 class="learn-module-tooltip__title">${escapeHtml(mod.label)}</h3>
    <p class="learn-module-tooltip__desc">${escapeHtml(mod.description)}</p>
    <p class="learn-module-tooltip__meta">${escapeHtml(progressLine(mod))}</p>
  `;
}

/**
 * @param {PathModule} mod
 * @param {number} index
 * @param {PathModule | null} nextMod
 */
function renderStep(mod, index, nextMod) {
  const connectorComplete = mod.state === 'complete' && nextMod?.state !== 'locked';
  const sectionHtml = mod.section
    ? `<li class="learn-module-path__section" aria-hidden="true"><span>${escapeHtml(mod.section)}</span></li>`
    : '';

  return `${sectionHtml}
    <li class="learn-module-path__step learn-module-path__step--${mod.state}${index % 2 ? ' learn-module-path__step--alt' : ''}">
      <div class="learn-module-path__rail" aria-hidden="true">
        <span class="learn-module-path__connector${connectorComplete ? ' learn-module-path__connector--done' : ''}"></span>
      </div>
      <button
        type="button"
        class="learn-module-path__node"
        data-module-index="${index}"
        aria-label="${escapeHtml(mod.label)} — ${escapeHtml(progressLine(mod))}"
        ${mod.state === 'locked' ? 'disabled' : ''}
      >
        <span class="learn-module-path__node-ring">${nodeInnerHtml(mod)}</span>
      </button>
      <div class="learn-module-path__caption">
        <span class="learn-module-path__caption-label">${escapeHtml(mod.label)}</span>
        ${mod.state === 'current' ? '<span class="learn-module-path__caption-badge">Current</span>' : ''}
      </div>
    </li>`;
}

/**
 * @param {PathModule[]} modules
 * @param {ModuleTrack} track
 */
function renderPath(modules, track) {
  if (!pathEl) return;

  const completeCount = modules.filter((m) => m.state === 'complete').length;
  const summary =
    completeCount >= modules.length
      ? 'All modules complete — keep reviewing to stay sharp.'
      : `${completeCount} of ${modules.length} modules complete`;

  pathEl.dataset.track = track;
  pathEl.innerHTML = `
    <p class="learn-module-path__summary">${escapeHtml(summary)}</p>
    <ol class="learn-module-path__track">
      ${modules.map((mod, i) => renderStep(mod, i, modules[i + 1] ?? null)).join('')}
    </ol>
  `;

  pathEl.querySelectorAll('.learn-module-path__node:not([disabled])').forEach((btn) => {
    btn.addEventListener('mouseenter', onNodeEnter);
    btn.addEventListener('mouseleave', onNodeLeave);
    btn.addEventListener('focus', onNodeEnter);
    btn.addEventListener('blur', onNodeLeave);
    btn.addEventListener('click', onNodeClick);
  });
}

/** @param {Event} event */
function onNodeEnter(event) {
  const btn = event.currentTarget;
  if (!(btn instanceof HTMLElement)) return;
  const index = Number(btn.dataset.moduleIndex);
  if (!Number.isFinite(index) || !tooltipEl) return;

  const mod = renderedModules[index];
  if (!mod) return;

  tooltipEl.innerHTML = renderTooltipContent(mod);
  tooltipEl.dataset.track = activeTrack;
  tooltipEl.hidden = false;
  positionTooltip(btn);
}

/** @param {Event} event */
function onNodeClick(event) {
  const btn = event.currentTarget;
  if (!(btn instanceof HTMLElement)) return;
  const index = Number(btn.dataset.moduleIndex);
  const mod = renderedModules[index];
  if (!mod?.navigateTab || mod.state === 'locked') return;

  if (typeof window.showTab === 'function') {
    window.showTab(mod.navigateTab);
  }
}

function onNodeLeave() {
  if (tooltipEl) tooltipEl.hidden = true;
}

/** @param {HTMLElement} anchor */
function positionTooltip(anchor) {
  if (!tooltipEl) return;
  const rect = anchor.getBoundingClientRect();
  tooltipEl.hidden = false;
  const tipRect = tooltipEl.getBoundingClientRect();
  const margin = 12;
  let left = rect.right + margin;
  let top = rect.top + rect.height / 2 - tipRect.height / 2;

  if (left + tipRect.width > window.innerWidth - margin) {
    left = rect.left - tipRect.width - margin;
  }
  if (top < margin) top = margin;
  if (top + tipRect.height > window.innerHeight - margin) {
    top = window.innerHeight - tipRect.height - margin;
  }

  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function wireTrackToggle(onChange) {
  const container = document.getElementById('learn-module-track-toggle');
  if (!container || toggleWired) return;
  toggleWired = true;

  container.querySelectorAll('input[name="learn-module-track"]').forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    input.checked = input.value === activeTrack;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      activeTrack = input.value === 'fonora' ? 'fonora' : 'fonoran';
      saveModuleTrack(activeTrack);
      onChange();
    });
  });
}

/**
 * @param {object | null} [rules]
 */
export async function renderModulePath(rules = null) {
  pathEl = document.getElementById('learn-module-path');
  tooltipEl = document.getElementById('learn-module-tooltip');
  if (!pathEl) return;

  wireTrackToggle(() => {
    void renderModulePath(rules);
  });

  document.querySelectorAll('#learn-module-track-toggle input[name="learn-module-track"]').forEach((input) => {
    if (input instanceof HTMLInputElement) input.checked = input.value === activeTrack;
  });

  /** @type {PathModule[]} */
  let modules = [];
  if (activeTrack === 'fonora') {
    modules = buildFonoraPathModules(rules);
    const stats = await loadDomainStats();
    if (stats.length) {
      const literacy = buildDomainModulesFromStats(stats, 'script-writing', 'fonora').map((mod, i) => ({
        ...mod,
        section: i === 0 ? 'Script literacy' : undefined,
      }));
      modules = [...modules, ...literacy];
    }
  } else {
    const stats = await loadDomainStats();
    modules = stats.length ? buildDomainModulesFromStats(stats, 'fonoran-reading', 'fonoran') : [];
  }

  renderedModules = normalizeDomainStates(modules);
  renderPath(renderedModules, activeTrack);
}

export function getActiveModuleTrack() {
  return activeTrack;
}
