import path from 'node:path';

import { BorshAccountsCoder, type IdlAccounts } from '@coral-xyz/anchor';

import { createProgramClient } from '../../../src';
import type { ExampleProgramClient } from '../../generated/example-idl-types';
import { loadIdl, SvmTestContext } from '../../test-utils';
import anchorIdl from '../target/idl/example.json';
import type { Example } from '../target/types/example';

// type ExampleProgramAccountName = Example['accounts'][number]['name'];
type ProgramAccounts = IdlAccounts<Example>;

type AccountExample = ProgramAccounts['accountExample'];

export const idl = loadIdl('example-idl.json');
export const programClient = createProgramClient<ExampleProgramClient>(idl);
export const programSoPath = path.resolve(__dirname, '..', 'target', 'deploy', 'example.so');

const anchorAccountCoder = new BorshAccountsCoder(anchorIdl as Example);

export function decodeDataAccountExample(data: Uint8Array): AccountExample {
    return anchorAccountCoder.decode<AccountExample>('AccountExample', Buffer.from(data));
}

export function createTestContext() {
    const ctx = new SvmTestContext({ defaultPrograms: true });
    ctx.loadProgram(programClient.programAddress, programSoPath);
    const payer = ctx.createFundedAccount();

    return { ctx, payer };
}

export function seedEnumToNumber(enumValue: string) {
    switch (enumValue.toLowerCase()) {
        case 'arm':
            return 0;
        case 'bar':
            return 1;
        case 'car':
            return 2;
        default:
            throw new Error(`Unknown enum value: ${enumValue}`);
    }
}

export function bytesToCodecFormat(bytes: Uint8Array) {
    return ['base16', Buffer.from(bytes).toString('hex')];
}
