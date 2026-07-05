/**
 * Mermaid derivation graphs for Language Explorer.
 */

import { buildDerivationTree, partsToComponents } from './fonoran-derivation.js';

function escLabel(text) {
  return String(text ?? '')
    .replace(/"/g, '#quot;')
    .replace(/[<>&]/g, '');
}

export function nodeId(kind, ref) {
  const base = String(ref).replace(/[^a-zA-Z0-9_]/g, '_');
  return `${kind}_${base}`;
}

function nodeLabel(spelling, meaning, kind) {
  const badge = kind === 'root' ? 'ROOT' : 'WORD';
  const m = meaning?.trim() || '?';
  return `${escLabel(spelling)}<br/>${escLabel(m)}<br/>${badge}`;
}

function addNode(nodes, type, ref, spelling, meaning, { preview = false } = {}) {
  const id = nodeId(type, ref);
  if (!nodes.has(id)) {
    nodes.set(id, { id, kind: type, ref, spelling, preview, label: nodeLabel(spelling, meaning, type) });
  }
  return id;
}

function edgeKey(from, to, style = '') {
  return `${from}->${to}:${style}`;
}

function addEdge(edges, seen, from, to, style = '') {
  const key = edgeKey(from, to, style);
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({ from, to, style });
}

/** Walk a derivation subtree; link each component node to its parent word. */
function wireComponentNode(node, parentId, nodes, edges, seen) {
  const compId = addNode(nodes, node.type, node.ref, node.spelling, node.meaning);
  addEdge(edges, seen, compId, parentId);
  for (const child of node.children ?? []) {
    wireComponentNode(child, compId, nodes, edges, seen);
  }
}

function wireWordFocus(word, bucket, nodes, edges, seen, { preview = false } = {}) {
  const focusId = addNode(nodes, 'word', word.id, word.spelling, word.meaning, { preview });
  const derivation = word.derivation ?? buildDerivationTree(
    word.components ?? partsToComponents(word.parts),
    bucket,
  );
  for (const comp of derivation.direct ?? []) {
    wireComponentNode(comp, focusId, nodes, edges, seen);
  }
  return focusId;
}

/**
 * Build mermaid graph + clickable node metadata.
 * @returns {{ source: string, nodes: Array<{id, kind, ref, spelling, preview}> }}
 */
export function buildMermaidGraph(bucket, { kind, ref, usedIn = [], related = [], previewWord = null } = {}) {
  const nodes = new Map();
  const edges = [];
  const seen = new Set();
  let focusId = null;

  if (previewWord) {
    focusId = wireWordFocus(previewWord, bucket, nodes, edges, seen, { preview: true });
  } else if (kind === 'root') {
    const root = bucket.sounds?.find(s => s.spelling === ref);
    if (!root) {
      return { source: 'graph TD\n  empty["No data"]', nodes: [] };
    }
    focusId = addNode(nodes, 'root', root.spelling, root.spelling, root.meaning);
    for (const u of usedIn ?? []) {
      const uid = addNode(nodes, 'word', u.id, u.spelling, u.meaning);
      addEdge(edges, seen, focusId, uid);
    }
  } else {
    const word = bucket.compounds?.find(c => c.id === ref || c.spelling === ref);
    if (!word) {
      return { source: 'graph TD\n  empty["No data"]', nodes: [] };
    }
    focusId = wireWordFocus(word, bucket, nodes, edges, seen);
    for (const u of usedIn ?? []) {
      if (u.id === word.id) continue;
      const uid = addNode(nodes, 'word', u.id, u.spelling, u.meaning);
      addEdge(edges, seen, focusId, uid);
    }
  }

  for (const r of related ?? []) {
    if (r.id && nodes.has(nodeId('word', r.id))) continue;
    const rid = addNode(nodes, 'word', r.id, r.spelling, r.meaning);
    if (focusId && rid !== focusId) {
      addEdge(edges, seen, focusId, rid, 'dotted');
    }
  }

  const lines = ['graph TD'];
  for (const { id, label, kind: nodeKind } of nodes.values()) {
    const cls = id === focusId ? 'focusNode' : (nodeKind === 'root' ? 'rootNode' : 'wordNode');
    lines.push(`  ${id}["${label}"]:::${cls}`);
  }
  for (const e of edges) {
    if (e.style === 'dotted') {
      lines.push(`  ${e.from} -.-> ${e.to}`);
    } else {
      lines.push(`  ${e.from} --> ${e.to}`);
    }
  }
  if (lines.length === 1) lines.push('  empty["No derivation yet"]');
  lines.push(
    '  classDef rootNode fill:#f5edd9,stroke:#9a7544,color:#9a7544,stroke-width:1.5px,rx:10,ry:10',
    '  classDef wordNode fill:#eaf6ef,stroke:#2d6a4f,color:#1b4332,stroke-width:1.5px,rx:10,ry:10',
    '  classDef focusNode fill:#d8f3dc,stroke:#2d6a4f,color:#1b4332,stroke-width:2px,rx:10,ry:10',
  );

  return {
    source: lines.join('\n'),
    nodes: [...nodes.values()],
  };
}

/** Build mermaid graph TD source for focus item and its neighborhood. */
export function buildMermaidDerivation(bucket, kind, ref, { usedIn = [], related = [] } = {}) {
  return buildMermaidGraph(bucket, { kind, ref, usedIn, related }).source;
}

/** Preview graph for unsaved composer stack. */
export function buildPreviewMermaidGraph(bucket, { spelling, meaning, components }) {
  const comps = (components ?? []).map(c => ({
    type: c.type === 'word' ? 'word' : 'root',
    ref: c.ref,
  }));
  return buildMermaidGraph(bucket, {
    previewWord: {
      id: `preview-${spelling}`,
      spelling,
      meaning: meaning ?? null,
      components: comps,
    },
  });
}

/** Render derivation tree as indented plain text. */
export function formatDerivationTree(derivation, indent = 0) {
  const pad = '  '.repeat(indent);
  const lines = [];
  for (const node of derivation?.direct ?? []) {
    const badge = node.type === 'root' ? 'ROOT' : 'WORD';
    const m = node.meaning?.trim() || '?';
    lines.push(`${pad}${node.spelling} = ${m} (${badge})`);
    if (node.children?.length) {
      lines.push(`${pad}├─ built from:`);
      lines.push(formatDerivationTree({ direct: node.children }, indent + 1));
    }
  }
  return lines.filter(Boolean).join('\n');
}
