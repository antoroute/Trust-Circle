import { readFileSync } from 'node:fs';
const data = JSON.parse(readFileSync(0, 'utf8'));
const packages = new Map(data.packages.map(p => [p.id, p.name]));
const nodes = data.resolve?.nodes ?? [];
if (!nodes.some(n => packages.get(n.id) === 'openmls')) throw Error('OpenMLS missing from graph');
for (const node of nodes) {
  if (!packages.get(node.id)?.startsWith('openmls')) continue;
  for (const feature of node.features) {
    if (/debug|draft|test-utils|unchecked|fork-resolution/.test(feature)) {
      throw Error(`Forbidden feature: ${packages.get(node.id)}/${feature}`);
    }
  }
}
console.log('OpenMLS feature policy passed: no debug, draft or unchecked-validation features');
