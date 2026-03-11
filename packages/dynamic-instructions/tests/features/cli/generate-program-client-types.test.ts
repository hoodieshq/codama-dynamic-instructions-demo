import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

describe('CLI', () => {
    const tmpDirs: string[] = [];

    afterAll(() => {
        for (const dir of tmpDirs) {
            rmSync(dir, { force: true, recursive: true });
        }
    });

    test('should print help when no arguments are provided', () => {
        const { stdout, exitCode } = execCli([]);
        expect(stdout).toContain('Usage: dynamic-instructions <command> [options]');
        expect(exitCode).toBe(0);
    });

    test('should print help when --help flag is provided', () => {
        const { stdout, exitCode } = execCli(['--help']);
        expect(stdout).toContain('Usage: dynamic-instructions <command> [options]');
        expect(exitCode).toBe(0);
    });

    test('should exit with code 1 for unknown commands', () => {
        const { stderr, exitCode } = execCli(['unknown-cmd']);
        expect(stderr).toContain('Unknown command: unknown-cmd');
        expect(exitCode).toBe(1);
    });

    test('should print subcommand help for generate-program-client-types --help', () => {
        const { stdout, exitCode } = execCli(['generate-program-client-types', '--help']);
        expect(stdout).toContain(
            'Usage: dynamic-instructions generate-program-client-types <codama-idl.json> <output-dir>',
        );
        expect(exitCode).toBe(0);
    });

    test('should exit with code 1 when output dir argument is missing', () => {
        const { exitCode, stdout } = execCli(['generate-program-client-types', 'some-file.json']);
        expect(exitCode).toBe(1);
        expect(stdout).toContain(
            'Usage: dynamic-instructions generate-program-client-types <codama-idl.json> <output-dir>',
        );
    });

    test('should exit with code 1 when IDL file does not exist', () => {
        const tmpDir = mkdtempSync(path.join(tmpdir(), 'cli-test-'));
        tmpDirs.push(tmpDir);
        const { exitCode, stderr } = execCli(['generate-program-client-types', '/nonexistent/path.json', tmpDir]);
        expect(exitCode).toBe(1);
        expect(stderr).toContain('IDL file not found');
    });

    test('should exit with code 1 when IDL file contains invalid JSON', () => {
        const tmpDir = mkdtempSync(path.join(tmpdir(), 'cli-test-'));
        tmpDirs.push(tmpDir);
        const badFile = path.join(tmpDir, 'bad.json');
        writeFileSync(badFile, '{ not valid json');
        const { exitCode, stderr } = execCli(['generate-program-client-types', badFile, tmpDir]);
        expect(exitCode).toBe(1);
        expect(stderr).toContain('not valid JSON');
    });

    test('should read IDL and write output file for generate-program-client-types', () => {
        const idlPath = path.resolve('tests/idls/circular-account-refs-idl.json');
        const tmpDir = mkdtempSync(path.join(tmpdir(), 'cli-test-'));
        tmpDirs.push(tmpDir);

        const { exitCode } = execCli(['generate-program-client-types', idlPath, tmpDir]);
        expect(exitCode).toBe(0);

        const outputPath = path.join(tmpDir, 'circular-account-refs-idl-types.ts');
        const output = readFileSync(outputPath, 'utf-8');
        const idl = JSON.parse(readFileSync(idlPath, 'utf-8')) as IdlRoot;
        const expected = generateProgramClientType(idl);
        expect(output).toBe(expected);
    });
});
