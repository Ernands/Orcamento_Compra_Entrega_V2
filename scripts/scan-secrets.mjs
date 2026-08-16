import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git', 'node_modules', 'dist', 'coverage', '.temp']);
const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.md',
  '.sql',
  '.toml',
  '.yml',
  '.yaml',
  '.html',
  '.css',
  '.example',
  '',
]);
const findings = [];
const patterns = [
  { name: 'Supabase secret key', regex: /sb_secret_[A-Za-z0-9._-]{20,}/g },
  { name: 'Private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  {
    name: 'Secret exposed through Vite',
    regex: /VITE_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|JWT_PRIVATE|PASSWORD)[A-Z0-9_]*/g,
  },
];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    if (!textExtensions.has(extname(entry.name))) continue;
    const contents = await readFile(path, 'utf8');
    for (const pattern of patterns) {
      if (pattern.regex.test(contents)) findings.push(`${relative(root, path)}: ${pattern.name}`);
      pattern.regex.lastIndex = 0;
    }
  }
}

await walk(root);

if (findings.length) {
  process.stderr.write(`Possiveis secrets encontrados:\n${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Secret scan concluido: nenhum secret versionado encontrado.\n');
}
