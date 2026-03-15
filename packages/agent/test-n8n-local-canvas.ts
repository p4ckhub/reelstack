#!/usr/bin/env bun
import { chromium } from 'playwright';
import { fetchWorkflow } from './src/generators/n8n-workflow-fetcher';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 3840, height: 2160 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();

// Step 1: Sign in
console.log('Signing in...');
await page.goto('http://localhost:5678/signin', { waitUntil: 'networkidle', timeout: 30000 });
await page.fill('#emailOrLdapLoginId', 'test@test.com');
await page.fill('#password', 'TestPass123!');
await page.click('button:has-text("Sign in")');
await page.waitForTimeout(3000);

// Step 2: Get full workflow via our fetcher (41 nodes)
console.log('Fetching full workflow...');
const wf = await fetchWorkflow('3121');
console.log(`Workflow: "${wf.name}" - ${wf.nodes.length} nodes`);

// Step 3: Create new workflow and paste nodes via clipboard
console.log('Creating new workflow...');
await page.goto('http://localhost:5678/workflow/new', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// n8n paste format: { nodes: [...], connections: {...} }
const pasteData = JSON.stringify({
  nodes: wf.nodes,
  connections: wf.connections,
});

await page.evaluate(async (json) => {
  await navigator.clipboard.writeText(json);
}, pasteData);

// Click canvas and paste
const canvas = page.locator('.vue-flow').first();
await canvas.click({ position: { x: 500, y: 500 } });
await page.waitForTimeout(300);
await page.keyboard.press('Meta+v');
await page.waitForTimeout(3000);

// Check node count
let nodeCount = await page.evaluate(() => {
  return document.querySelectorAll('.vue-flow__node').length;
});
console.log('Nodes after paste:', nodeCount);

if (nodeCount < 10) {
  // Try Ctrl+V
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(3000);
  nodeCount = await page.evaluate(() => document.querySelectorAll('.vue-flow__node').length);
  console.log('Nodes after Ctrl+V:', nodeCount);
}

// Zoom to fit
await page.keyboard.press('1');
await page.waitForTimeout(2000);

// Canvas size
const canvasSize = await page.evaluate(() => {
  const c = document.querySelector('.vue-flow') as HTMLElement;
  const nodes = document.querySelectorAll('.vue-flow__node');
  return {
    w: c?.offsetWidth,
    h: c?.offsetHeight,
    nodes: nodes.length,
  };
});
console.log('Canvas:', JSON.stringify(canvasSize));

// Hide ALL chrome
await page.addStyleTag({
  content: `
    header, nav, aside, [class*="sidebar"], [class*="header"], [class*="panel"],
    [class*="minimap"], [class*="Minimap"], [class*="chat"], [class*="Chat"],
    [class*="execution"], [class*="run-data"], [data-test-id="canvas-controls"],
    [data-test-id="node-creator-button"], [class*="modal"], [class*="dialog"],
    [class*="overlay"], [class*="toast"], [role="dialog"], [class*="controls"],
    [class*="Controls"], [class*="banner"], [class*="Banner"],
    [class*="trigger-placeholder"] {
      display: none !important;
    }
    .vue-flow {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
    }
  `,
});
await page.waitForTimeout(1000);

// Re-zoom after layout change
await page.keyboard.press('1');
await page.waitForTimeout(2000);

// Screenshot
await page.screenshot({ path: '/tmp/n8n-local-4k.png', type: 'png' });
console.log('4K screenshot saved to /tmp/n8n-local-4k.png');

const imgSize = await page.evaluate(() => ({
  vw: window.innerWidth,
  vh: window.innerHeight,
}));
console.log('Screenshot dimensions:', `${imgSize.vw}x${imgSize.vh}`);

await browser.close();
