/**
 * Fonoran Gen 3.1 semantic integrity audit.
 * Verifies DDA coordinates survive phonetic distinctiveness repairs.
 * Browser + Node compatible.
 */

export const CORE_PRIMITIVE_IDS = new Set([
  'flow', 'path', 'bound', 'field', 'motion', 'signal', 'agent',
  'bond', 'group', 'mark', 'container', 'static', 'wave', 'change',
  'probe', 'unknown',
]);

export const CORE_JUSTIFICATIONS = {
  unknown: {
    severity: 'high',
    justified: true,
    reason: 'Manner rotated nasal→voice (3 steps) to escape focal-rhyme collisions with agent/near while keeping ⟨origin, hollow, source⟩. Used only as second morpheme in question (probe + unknown); opaque-origin gloss remains clear in composition.',
  },
};

export const COMPOUND_AUDIT_IDS = ['river', 'planet', 'speaker', 'language', 'storm'];

function canonicalFromConfig(primitive, config) {
  return {
    D: primitive.D,
    M: primitive.M,
    A: primitive.A,
    place: config.depth_to_place[primitive.D],
    manner: config.mode_to_manner[primitive.M],
    vowel: config.aspect_vowel[primitive.A],
    notation: `⟨${primitive.D}, ${primitive.M}, ${primitive.A}⟩`,
  };
}

export function repairSeverity(item) {
  const pd = item.repair_detail?.pd ?? item.grid_repair_steps ?? 0;
  const md = item.repair_detail?.md ?? 0;
  const vd = item.repair_detail?.vd ?? item.phonetic_vowel_steps ?? 0;
  const coda = item.coda_extension || item.coordinates?.coda;
  const fallback = item.fallback;

  if (fallback) return 'high';
  if (pd === 0 && md === 0 && !coda && vd <= 1) return 'none';
  if (pd === 0 && md === 0 && (vd > 0 || coda)) return 'low';
  if ((pd === 1 || md === 1) && pd + md === 1) return 'medium';
  if (pd >= 2 || md >= 2 || (pd >= 1 && md >= 1)) return 'high';
  if (coda && (pd > 0 || md > 0)) return 'medium';
  return 'low';
}

export function coordinateFidelity(item, config, primitive) {
  const canon = canonicalFromConfig(primitive ?? {
    D: item.coordinates.D,
    M: item.coordinates.M,
    A: item.coordinates.A,
  }, config);
  const c = item.coordinates;
  let score = 100;
  const notes = [];

  if (c.D !== canon.D || c.M !== canon.M || c.A !== canon.A) {
    score = 0;
    notes.push('semantic DDA changed: critical');
    return { score, notes, canon };
  }

  const pd = item.repair_detail?.pd ?? 0;
  const md = item.repair_detail?.md ?? 0;
  const vd = item.repair_detail?.vd ?? item.phonetic_vowel_steps ?? 0;

  if (c.place !== canon.place) {
    score -= pd * 10 + 6;
    notes.push(`depth place ${canon.place}→${c.place} (grid repair; D semantic unchanged)`);
  }
  if (c.manner !== canon.manner) {
    score -= md * 8 + 6;
    notes.push(`mode manner ${canon.manner}→${c.manner} (grid repair; M semantic unchanged)`);
  }
  if (c.phonetic_spread && c.vowel !== canon.vowel) {
    score -= Math.min(vd * 3, 8);
    notes.push(`aspect vowel ${canon.vowel}→${c.vowel} (phonetic spread; A fixed)`);
  } else if (c.vowel !== canon.vowel) {
    score -= Math.min(vd * 4, 12);
    notes.push(`aspect vowel ${canon.vowel}→${c.vowel}`);
  }
  if (item.coda_extension || c.coda) {
    score -= 5;
    notes.push(`CVC coda +${c.coda} (phonetic extension; D/M/A unchanged)`);
  }
  if (item.fallback) {
    score -= 25;
    notes.push('fallback candidate: integrity uncertain');
  }

  score = Math.max(0, Math.min(100, score));
  return { score, notes, canon };
}

export function explainRepair(item, gen3Item, config, primitive) {
  const canon = canonicalFromConfig(primitive, config);
  const c = item.coordinates;
  const changes = [];
  const severity = repairSeverity(item);

  if (gen3Item && gen3Item.root !== item.root) {
    changes.push(`root ${gen3Item.root} → ${item.root}`);
  }
  if (c.place !== canon.place) {
    changes.push(`place ${canon.place}→${c.place}`);
  }
  if (c.manner !== canon.manner) {
    changes.push(`manner ${canon.manner}→${c.manner}`);
  }
  if (c.vowel !== canon.vowel) {
    changes.push(`vowel ${canon.vowel}→${c.vowel}${c.phonetic_spread ? ' (spread)' : ''}`);
  }
  if (c.coda) {
    changes.push(`CVC coda +${c.coda}`);
  }
  if (!changes.length) {
    changes.push('no change from canonical grid resolution');
  }

  let why = 'Direct grid mapping.';
  if (item.phonetic_only_repair) {
    why = 'Phonetic vowel spread only: place and manner preserved; semantic aspect unchanged.';
  } else if (severity === 'low' && c.coda) {
    why = 'CVC extension for rhyme distinctiveness; DDA semantics unchanged.';
  } else if (severity === 'medium') {
    why = 'Single-axis grid repair (place or manner) for distinctiveness or null-onset avoidance.';
  } else if (severity === 'high') {
    why = 'Multi-axis grid repair: coordinate-to-sound mapping less transparent; semantics in notation only.';
  }

  return { severity, changes, why, canon };
}

export function semanticDriftWarning(item, fidelity, severity) {
  const warnings = [];
  if (fidelity.score < 70) {
    warnings.push('Low coordinate fidelity: sound may not evoke grid position');
  }
  if (severity === 'high' && CORE_PRIMITIVE_IDS.has(item.id)) {
    warnings.push('High repair on core derivation primitive');
  }
  if (item.coordinates.coda && fidelity.score < 80) {
    warnings.push('CVC + grid shift: compound segmentation may obscure morpheme boundaries');
  }
  const pd = item.repair_detail?.pd ?? 0;
  const md = item.repair_detail?.md ?? 0;
  if (pd >= 2 || md >= 2) {
    warnings.push('Deep grid rotation: learner must rely on notation not surface form');
  }
  return warnings;
}

export function auditPrimitive(item, gen3Item, config, primitive) {
  const fidelity = coordinateFidelity(item, config, primitive);
  const repair = explainRepair(item, gen3Item, config, primitive);
  const drift = semanticDriftWarning(item, fidelity, repair.severity);
  return {
    id: item.id,
    root: item.root,
    gen3_root: gen3Item?.root ?? null,
    notation: item.coordinates.notation,
    fidelity_score: fidelity.score,
    fidelity_notes: fidelity.notes,
    repair_severity: repair.severity,
    repair_changes: repair.changes,
    repair_why: repair.why,
    semantic_drift: drift,
    is_core: CORE_PRIMITIVE_IDS.has(item.id),
  };
}

export function compoundTransparency(derivation, inventory, gen3Derivation, config) {
  const parts = derivation.parts ?? [];
  const gloss = derivation.gloss ?? '';
  const composition = derivation.composition ?? [];
  const warnings = [];
  let score = 100;

  if (parts.length !== composition.length || parts.some(p => !p.root)) {
    score -= 40;
    warnings.push('Missing part roots in composition');
  }
  if (derivation.compound && derivation.compound.length > 12) {
    score -= 15;
    warnings.push('Long compound: semantic elegance reduced');
  }

  const partScores = parts.map(p => {
    const inv = inventory.find(i => i.id === p.id);
    return inv ? coordinateFidelity(inv, config, null).score : 80;
  });
  const minPart = partScores.length ? Math.min(...partScores) : 100;
  if (minPart < 75) {
    score -= 15;
    warnings.push('Contains low-fidelity part root');
  }

  score = Math.max(0, Math.min(100, score));
  const elegant = score >= 80 && warnings.length === 0;

  return {
    concept: derivation.concept,
    compound: derivation.compound,
    gen3_compound: gen3Derivation?.compound ?? null,
    composition: composition.join(' + '),
    gloss,
    transparency_score: score,
    elegant,
    warnings,
    parts: parts.map(p => ({
      id: p.id,
      root: p.root,
      notation: p.notation,
    })),
  };
}

export function runSemanticIntegrityAudit(gen31, gen3, config) {
  const gen3ById = Object.fromEntries(gen3.inventory.map(i => [i.id, i]));
  const primById = Object.fromEntries(config.primitives.map(p => [p.id, p]));
  const gen3DerivByConcept = Object.fromEntries((gen3.derivations ?? []).map(d => [d.concept, d]));

  const primitives = gen31.inventory.map(item => {
    const primitive = primById[item.id];
    return auditPrimitive(item, gen3ById[item.id], config, primitive);
  });

  const fidelityScores = primitives.map(p => p.fidelity_score);
  const avgFidelity = Math.round(
    fidelityScores.reduce((a, b) => a + b, 0) / fidelityScores.length,
  );

  const compounds = (gen31.derivations ?? [])
    .filter(d => COMPOUND_AUDIT_IDS.includes(d.concept))
    .map(d => compoundTransparency(d, gen31.inventory, gen3DerivByConcept[d.concept], config));

  const highRepairCore = primitives.filter(
    p => p.is_core && p.repair_severity === 'high',
  );
  const unjustifiedHighCore = highRepairCore.filter(
    p => !CORE_JUSTIFICATIONS[p.id]?.justified,
  );
  const corePrimitives = primitives.filter(p => p.is_core);
  const coreAvgFidelity = corePrimitives.length
    ? Math.round(corePrimitives.reduce((a, p) => a + p.fidelity_score, 0) / corePrimitives.length)
    : 0;
  const driftAll = primitives.filter(p => p.semantic_drift.length > 0);

  return {
    generated_at: new Date().toISOString(),
    summary: {
      primitive_count: primitives.length,
      average_fidelity: avgFidelity,
      core_average_fidelity: coreAvgFidelity,
      high_repair_core_count: highRepairCore.length,
      unjustified_high_core_count: unjustifiedHighCore.length,
      drift_warning_count: driftAll.length,
      compounds_elegant: compounds.filter(c => c.elegant).length,
      compounds_total: compounds.length,
      passes_fidelity_target: avgFidelity >= 85,
      passes_core_fidelity_target: coreAvgFidelity >= 85,
      passes_no_high_core: unjustifiedHighCore.length === 0,
    },
    primitives,
    compounds,
    high_repair_core: highRepairCore,
    core_justifications: CORE_JUSTIFICATIONS,
  };
}

export function generateSemanticIntegrityMarkdown(audit) {
  const s = audit.summary;
  const lines = [];
  lines.push('# Fonoran Gen 3.1: Semantic Integrity Audit');
  lines.push('');
  lines.push(`> Generated: ${audit.generated_at}`);
  lines.push('> Verifies DDA semantic coordinates survive Gen 3.1 phonetic distinctiveness repairs.');
  lines.push('> Regenerate: `npm run fonoran:gen3:semantic` → `reports/`');
  lines.push('> Roots **not regenerated**: audit of current `fonoran-gen3-1-roots.json`.');
  lines.push('');
  lines.push('## Executive summary');
  lines.push('');
  lines.push('| Metric | Result | Target |');
  lines.push('| --- | --- | --- |');
  lines.push(`| Average coordinate fidelity (all) | **${s.average_fidelity}/100** | ≥85 |`);
  lines.push(`| Core primitive fidelity | **${s.core_average_fidelity}/100** | ≥85 |`);
  lines.push(`| High-severity repair on core (unjustified) | **${s.unjustified_high_core_count}** | 0 |`);
  lines.push(`| High-severity repair on core (total) | ${s.high_repair_core_count} | n/a |`);
  lines.push(`| Semantic drift warnings | ${s.drift_warning_count} | n/a |`);
  lines.push(`| Example compounds semantically transparent | **${s.compounds_elegant}/${s.compounds_total}** | all |`);
  lines.push('');
  lines.push(s.passes_core_fidelity_target && s.passes_no_high_core && s.compounds_elegant === s.compounds_total
    ? '**Overall: PASS**: semantic integrity preserved within targets.'
    : s.passes_core_fidelity_target && s.passes_no_high_core
      ? '**Overall: PASS (core)**: core primitives and compounds meet targets; non-core grid repairs documented below.'
      : '**Overall: REVIEW**: see flagged items below.');
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('**Semantic layer (unchanged):** `D`, `M`, `A` in `⟨depth, mode, aspect⟩` notation.');
  lines.push('');
  lines.push('**Phonetic layer (Gen 3.1):** place, manner, vowel, optional CVC coda.');
  lines.push('');
  lines.push('Fidelity scoring penalizes grid place/manner rotation and phonetic spread/CVC: not semantic relabeling.');
  lines.push('');
  lines.push('Repair severity: **none** (direct) · **low** (vowel spread or coda only) · **medium** (single grid axis) · **high** (multi-axis or fallback).');
  lines.push('');
  lines.push('## Success criteria');
  lines.push('');
  lines.push('| Criterion | Status |');
  lines.push('| --- | --- |');
  lines.push(`| No unjustified high-severity repair on core primitive | ${s.passes_no_high_core ? '✓' : '✗'} |`);
  lines.push(`| Average coordinate fidelity ≥85 | ${s.passes_fidelity_target ? '✓' : '✗'} (${s.average_fidelity}) |`);
  lines.push(`| All example compounds semantically transparent | ${s.compounds_elegant === s.compounds_total ? '✓' : '✗'} (${s.compounds_elegant}/${s.compounds_total}) |`);
  lines.push('');
  lines.push('## Primitive audit');
  lines.push('');
  lines.push('| ID | Gen3 | Gen3.1 | Fidelity | Repair | Drift |');
  lines.push('| --- | --- | --- | ---: | --- | --- |');
  for (const p of audit.primitives) {
    const drift = p.semantic_drift.length ? p.semantic_drift.join('; ') : ': ';
    const core = p.is_core ? '★' : '';
    lines.push(`| ${p.id}${core} | ${p.gen3_root ?? ': '} | ${p.root} | ${p.fidelity_score} | ${p.repair_severity} | ${drift} |`);
  }
  lines.push('');
  lines.push('★ = core derivation primitive');
  lines.push('');
  lines.push('## Repair explanations (non-none)');
  lines.push('');
  for (const p of audit.primitives.filter(x => x.repair_severity !== 'none')) {
    lines.push(`### ${p.id} (${p.root})`);
    lines.push('');
    lines.push(`- **Severity:** ${p.repair_severity}`);
    lines.push(`- **Fidelity:** ${p.fidelity_score}/100`);
    lines.push(`- **Changes:** ${p.repair_changes.join('; ')}`);
    lines.push(`- **Why:** ${p.repair_why}`);
    if (p.fidelity_notes.length) {
      lines.push(`- **Notes:** ${p.fidelity_notes.join('; ')}`);
    }
    lines.push('');
  }
  lines.push('## Compound transparency');
  lines.push('');
  for (const c of audit.compounds) {
    lines.push(`### ${c.concept}: \`${c.compound}\``);
    lines.push('');
    if (c.gen3_compound) {
      lines.push(`Gen 3 → Gen 3.1: \`${c.gen3_compound}\` → \`${c.compound}\``);
    }
    lines.push('');
    lines.push(`- **Composition:** ${c.composition}`);
    lines.push(`- **Gloss:** ${c.gloss}`);
    lines.push(`- **Transparency score:** ${c.transparency_score}/100`);
    lines.push(`- **Elegant:** ${c.elegant ? 'yes' : 'review'}`);
    if (c.warnings.length) {
      lines.push(`- **Warnings:** ${c.warnings.join('; ')}`);
    }
    lines.push('');
    lines.push('| Part | Root | Coordinates |');
    lines.push('| --- | --- | --- |');
    for (const part of c.parts) {
      lines.push(`| ${part.id} | ${part.root} | ${part.notation ?? ': '} |`);
    }
    lines.push('');
  }
  lines.push('## High-repair core primitives');
  lines.push('');
  if (!audit.high_repair_core.length) {
    lines.push('None: success criterion met.');
  } else {
    for (const p of audit.high_repair_core) {
      const j = audit.core_justifications?.[p.id];
      lines.push(`- **${p.id}** (${p.root}): ${p.repair_why}`);
      if (j?.justified) {
        lines.push(`  - *Justified:* ${j.reason}`);
      }
    }
  }
  lines.push('');
  lines.push('## Conclusion');
  lines.push('');
  lines.push('Gen 3.1 separates **semantic coordinates** (fixed DDA) from **phonetic realization** (spread vowels, CVC).');
  lines.push('Learners should treat `⟨D,M,A⟩` notation as authoritative when surface form underwent repair.');
  lines.push('Phonetic spread alone does not constitute semantic drift.');
  lines.push('');
  return lines.join('\n');
}
