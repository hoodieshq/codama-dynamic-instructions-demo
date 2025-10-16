import { createFromRoot, createFromJson } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { readFileSync } from "node:fs";
import { writeFile } from "@codama/renderers-core";
import path from "path";

const idlPath = path.join(__dirname, "../target/idl/example.json");
console.log(`Start generation from IDL: ${idlPath}`);
const idl = JSON.parse(readFileSync(idlPath, "utf-8"));

console.log("Creating codama client..");
const codama = createFromRoot(rootNodeFromAnchor(idl));
const pathToIdl = path.join(
  __dirname,
  "./idls/example-idl.json"
);
console.log("Generating example-idl.json..");
let codamaJSON = JSON.parse(codama.getJson());
let json = JSON.stringify(codamaJSON, null, 2);

writeFile(pathToIdl, json);
// codama.accept(
//   renderVisitor(pathToGeneratedFolder, {
//     deleteFolderBeforeRendering: true,
//     formatCode: true,
//     crateFolder: path.join(__dirname, "../"),
//   })
// );

console.log("Done");
