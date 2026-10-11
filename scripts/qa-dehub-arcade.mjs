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
    res.end(`<meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe sandbox="allow-scripts allow-pointer-lock allow-downloads" src="/gods-eye-game/index.html"></iframe><script>window.requests=[];window.addEventListener('message',function(event){if(event.data?.source!=='gods-eye-view'||!event.data.requestId)return;window.requests.push(event.data);event.source.postMessage({source:'social-presence-host',type:'presence-result',requestId:event.data.requestId,error:'Sign in to place yourself on the globe.'},'*')});</script>`);
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
  page.on('console', (message) => { if (message.type() === 'error') console.log('Browser:', message.text()); });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('/functions/v1/map-presence')) {
      void request.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"people":[]}' });
    } else void request.continue();
  });
  await page.goto('http://127.0.0.1:4174');
  let frame = page.frames().find((entry) => entry.url().includes('/gods-eye-game/'));
  assert.ok(frame);
  try {
    await frame.waitForSelector('#dehub-community', { timeout: 60000 });
  } catch (error) {
    console.log('Page errors:', errors);
    console.log('Startup:', await frame.$eval('body', (body) => body.innerText.slice(-5000)));
    await page.screenshot({ path: 'dehub-startup-failure.png' });
    throw error;
  }
  await frame.click('#dehub-community summary');
  await frame.click('[data-first-run-choice="explore"]');
  assert.match(await frame.$eval('#dehub-community', (element) => element.textContent), /25 km/);
  assert.equal(await frame.$$eval('#dehub-community button', (buttons) => buttons.length), 6);
  await frame.click('#dehub-community [data-action="remove"]');
  await frame.waitForFunction(() => document.querySelector('#dehub-community [data-status]').textContent.includes('Sign in'));
  assert.equal(await page.evaluate(() => window.requests.at(-1).type), 'presence-remove-requested');
  await frame.click('#dehub-community [data-action="locate"]');
  await frame.waitForFunction(() => !document.querySelector('#dehub-community [data-action="locate"]').disabled);
  assert.equal(await page.evaluate(() => window.requests.at(-1).type), 'presence-place-requested');
  await frame.click('#dehub-community [data-action="choose"]');
  await page.mouse.click(640, 400);
  await frame.waitForSelector('#dehub-community [data-confirm]:not([hidden])');
  await frame.click('#dehub-community [data-action="save"]');
  await frame.waitForFunction(() => !document.querySelector('#dehub-community [data-action="save"]').disabled);
  const pin = await page.evaluate(() => window.requests.at(-1));
  assert.ok(Number.isFinite(pin.latitude) && Number.isFinite(pin.longitude));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: 'dehub-desktop.png' });
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  frame = page.frames().find((entry) => entry.url().includes('/gods-eye-game/'));
  await frame.waitForSelector('#dehub-community', { timeout: 60000 });
  await frame.click('[data-first-run-choice="explore"]');
  await frame.click('#dehub-community summary');
  const box = await frame.$eval('#dehub-community', (element) => ({ width: element.offsetWidth, left: element.getBoundingClientRect().left }));
  assert.ok(box.width + box.left <= 390);
  await page.screenshot({ path: 'dehub-mobile.png' });
  console.log('Sandboxed globe boots with community placement controls on desktop and phone.');
} finally {
  await browser.close();
  server.close();
}
