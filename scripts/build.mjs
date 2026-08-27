// Bundles the extension into a single self-contained CommonJS file.
// `vscode` is kept external (provided by the host at runtime); everything else
// (including the ESM-only AI SDK) is inlined so the published artifact has no
// ESM/CJS resolution issues.
import { build } from "esbuild";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

await build({
	entryPoints: [resolve(root, "src/extension.ts")],
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node18",
	outfile: resolve(root, "out/extension.js"),
	external: ["vscode"],
	// AI SDK pulls in optional deps that may be absent; don't fail the build on them.
	logLevel: "info",
});
