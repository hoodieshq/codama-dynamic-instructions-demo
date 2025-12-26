import { createFromRoot } from 'codama';
import { rootNodeFromAnchor } from '@codama/nodes-from-anchor';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from '@codama/renderers-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Anchor outputs the IDL under `target/idl/<program>.json`.
const idlPath = path.join(__dirname, '..', 'target', 'idl', 'example.json');
console.log(`Start generation from IDL: ${idlPath}`);
const idl = JSON.parse(readFileSync(idlPath, 'utf-8'));

console.log('Creating codama client..');
const codama = createFromRoot(rootNodeFromAnchor(idl));

const pathToIdl = path.join(__dirname, '..', 'prebuilt-idls', 'example-idl.json');
console.log(`Writing Codama IDL to: ${pathToIdl}`);

const codamaJson = JSON.parse(codama.getJson());
const json = JSON.stringify(codamaJson, null, 2);

await Promise.resolve(writeFile(pathToIdl, json));
console.log('Done');
