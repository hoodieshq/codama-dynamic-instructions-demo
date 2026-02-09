import { readFileSync } from 'node:fs';
import path from 'node:path';

import { createProgramClient } from '../src';
import type { IdlInput, ProgramClient } from '../src';

export function loadIdl(idlFileName: string, baseDir?: string): IdlInput {
    const basePath = baseDir ?? path.resolve(__dirname, 'idls');
    const idlPath = path.resolve(basePath, idlFileName);
    const idlJson: unknown = JSON.parse(readFileSync(idlPath, 'utf8'));
    if (typeof idlJson !== 'object' || idlJson === null) {
        throw new Error(`Invalid IDL json: ${idlFileName}`);
    }
    return idlJson as IdlInput;
}

export function createTestProgramClient(idlFileName: string): ProgramClient {
    const idl = loadIdl(idlFileName);
    return createProgramClient(idl);
}

export { SvmTestContext, type EncodedAccount } from './svm-test-context';
