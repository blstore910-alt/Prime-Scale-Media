// Test-only module resolver.
//
// Next.js/TypeScript let a module import a sibling without an extension
// (`import { x } from "./thing"`). Node's ESM loader does not — it requires
// `./thing.ts`. That mismatch is invisible until a tested module imports
// another local module at runtime, at which point `node --test` dies with
// ERR_MODULE_NOT_FOUND while the app builds fine.
//
// Rather than put `.ts` extensions into source that Next has to compile
// (unsupported in a production build), this hook teaches the TEST runner the
// resolution rule the bundler already uses: if an extensionless relative
// specifier doesn't resolve, try `.ts`, then `.tsx`, then `/index.ts`.
//
// Wired via `--import ./tests/ts-resolve.mjs` in the `test` script. It only
// ever runs under the test runner; the app's own resolution is untouched.

import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const CANDIDATE_SUFFIXES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Only relative, extensionless specifiers are our business. Bare package
    // names ("node:test", "@supabase/...") must keep normal resolution.
    const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);

    if (isRelative && !hasExtension && context.parentURL) {
      const base = new URL(specifier, context.parentURL);
      for (const suffix of CANDIDATE_SUFFIXES) {
        const candidate = new URL(base.href + suffix);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
    }

    // Also support the "@/..." path alias the app uses, mapped to the repo
    // root the same way tsconfig.json does.
    if (specifier.startsWith("@/")) {
      const root = new URL("../", import.meta.url);
      const base = new URL(specifier.slice(2), root);
      const tries = /\.[a-zA-Z0-9]+$/.test(specifier)
        ? [base.href]
        : CANDIDATE_SUFFIXES.map((s) => base.href + s);
      for (const href of tries) {
        if (existsSync(fileURLToPath(new URL(href)))) {
          return nextResolve(href, context);
        }
      }
    }

    return nextResolve(specifier, context);
  },
});

// Silence the "module type not specified" reparse warning for .ts test files;
// it is noise that buries real failures in CI output.
void pathToFileURL;
