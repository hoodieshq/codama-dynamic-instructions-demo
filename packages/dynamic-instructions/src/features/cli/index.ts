import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { IdlRoot } from './commands/generate-program-client-types';
import { generateProgramClientType } from './commands/generate-program-client-types';

const HELP_TEXT = `Usage: dynamic-instructions <command> [options]

Commands:
  generate-program-client-types  Generate TS types from a Codama IDL JSON file

Options:
  --help  Show help

Example:
  npx @hoodieshq/dynamic-instructions generate-program-client-types ./idl.json ./output
`;

const GENERATE_HELP_TEXT = `Usage: dynamic-instructions generate-program-client-types <codama-idl.json> <output-dir>

Arguments:
  codama-idl  Path to a Codama IDL JSON file (e.g., ./idl/codama.json)
  output-dir  Path to the output directory for the generated .ts file

Example:
  npx @hoodieshq/dynamic-instructions generate-program-client-types ./idl.json ./generated
`;

// Thin CLI wrapper — intentionally avoids external deps like commander.js for the time being to keep things simple and straightforward.
// Can be replaced later if needed.
export function run(argv: string[]): void {
    const args = argv.slice(2);

    if (args.length === 0 || args[0] === '--help') {
        console.log(HELP_TEXT);
        return;
    }

    const command = args[0];

    switch (command) {
        case 'generate-program-client-types':
            runGenerateProgramClientTypes(args.slice(1));
            break;
        default:
            console.error(`Unknown command: ${command}\n`);
            console.log(HELP_TEXT);
            process.exit(1);
    }
}

function runGenerateProgramClientTypes(args: string[]): void {
    if (args.includes('--help')) {
        console.log(GENERATE_HELP_TEXT);
        return;
    }
    if (args.length < 2) {
        console.log(GENERATE_HELP_TEXT);
        process.exit(1);
    }

    const idlPath = path.resolve(args[0]!);
    const outputDir = path.resolve(args[1]!);

    if (!existsSync(idlPath)) {
        console.error(`Error: IDL file not found: ${idlPath}`);
        process.exit(1);
    }

    console.log(`Reading IDL from: ${idlPath}`);

    let idlJson: string;
    try {
        idlJson = readFileSync(idlPath, 'utf-8');
    } catch (err) {
        console.error(`Error reading IDL file: ${(err as Error).message}`);
        process.exit(1);
    }

    let idl: IdlRoot;
    try {
        idl = JSON.parse(idlJson) as IdlRoot;
    } catch (err) {
        console.error(`Error: ${idlPath} is not valid JSON: ${(err as Error).message}`);
        process.exit(1);
    }

    try {
        mkdirSync(outputDir, { recursive: true });

        const fileName = path.basename(idlPath);
        const outputFile = fileName.replace(/\.json$/, '-types.ts');
        const outputPath = path.join(outputDir, outputFile);

        console.log(`Generating types for program: ${idl.program.name}`);
        const types = generateProgramClientType(idl);

        console.log(`Writing types to: ${outputPath}`);
        writeFileSync(outputPath, types, 'utf-8');
        console.log('Done!');
    } catch (err) {
        console.error(`Error writing generated types: ${(err as Error).message}`);
        process.exit(1);
    }
}
