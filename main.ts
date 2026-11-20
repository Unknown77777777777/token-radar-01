// Token Radar — entry program (Node 22, standard library only, no network).
//
// Reads the sealed snapshot, writes /output/board.json and /output/data.js,
// copies dashboard/ and screenshots/ into /output, and writes
// /output/dossier.json LAST with buildDossier from vendor/makefun-board.ts.
//
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// Fully deterministic: no clocks, no randomness, every tie sorted by slug.
// If the board fails any gate rule the program prints the problem to stderr
// and exits 1 without writing a bad board.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-board.ts';
import { buildBoard, buildLive, MODEL_VERSION, type Snapshot } from './lib/model.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

function fail(message: string): never {
  process.stderr.write(`token-radar: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '/input/snapshot.json';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && i + 1 < argv.length) {
      input = argv[++i]!;
    } else if (argv[i]!.startsWith('--input=')) {
      input = argv[i]!.slice('--input='.length);
    }
  }
  const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  return { input, output };
}

function readSnapshot(input: string): Snapshot {
  let path = input;
  try {
    if (statSync(path).isDirectory()) path = join(path, 'snapshot.json');
  } catch {
    fail(`cannot read input ${input}`);
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    fail(`cannot read input ${path}`);
  }
  let snapshot: Snapshot;
  try {
    snapshot = JSON.parse(raw!) as Snapshot;
  } catch {
    fail(`input ${path} is not valid JSON`);
  }
  if (!Array.isArray(snapshot!.protocols) || !Array.isArray(snapshot!.watchlist) || typeof snapshot!.as_of !== 'string') {
    fail(`input ${path} is not a snapshot (protocols/watchlist/as_of missing)`);
  }
  return snapshot!;
}

/** The gate rules: a board that fails any of these is never written. */
function validateBoard(rows: ReturnType<typeof buildBoard>, snapshot: Snapshot, boardBytes: number): void {
  const problems: string[] = [];
  if (rows.length < 100 || rows.length > 4000) problems.push(`board has ${rows.length} rows, outside 100-4000`);
  rows.forEach((r, i) => {
    if (r.rank !== i + 1) problems.push(`row ${i} has rank ${r.rank}, expected ${i + 1}`);
  });
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.implied_value_usd > rows[i - 1]!.implied_value_usd) {
      problems.push(`implied value rises from rank ${i} to rank ${i + 1}`);
      break;
    }
  }
  if (rows.length > 0 && rows.every((r) => r.implied_value_usd === rows[0]!.implied_value_usd)) {
    problems.push('every implied value is equal');
  }
  const slugs = new Set(rows.map((r) => r.slug));
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) problems.push(`watchlist slug ${slug} is missing from the board`);
  }
  rows.forEach((r) => {
    if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      problems.push(`row ${r.slug} has ${r.farm_steps.length} farm steps, outside 3-12`);
    } else {
      r.farm_steps.forEach((s, j) => {
        if (typeof s !== 'string' || s.length < 20 || s.length > 600) {
          problems.push(`row ${r.slug} farm step ${j + 1} is ${typeof s === 'string' ? s.length : 'not a string'} chars, outside 20-600`);
        }
      });
    }
  });
  if (boardBytes > 8 * 1024 * 1024) problems.push(`board.json is ${boardBytes} bytes, over 8 MiB`);
  if (problems.length > 0) fail(`board gate failed:\n- ${problems.slice(0, 20).join('\n- ')}`);
}

/** Self-verification, run after the dossier is written: re-read the /output
 *  the program just produced, re-validate board.json against the gate rules,
 *  rebuild the dossier from the same /output and require it to be
 *  byte-identical to the dossier.json on disk. Any mismatch exits 1. */
function verifyWrittenOutput(outDir: string, snapshot: Snapshot): { rows: number; watchlistCovered: number; dossierBytes: number } {
  const problems: string[] = [];

  let boardRaw: Buffer;
  try {
    boardRaw = readFileSync(join(outDir, 'board.json'));
  } catch {
    fail('self-check: cannot re-read board.json from the output just written');
  }
  let board: { rows: unknown };
  try {
    board = JSON.parse(boardRaw!.toString('utf8')) as { rows: unknown };
  } catch {
    fail('self-check: board.json just written is not valid JSON');
  }
  const rows = board!.rows;
  if (!Array.isArray(rows)) fail('self-check: board.json has no rows array');
  if (rows.length < 100 || rows.length > 4000) problems.push(`board has ${rows.length} rows, outside 100-4000`);
  rows.forEach((r, i) => {
    const row = r as { rank: number; slug: string; implied_value_usd: number; farm_steps: unknown };
    if (row.rank !== i + 1) problems.push(`row ${i} has rank ${row.rank}, expected ${i + 1}`);
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length !== 6) {
      problems.push(`row ${row.slug} has ${Array.isArray(row.farm_steps) ? row.farm_steps.length : 'no'} farm steps, expected 6`);
    } else {
      row.farm_steps.forEach((s, j) => {
        if (typeof s !== 'string' || s.length < 20 || s.length > 600) {
          problems.push(`row ${row.slug} farm step ${j + 1} is ${typeof s === 'string' ? s.length : 'not a string'} chars, outside 20-600`);
        }
      });
    }
  });
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1] as { implied_value_usd: number };
    const cur = rows[i] as { implied_value_usd: number };
    if (cur.implied_value_usd > prev.implied_value_usd) {
      problems.push(`implied value rises from rank ${i} to rank ${i + 1}`);
      break;
    }
  }
  if (rows.length > 0 && rows.every((r) => (r as { implied_value_usd: number }).implied_value_usd === (rows[0] as { implied_value_usd: number }).implied_value_usd)) {
    problems.push('every implied value is equal');
  }
  const slugs = new Set(rows.map((r) => (r as { slug: string }).slug));
  let watchlistCovered = 0;
  for (const slug of snapshot.watchlist) {
    if (slugs.has(slug)) watchlistCovered++;
    else problems.push(`watchlist slug ${slug} is missing from the board`);
  }
  if (boardRaw!.length > 8 * 1024 * 1024) problems.push(`board.json is ${boardRaw!.length} bytes, over 8 MiB`);
  if (problems.length > 0) fail(`self-check: board gate failed on re-read:\n- ${problems.slice(0, 20).join('\n- ')}`);

  // Rebuild the dossier from the same /output and require byte-identical output.
  const rebuilt = buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  const written = readFileSync(join(outDir, 'dossier.json'));
  if (!Buffer.from(rebuilt).equals(written)) {
    fail(
      `self-check: rebuilt dossier (${rebuilt.length} bytes) differs from the dossier.json just written ` +
        `(${written.length} bytes) — output is not reproducible, refusing to finish`,
    );
  }

  return { rows: rows.length, watchlistCovered, dossierBytes: written.length };
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snapshot = readSnapshot(input);
  const outDir = resolve(output);

  const rows = buildBoard(snapshot);
  const live = buildLive(snapshot);
  const boardText = JSON.stringify({ rows }, null, 2) + '\n';
  validateBoard(rows, snapshot, Buffer.byteLength(boardText, 'utf8'));

  const dataset = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    counts: {
      snapshot: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      board: rows.length,
      live: live.length,
    },
    watchlist: [...snapshot.watchlist].sort(),
    rows,
    live,
  };
  const dataText = `window.RADAR=${JSON.stringify(dataset)};\n`;

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), boardText, 'utf8');
  writeFileSync(join(outDir, 'data.js'), dataText, 'utf8');

  for (const sub of ['dashboard', 'screenshots']) {
    const src = join(REPO_ROOT, sub);
    const dst = join(outDir, sub);
    if (!existsSync(src)) fail(`repo is missing ${sub}/ to copy`);
    rmSync(dst, { recursive: true, force: true });
    cpSync(src, dst, { recursive: true });
  }

  // Dossier LAST: it hashes the dashboard and screenshots just written.
  const dossier = buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  // Self-verification: re-read what was just written and prove it is good
  // and reproducible before the program reports success.
  const check = verifyWrittenOutput(outDir, snapshot);

  process.stdout.write(
    `token-radar: ${rows.length} board rows (${snapshot.watchlist.length} watchlist), ${live.length} live tokens, ` +
      `board ${Buffer.byteLength(boardText, 'utf8')} bytes, dossier ${dossier.length} bytes -> ${outDir}\n`,
  );
  process.stdout.write(
    `token-radar: self-check OK — ${check.rows} board rows, watchlist ${check.watchlistCovered}/${snapshot.watchlist.length} covered, ` +
      `dossier ${check.dossierBytes} bytes verified byte-identical on rebuild\n`,
  );
}

main();
