import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { generateClientTypes, type IdlRoot } from './generate-client-types';

export function generateClientTypesFromFile(codamaIdlPath: string, outputDirPath: string) {
    const idlPath = path.resolve(codamaIdlPath);
    const outputDir = path.resolve(outputDirPath);

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
        const types = generateClientTypes(idl);

        console.log(`Writing types to: ${outputPath}`);
        writeFileSync(outputPath, types, 'utf-8');
        console.log('Done!');
    } catch (err) {
        console.error(`Error writing generated types: ${(err as Error).message}`);
        process.exit(1);
    }
}
