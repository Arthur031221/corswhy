import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { evaluate, main, parseArgs } from '../src/index.js';

const requests = [];
let server;
let base;

before(async () => {
  server = createServer((req, res) => {
    requests.push({ method: req.method, headers: req.headers });
    const common = {
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Methods': 'POST, PUT',
      'Access-Control-Allow-Headers': 'authorization, content-type'
    };
    if (req.url === '/auth') { res.writeHead(401); res.end(); return; }
    if (req.url === '/missing') delete common['Access-Control-Allow-Headers'];
    if (req.url === '/wildcard') {
      common['Access-Control-Allow-Origin'] = '*';
      common['Access-Control-Allow-Headers'] = '*';
      common['Access-Control-Allow-Methods'] = '*';
      common['Access-Control-Allow-Credentials'] = 'true';
    }
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/pass' }); res.end(); return; }
    if (req.url === '/duplicate') {
      res.writeHead(204, { ...common, 'Access-Control-Allow-Origin': ['http://localhost:5173', 'http://localhost:5173'] });
      res.end(); return;
    }
    if (req.url === '/credential') common['Access-Control-Allow-Credentials'] = 'true';
    res.writeHead(204, common);
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const flags = ['--origin', 'http://localhost:5173', '--method', 'POST', '--header', 'authorization,content-type', '--json'];
async function run(path, extra = []) {
  const output = [];
  const errors = [];
  const code = await main([`${base}${path}`, ...flags, ...extra], { out: s => output.push(s), err: s => errors.push(s) });
  return { code, report: output.length ? JSON.parse(output[0]) : null, errors };
}

test('sends OPTIONS with browser preflight headers and never sends POST', async () => {
  const beforeCount = requests.length;
  const { code, report } = await run('/pass');
  assert.equal(code, 0);
  assert.equal(report.ok, true);
  assert.deepEqual(requests.slice(beforeCount).map(r => r.method), ['OPTIONS']);
  assert.equal(requests.at(-1).headers.origin, 'http://localhost:5173');
  assert.equal(requests.at(-1).headers['access-control-request-method'], 'POST');
  assert.equal(requests.at(-1).headers['access-control-request-headers'], 'authorization, content-type');
});

test('normalizes an equivalent origin before sending the preflight', async () => {
  const beforeCount = requests.length;
  const output = [];
  const code = await main([`${base}/pass`, '--origin', 'HTTP://LOCALHOST:5173/', '--method', 'POST', '--header', 'authorization', '--json'], { out: s => output.push(s), err: () => {} });
  const report = JSON.parse(output[0]);
  assert.equal(code, 0);
  assert.equal(report.origin, 'http://localhost:5173');
  assert.equal(requests.slice(beforeCount)[0].headers.origin, 'http://localhost:5173');
});

test('normalizes equivalent origin URL spellings', () => {
  const options = parseArgs(['http://localhost/api', '--origin', 'HTTPS://EXAMPLE.COM:443/']);
  assert.equal(options.origin, 'https://example.com');
});

test('401 preflight reports status failure and authentication repair', async () => {
  const { code, report } = await run('/auth');
  assert.equal(code, 1);
  assert.equal(report.checks[0].name, 'OPTIONS status');
  assert.equal(report.checks[0].ok, false);
  assert.match(report.checks[0].hint, /without authentication/);
});

test('missing allowed header names are reported by name', async () => {
  const { code, report } = await run('/missing');
  assert.equal(code, 1);
  assert.match(report.checks.at(-1).hint, /authorization, content-type/);
});

test('credentialed preflight rejects wildcard origin', async () => {
  const { code, report } = await run('/wildcard', ['--credentials', 'include']);
  assert.equal(code, 1);
  assert.equal(report.checks.find(c => c.name === 'Allow origin').ok, false);
  assert.equal(report.checks.find(c => c.name === 'Allow credentials').ok, true);
});

test('credentialed preflight accepts explicit origin and credentials', async () => {
  const { code, report } = await run('/credential', ['--credentials', 'include']);
  assert.equal(code, 0);
  assert.equal(report.ok, true);
});

test('redirect and duplicate origin values are rejected', async () => {
  assert.equal((await run('/redirect')).report.checks[0].ok, false);
  assert.equal((await run('/duplicate')).report.checks.find(c => c.name === 'Allow origin').ok, false);
});

test('authorization must be listed even with wildcard allowed headers', () => {
  const options = parseArgs([`${base}/wildcard`, '--origin', 'http://localhost:5173', '--method', 'PUT', '--header', 'authorization']);
  const report = evaluate(options, { status: 204, headers: { 'access-control-allow-origin': ['*'], 'access-control-allow-methods': ['*'], 'access-control-allow-headers': ['*'] } });
  assert.equal(report.checks.find(c => c.name === 'Allow headers').ok, false);
  assert.equal(report.checks.find(c => c.name === 'Allow method').ok, true);
});

test('simple GET without named unsafe headers makes no network request', async () => {
  const beforeCount = requests.length;
  const output = [];
  const code = await main([`${base}/pass`, '--origin', 'http://localhost:5173'], { out: s => output.push(s), err: () => {} });
  assert.equal(code, 0);
  assert.equal(requests.length, beforeCount);
  assert.match(output[0], /No preflight expected/);
});

test('invalid inputs fail before a request is sent', async () => {
  const beforeCount = requests.length;
  const errors = [];
  const code = await main([`${base}/pass`, '--origin', 'http://localhost:5173/path', '--method', 'POST'], { out: () => {}, err: s => errors.push(s) });
  assert.equal(code, 2);
  assert.equal(requests.length, beforeCount);
  assert.match(errors[0], /Origin must/);
});
