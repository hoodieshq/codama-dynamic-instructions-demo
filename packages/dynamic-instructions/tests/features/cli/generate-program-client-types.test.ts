import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, test } from 'vitest';

import type { IdlRoot } from '../../../src/features/cli/commands/generate-program-client-types';
import { generateProgramClientType } from '../../../src/features/cli/commands/generate-program-client-types';

const CLI_PATH = path.resolve('bin/cli.cjs');

function execCli(args: string[]) {
    try {
        const stdout = execFileSync('node', [CLI_PATH, ...args], {
            cwd: path.resolve('.'),
            encoding: 'utf-8',
        });
        return { exitCode: 0, stderr: '', stdout };
    } catch (error: unknown) {
        const e = error as { status: number; stderr: string; stdout: string };
        return { exitCode: e.status ?? 1, stderr: e.stderr ?? '', stdout: e.stdout ?? '' };
    }
}

describe('generateProgramClientType', () => {
    test('should generate types matching the known-good snapshot for circular-account-refs IDL', () => {
        const idl = JSON.parse(readFileSync('tests/idls/circular-account-refs-idl.json', 'utf-8')) as IdlRoot;
        const result = generateProgramClientType(idl);
        const expected = readFileSync('tests/generated/circular-account-refs-idl-types.ts', 'utf-8');
        expect(result).toBe(expected);
    });
});

describe('CLI', () => {
    const tmpDirs: string[] = [];

    afterAll(() => {
        for (const dir of tmpDirs) {
            rmSync(dir, { force: true, recursive: true });
        }
    });

    test('should print help when no arguments are provided', () => {
        const { stdout, exitCode } = execCli([]);
        expect(stdout).toContain('Usage:');
        expect(exitCode).toBe(0);
    });

    test('should print help when --help flag is provided', () => {
        const { stdout, exitCode } = execCli(['--help']);
        expect(stdout).toContain('Usage:');
        expect(exitCode).toBe(0);
    });

    test('should exit with code 1 for unknown commands', () => {
        const { stderr, exitCode } = execCli(['unknown-cmd']);
        expect(stderr).toContain('Unknown command');
        expect(exitCode).toBe(1);
    });

    test('should print subcommand help for generate-program-client-types --help', () => {
        const { stdout, exitCode } = execCli(['generate-program-client-types', '--help']);
        expect(stdout).toContain('Usage:');
        expect(exitCode).toBe(0);
    });

    test('should read IDL and write output file for generate-program-client-types', () => {
        const idlPath = path.resolve('tests/idls/circular-account-refs-idl.json');
        const tmpDir = mkdtempSync(path.join(tmpdir(), 'cli-test-'));
        tmpDirs.push(tmpDir);

        const { exitCode } = execCli(['generate-program-client-types', idlPath, tmpDir]);
        expect(exitCode).toBe(0);

        const outputPath = path.join(tmpDir, 'circular-account-refs-idl-types.ts');
        const output = readFileSync(outputPath, 'utf-8');
        const expected = readFileSync('tests/generated/circular-account-refs-idl-types.ts', 'utf-8');
        expect(output).toBe(expected);
    });
});
