import http from 'node:http';
import https from 'node:https';

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const SIMPLE_METHODS = new Set(['GET', 'HEAD', 'POST']);

export function parseArgs(argv) {
  const options = { method: 'GET', credentials: 'omit', timeout: 5000, headers: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { options.help = true; continue; }
    if (arg === '--json' || arg === '--no-color') { options[arg.slice(2).replace('-', '')] = true; continue; }
    if (arg.startsWith('-')) {
      if (!['--origin', '--method', '--header', '--credentials', '--timeout'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`);
      if (arg === '--header') options.headers.push(...value.split(',').map(s => s.trim()));
      else if (arg === '--origin') options.origin = value;
      else if (arg === '--method') options.method = value.toUpperCase();
      else if (arg === '--credentials') options.credentials = value;
      else options.timeout = Number(value);
      continue;
    }
    if (options.url) throw new Error('Give one URL');
    options.url = arg;
  }
  if (options.help) return options;
  if (!options.url || !options.origin) throw new Error('Give a URL and --origin ORIGIN');
  let url;
  try { url = new URL(options.url); } catch { throw new Error('URL must be an absolute HTTP or HTTPS URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL must use HTTP or HTTPS');
  if (url.username || url.password) throw new Error('URL must not contain credentials');
  if (options.origin !== 'null') {
    let origin;
    try { origin = new URL(options.origin); } catch { throw new Error('Origin must be an HTTP or HTTPS origin'); }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
      throw new Error('Origin must be an HTTP or HTTPS origin without a path');
    }
    options.origin = origin.origin;
  }
  if (!TOKEN.test(options.method) || ['CONNECT', 'TRACE', 'TRACK'].includes(options.method)) throw new Error('Invalid browser request method');
  if (!['omit', 'same-origin', 'include'].includes(options.credentials)) throw new Error('Credentials must be omit, same-origin, or include');
  if (!Number.isInteger(options.timeout) || options.timeout < 1 || options.timeout > 60000) throw new Error('Timeout must be 1 to 60000 milliseconds');
  options.headers = [...new Set(options.headers.map(s => s.toLowerCase()))].sort();
  if (options.headers.some(s => !TOKEN.test(s) || s === 'origin' || s.startsWith('access-control-'))) throw new Error('Use request header names from Access-Control-Request-Headers');
  options.url = url.toString();
  return options;
}

export function evaluate(options, response) {
  const needed = !SIMPLE_METHODS.has(options.method) || options.headers.length > 0;
  const result = { url: options.url, origin: options.origin, method: options.method, headers: options.headers, credentials: options.credentials, preflightNeeded: needed, status: response?.status ?? null, checks: [], ok: null };
  if (!needed) return result;
  const values = response?.headers ?? {};
  const value = name => (values[name] ?? []).join(', ');
  const add = (name, ok, observed, expected, hint) => result.checks.push({ name, ok, observed, expected, hint: ok ? '' : hint });
  const status = response?.status ?? 0;
  add('OPTIONS status', status >= 200 && status < 300, String(status || 'no response'), '2xx', status >= 300 && status < 400 ? 'The preflight redirected. Handle OPTIONS at the requested URL.' : 'Let OPTIONS reach the CORS handler without authentication.');
  const origins = values['access-control-allow-origin'] ?? [];
  const allowedOrigin = origins.length === 1 ? origins[0] : '';
  const originOk = origins.length === 1 && (allowedOrigin === options.origin || (allowedOrigin === '*' && options.credentials !== 'include'));
  add('Allow origin', originOk, value('access-control-allow-origin') || '(missing)', options.credentials === 'include' ? options.origin : `${options.origin} or *`, options.credentials === 'include' ? 'Return the exact Origin value. Wildcard origins cannot be used with credentials.' : 'Return Access-Control-Allow-Origin for this origin.');
  if (options.credentials === 'include') {
    const credentialValues = values['access-control-allow-credentials'] ?? [];
    add('Allow credentials', credentialValues.length === 1 && credentialValues[0] === 'true', value('access-control-allow-credentials') || '(missing)', 'true', 'Return Access-Control-Allow-Credentials: true on OPTIONS.');
  }
  const methods = splitTokens(value('access-control-allow-methods'));
  const methodOk = SIMPLE_METHODS.has(options.method) || methods.includes(options.method) || (methods.includes('*') && options.credentials !== 'include');
  add('Allow method', methodOk, value('access-control-allow-methods') || (SIMPLE_METHODS.has(options.method) ? '(safelisted method)' : '(missing)'), options.method, `Add ${options.method} to Access-Control-Allow-Methods.`);
  const allowedHeaders = splitTokens(value('access-control-allow-headers')).map(s => s.toLowerCase());
  const missing = options.headers.filter(h => !allowedHeaders.includes(h) && !(allowedHeaders.includes('*') && options.credentials !== 'include' && h !== 'authorization'));
  add('Allow headers', missing.length === 0, value('access-control-allow-headers') || '(missing)', options.headers.join(', ') || '(none requested)', `Add ${missing.join(', ')} to Access-Control-Allow-Headers.`);
  result.ok = result.checks.every(c => c.ok);
  return result;
}

function splitTokens(value) { return value.split(',').map(s => s.trim()).filter(Boolean); }

export function requestPreflight(options) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url);
    const client = url.protocol === 'https:' ? https : http;
    const headers = { Origin: options.origin, 'Access-Control-Request-Method': options.method };
    if (options.headers.length) headers['Access-Control-Request-Headers'] = options.headers.join(', ');
    const req = client.request(url, { method: 'OPTIONS', headers, timeout: options.timeout, agent: false }, res => {
      const raw = {};
      for (let i = 0; i < res.rawHeaders.length; i += 2) {
        const key = res.rawHeaders[i].toLowerCase();
        (raw[key] ??= []).push(res.rawHeaders[i + 1]);
      }
      resolve({ status: res.statusCode, headers: raw });
      res.destroy();
    });
    req.on('timeout', () => req.destroy(new Error(`OPTIONS timed out after ${options.timeout} ms`)));
    req.on('error', reject);
    req.end();
  });
}

const HELP = `Usage: corswhy URL --origin ORIGIN [options]

Send one OPTIONS preflight and explain the response. The actual request is never sent.

Options:
  --method METHOD             Browser request method (default: GET)
  --header NAMES              Names from Access-Control-Request-Headers, comma separated
  --credentials MODE          omit, same-origin, or include (default: omit)
  --timeout MS                Request timeout (default: 5000)
  --json                      Machine readable report
  --no-color                  Disable terminal colors
  --help                      Show this help

Example:
  corswhy http://localhost:8000/api --origin http://localhost:5173 --method POST --header authorization,content-type
`;

export function render(result, color = false) {
  if (!result.preflightNeeded) return 'No preflight expected for these inputs. Supply header names from the browser preflight if it sent one.\nActual response CORS checks were not tested.';
  const paint = (s, ok) => color ? `\x1b[${ok ? '32' : '31'}m${s}\x1b[0m` : s;
  const lines = [`OPTIONS ${result.status ?? 'error'}  ${result.url}`, `Origin ${result.origin}  Method ${result.method}`, ''];
  for (const c of result.checks) lines.push(`${paint(c.ok ? 'PASS' : 'FAIL', c.ok)}  ${c.name.padEnd(18)} ${c.observed}`);
  const failed = result.checks.find(c => !c.ok);
  lines.push('', failed ? `Fix: ${failed.hint}` : 'Preflight checks passed. The actual response was not tested.');
  lines.push('Browser behavior for private networks, cookies, and extensions was not tested.');
  return lines.join('\n');
}

export async function main(argv, io = { out: console.log, err: console.error }) {
  let options;
  try { options = parseArgs(argv); } catch (error) { io.err(`corswhy: ${error.message}\nRun corswhy --help for usage.`); return 2; }
  if (options.help) { io.out(HELP); return 0; }
  try {
    const needed = !SIMPLE_METHODS.has(options.method) || options.headers.length > 0;
    const response = needed ? await requestPreflight(options) : null;
    const result = evaluate(options, response);
    io.out(options.json ? JSON.stringify(result, null, 2) : render(result, !options.nocolor && (process.stdout.isTTY || process.env.FORCE_COLOR) && !process.env.NO_COLOR));
    return result.ok === false ? 1 : 0;
  } catch (error) { io.err(`corswhy: ${error.message}`); return 2; }
}
