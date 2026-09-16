const http = require('http');
const crypto = require('crypto');
const { chromium } = require('playwright');
const sessions = new Map();
let browser;

async function createSession() {
  if (!browser) browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('https://everify.bdris.gov.bd/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const id = crypto.randomUUID();
  sessions.set(id, { context, page, created: Date.now() });
  return { id, page };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (error) { reject(error); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && req.url.startsWith('/session')) {
      const session = await createSession();
      const image = await session.page.locator('img[src*="DefaultCaptcha/Generate"]').first().screenshot();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ sessionId: session.id, captcha: image.toString('base64') }));
    }
    if (req.method === 'POST' && req.url === '/submit') {
      const data = await readJson(req);
      const session = sessions.get(data.sessionId);
      if (!session) throw new Error('Session expired');
      await session.page.locator('#ubrn').fill(String(data.birthNumber));
      await session.page.locator('#BirthDate').fill(String(data.dob));
      await session.page.locator('#CaptchaInputText').fill(String(data.captchaAnswer));
      await session.page.locator('input[type="submit"]').evaluate(element => element.click());
      await session.page.waitForTimeout(2500);
      const result = await session.page.locator('body').innerText();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ sessionId: data.sessionId, result: result.slice(0, 4000) }));
    }
    res.writeHead(404); res.end();
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(Number(process.env.PORT || 10000), '0.0.0.0', () => console.log('Playwright service is ready'));
setInterval(async () => {
  for (const [id, session] of sessions) {
    if (Date.now() - session.created > 10 * 60 * 1000) {
      await session.context.close().catch(() => {});
      sessions.delete(id);
    }
  }
}, 60000);
