import { existsSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parse } from 'dotenv';

// Infrastructure only. User/provider credentials are resolved from the backend.
// Keep legacy desktop Env typings out of this hosted runtime allowlist.
export const HOSTED_RUNTIME_KEYS = [
  'RAYU_BACKEND_URL',
  'RAYU_GATEWAY_URL',
  'RAYU_STUDIO_AUTH_BRIDGE_URL',
  'RAYU_STUDIO_SERVER_SECRET',
  'RUNNING_IN_DOCKER',
  'OLLAMA_API_BASE_URL',
  'LMSTUDIO_API_BASE_URL',
  'DEFAULT_NUM_CTX',
];

export function hostedBindings(sources = [], environment = {}) {
  const settings = {};
  for (const source of sources) {
    for (const [name, value] of Object.entries(parse(source))) {
      if (value.trim()) settings[name] = value;
    }
  }
  // Explicit runtime environment takes precedence over files, including an
  // intentionally empty value used to disable a file setting.
  for (const name of HOSTED_RUNTIME_KEYS) {
    if (typeof environment[name] === 'string') settings[name] = environment[name];
  }
  return HOSTED_RUNTIME_KEYS.flatMap((name) =>
    typeof settings[name] === 'string' && settings[name].trim() ? ['--binding', `${name}=${settings[name]}`] : [],
  );
}

export function readHostedBindings(root, environment = process.env) {
  const mode = environment.NODE_ENV === 'production' ? 'production' : 'development';
  // Match Vite's dotenv precedence. A missing file is fine in a Coolify image.
  const sources = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
    .map((name) => resolve(root, name))
    .filter((name) => existsSync(name))
    .map((name) => readFileSync(name, 'utf8'));
  return hostedBindings(sources, environment);
}

export function privateWranglerEnvironment(bindings) {
  const lines = [];
  for (let i = 0; i < bindings.length; i += 2) {
    const separator = bindings[i + 1].indexOf('=');
    const name = bindings[i + 1].slice(0, separator);
    // Wrangler expands $NAME/${NAME} in dotenv values. Escape literal dollars
    // so an existing runtime secret cannot be changed by that expansion.
    const value = bindings[i + 1].slice(separator + 1).replaceAll('$', '\\$');
    // Choose a dotenv representation that round-trips without interpolating
    // shell expressions or changing secret bytes.
    const quoted = [`'${value}'`, `"${value}"`, `\`${value}\``, value].find(
      (candidate) => parse(`${name}=${candidate}\n`)[name] === value,
    );
    if (quoted === undefined)
      throw new Error('A Studio runtime setting cannot be represented safely in dotenv format.');
    lines.push(`${name}=${quoted}`);
  }
  const directory = mkdtempSync(join(tmpdir(), 'rayu-studio-runtime-'));
  const file = join(directory, 'runtime.env');
  const cleanup = () => {
    rmSync(file, { force: true });
    if (existsSync(directory)) rmdirSync(directory);
  };
  try {
    writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
  } catch (error) {
    cleanup();
    throw error;
  }
  return { file, cleanup };
}

function main() {
  const [separator, command, ...args] = process.argv.slice(2);
  if (separator !== '--' || !command) {
    // Do not support the old command-substitution form: it printed secrets.
    console.error('Usage: ./bindings.sh -- <command> [args...]');
    process.exitCode = 64;
    return;
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const bindings = readHostedBindings(root);
  const wrangler = ['wrangler', 'wrangler.cmd', 'wrangler.js'].includes(basename(command));
  // Wrangler prints literal --binding values as public vars. Loading a private
  // env file instead marks these as secrets and keeps the key out of argv/logs.
  const runtime = wrangler ? privateWranglerEnvironment(bindings) : null;
  const child = spawn(command, [...args, ...(runtime ? ['--env-file', runtime.file] : bindings)], {
    stdio: 'inherit',
    env: runtime
      ? { ...process.env, CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true' }
      : process.env,
  });
  if (runtime) process.on('exit', runtime.cleanup);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  child.on('error', () => {
    runtime?.cleanup();
    console.error('Could not start the Studio runtime command.');
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
