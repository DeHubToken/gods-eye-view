import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const root = path.resolve('dist');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.html': 'text/html', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<iframe style="width:100vw;height:100vh" sandbox="allow-scripts allow-pointer-lock allow-downloads" src="/gods-eye-game/index.html"></iframe>');
    return;
  }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + pathname.replace(/^\/gods-eye-game/, ''));
  if (!file.startsWith(root + path.sep)) { res.writeHead(404).end(); return; }
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(4174, '127.0.0.1', resolve));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 850 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('/functions/v1/map-presence')) {
      void request.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"people":[]}' });
    } else void request.continue();
  });
  await page.goto('http://127.0.0.1:4174');
  const frame = page.frames().find((entry) => entry.url().includes('/gods-eye-game/'));
  assert.ok(frame);
  await frame.waitForSelector('#dehub-community', { timeout: 90000 });
  await frame.click('#dehub-community summary');
  assert.match(await frame.$eval('#dehub-community', (element) => element.textContent), /25 km/);
  assert.equal(await frame.$$eval('#dehub-community button', (buttons) => buttons.length), 6);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: 'dehub-desktop.png' });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.screenshot({ path: 'dehub-mobile.png' });
  console.log('Sandboxed globe boots with community placement controls on desktop and phone.');
} finally {
  await browser.close();
  server.close();
}
