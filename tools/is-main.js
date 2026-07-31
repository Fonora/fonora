/**
 * Is this module the process entry point?
 *
 * The obvious form, comparing `import.meta.url` against `file://${process.argv[1]}`,
 * silently answers "no" whenever the checkout path contains a character that URL-encodes.
 * This repo lives under "Fonora Org", so the space becomes %20 on one side of the
 * comparison and never on the other: five CLIs and two test files ran to completion doing
 * nothing at all, including the compound audit, which is the tool for finding exactly the
 * kind of semantic drift that then accumulated unnoticed. `npm run` reported success every
 * time, because exiting without work is still exit 0.
 *
 * pathToFileURL applies the same encoding to both sides, so it holds for any path.
 */
import { pathToFileURL } from 'node:url';

/**
 * @param {string} importMetaUrl the calling module's `import.meta.url`
 * @returns {boolean}
 */
export function isMainModule(importMetaUrl) {
  const entry = process.argv[1];
  if (!entry) return false;
  return importMetaUrl === pathToFileURL(entry).href;
}
