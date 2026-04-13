import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import {
  render,
  listTemplates,
  listBrands,
  DEFAULT_BRANDS_DIR,
  validateBrandCss,
} from '@reelstack/image-gen';
import path from 'path';
import fs from 'fs';

const API_KEY = process.env.API_KEY;
const PORT = parseInt(process.env.PORT ?? '8000', 10);
const USER_BRANDS_DIR = process.env.BRANDS_DIR
  ? path.resolve(process.env.BRANDS_DIR)
  : path.join(process.cwd(), 'data', 'brands');

if (!API_KEY) {
  console.error('ERROR: API_KEY environment variable is required.');
  process.exit(1);
}

fs.mkdirSync(USER_BRANDS_DIR, { recursive: true });

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

// ── Health (public) ────────────────────────────────────────────
app.get('/health', (c) => c.json({ status: 'ok', service: 'image-gen' }));

// ── Templates (public) ────────────────────────────────────────
app.get('/templates', (c) => {
  const templates = listTemplates();
  return c.json({ templates });
});

// ── All routes below require API key ─────────────────────────
app.use('/generate', bearerAuth({ token: API_KEY }));
app.use('/brands', bearerAuth({ token: API_KEY }));
app.use('/brands/*', bearerAuth({ token: API_KEY }));

// ── Generate image ────────────────────────────────────────────
app.post('/generate', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { brand, template, size = 'post', ...rest } = body as Record<string, string>;

  if (!brand || !template) {
    return c.json({ error: 'brand and template are required' }, 400);
  }

  if (size === 'all') {
    return c.json({ error: 'size=all not yet supported. Use: post, story, youtube' }, 400);
  }

  // Look up brand in user dir first, then built-in
  const userBrandPath = path.join(USER_BRANDS_DIR, `${brand}.css`);
  const brandsDir = fs.existsSync(userBrandPath) ? USER_BRANDS_DIR : DEFAULT_BRANDS_DIR;

  let results;
  try {
    results = await render({ brand, template, size, ...rest }, brandsDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Render failed';
    return c.json({ error: message }, message.includes('not found') ? 400 : 500);
  }

  const { png, sizeName } = results[0]!;
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${template}-${brand}-${sizeName}.png"`,
    },
  });
});

// ── List brands ───────────────────────────────────────────────
app.get('/brands', (c) => {
  const builtin = listBrands(DEFAULT_BRANDS_DIR).map((name) => ({ name, source: 'builtin' }));
  const user = listBrands(USER_BRANDS_DIR).map((name) => ({ name, source: 'user' }));
  return c.json({ brands: [...builtin, ...user] });
});

// ── Upload brand CSS ──────────────────────────────────────────
app.post('/brands/:name', async (c) => {
  const name = c.req.param('name');
  if (!/^[a-z0-9-]+$/.test(name)) {
    return c.json({ error: 'Brand name must be lowercase alphanumeric with hyphens only' }, 400);
  }

  const css = await c.req.text();
  const { valid, error } = validateBrandCss(css);
  if (!valid) {
    return c.json({ error }, 400);
  }

  fs.writeFileSync(path.join(USER_BRANDS_DIR, `${name}.css`), css);
  return c.json({ ok: true, brand: name });
});

// ── Delete brand ──────────────────────────────────────────────
app.delete('/brands/:name', (c) => {
  const name = c.req.param('name');
  const brandPath = path.join(USER_BRANDS_DIR, `${name}.css`);
  if (!fs.existsSync(brandPath)) {
    return c.json({ error: `Brand '${name}' not found` }, 404);
  }
  fs.unlinkSync(brandPath);
  return c.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────
console.log(`image-gen server starting on port ${PORT}`);
console.log(`Built-in brands: ${listTemplates().join(', ')}`);
console.log(`User brands dir: ${USER_BRANDS_DIR}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
