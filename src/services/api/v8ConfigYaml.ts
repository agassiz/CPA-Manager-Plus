/**
 * Converts whole configuration YAML documents between the v8 layout served by
 * `/v8/management/config.yaml` and the legacy flat layout that the visual editor
 * parses. Node moves keep the comments attached to each moved key.
 */

import { Document, YAMLMap, isMap, isScalar, parseDocument } from 'yaml';
import type { Pair } from 'yaml';
import { V8_KEY_FAMILIES, V8_PATH_RULES, expandProviderGroups, groupProviderEntries } from './v8Config';

const keyName = (pair: Pair): unknown => (isScalar(pair.key) ? pair.key.value : pair.key);

const findPairIndex = (map: YAMLMap, key: string): number =>
  map.items.findIndex((pair) => keyName(pair) === key);

const getMapAt = (doc: Document, path: string[]): YAMLMap | null => {
  if (path.length === 0) return isMap(doc.contents) ? doc.contents : null;
  const node = doc.getIn(path, true);
  return isMap(node) ? node : null;
};

/** Detaches the pair at `path`, pruning ancestors that became empty. */
const takePair = (doc: Document, path: string[]): Pair | null => {
  const parent = getMapAt(doc, path.slice(0, -1));
  if (!parent) return null;
  const index = findPairIndex(parent, path[path.length - 1]);
  if (index < 0) return null;
  const [pair] = parent.items.splice(index, 1);
  for (let length = path.length - 1; length > 0; length -= 1) {
    const ancestor = getMapAt(doc, path.slice(0, length));
    if (!ancestor || ancestor.items.length > 0) break;
    const grand = getMapAt(doc, path.slice(0, length - 1));
    if (!grand) break;
    const at = findPairIndex(grand, path[length - 1]);
    if (at >= 0) grand.items.splice(at, 1);
  }
  return pair;
};

const putPair = (doc: Document, path: string[], pair: Pair): void => {
  if (!isMap(doc.contents)) doc.contents = new YAMLMap();
  let target = doc.contents as YAMLMap;
  for (const segment of path.slice(0, -1)) {
    const existing = target.get(segment, true);
    if (isMap(existing)) {
      target = existing;
    } else {
      const created = new YAMLMap();
      target.set(segment, created);
      target = created;
    }
  }
  const leaf = path[path.length - 1];
  const index = findPairIndex(target, leaf);
  if (index >= 0) target.items.splice(index, 1);
  if (isScalar(pair.key)) pair.key.value = leaf;
  else pair.key = doc.createNode(leaf);
  target.items.push(pair);
};

const movePath = (doc: Document, from: string, to: string): void => {
  const pair = takePair(doc, from.split('.'));
  if (pair) putPair(doc, to.split('.'), pair);
};

const depth = (path: string): number => path.split('.').length;

const parse = (source: string): Document => {
  const doc = parseDocument(source);
  if (doc.errors.length) throw new Error(`Invalid configuration YAML: ${doc.errors[0].message}`);
  return doc;
};

/** v8 YAML -> legacy flat YAML. */
export function v8YamlToLegacy(source: string): string {
  const doc = parse(source);
  if (!isMap(doc.contents)) return source;

  doc.delete('config-version');

  const families: Array<[string, unknown[]]> = [];
  const groups = doc.get('api-keys', true);
  if (isMap(groups)) {
    for (const [legacy, current] of V8_KEY_FAMILIES) {
      if (groups.has(current)) {
        const raw = (doc.toJS()['api-keys'] as Record<string, unknown>)[current];
        families.push([legacy, expandProviderGroups(raw, current)]);
      }
    }
    doc.delete('api-keys');
  }

  const rules = [...V8_PATH_RULES].sort((a, b) => depth(b[1]) - depth(a[1]));
  for (const [legacy, current] of rules) movePath(doc, current, legacy);
  for (const [legacy, entries] of families) doc.set(legacy, doc.createNode(entries));
  return doc.toString();
}

/** Legacy flat YAML -> v8 YAML. */
export function legacyYamlToV8(source: string): string {
  const doc = parse(source);
  if (!isMap(doc.contents)) return source;

  // Client keys move first: the v8 `api-keys` key is the provider-group map.
  const rules = [...V8_PATH_RULES].sort((a, b) => depth(a[1]) - depth(b[1]));
  for (const [legacy, current] of rules) movePath(doc, legacy, current);

  for (const [legacy, current] of V8_KEY_FAMILIES) {
    const node = doc.get(legacy, true);
    if (node === undefined) continue;
    const entries = doc.toJS()[legacy] as unknown;
    doc.delete(legacy);
    doc.setIn(['api-keys', current], doc.createNode(groupProviderEntries(entries, current)));
  }
  if (!doc.has('config-version')) doc.set('config-version', 8);
  return doc.toString();
}
