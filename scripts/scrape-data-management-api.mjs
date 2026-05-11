/**
 * Autodesk Data Management API Reference Scraper
 *
 * Extracts all API endpoint docs from:
 * https://aps.autodesk.com/en/docs/data/v2/reference/http/
 *
 * Outputs structured JSON files organized into subfolders that mirror
 * the sidebar navigation:
 *
 *   DATA MANAGEMENT API/
 *   ├── Data Management/
 *   │   ├── Hubs/
 *   │   ├── Projects/
 *   │   ├── Folders/
 *   │   ├── Items/
 *   │   ├── Versions/
 *   │   └── Commands/
 *   └── OSS/
 *       ├── Buckets/
 *       └── Objects/
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const BASE_URL = 'https://aps.autodesk.com/en/docs/data/v2/reference/http/';
const OUTPUT_DIR = resolve('DATA MANAGEMENT API');

// ── Category routing ──────────────────────────────────────────────
// Classifies each endpoint into the correct subfolder based on the
// link text (which mirrors the sidebar: "GET hubs/:hub_id/projects", etc.)
function classifyEndpoint(text, href) {
  const t = text.toLowerCase();

  // ── Data Management / Hubs ──
  // "GET hubs" or "GET hubs/:hub_id"  (but NOT "hubs/:hub_id/projects")
  if (/^(get|post|put|patch|delete)\s+hubs(\/:[^/]+)?$/i.test(text))
    return 'Data Management/Hubs';

  // ── Data Management / Projects ──
  // Anything under hubs that includes /projects (incl. topFolders, hub, etc.)
  if (t.includes('hubs') && t.includes('projects'))
    return 'Data Management/Projects';
  // projects/:project_id/downloads, jobs, storage  (NOT folders/items/versions)
  if (/projects\/.*\/(downloads|jobs|storage)/i.test(text))
    return 'Data Management/Projects';
  if (t.includes('topfolders'))
    return 'Data Management/Projects';

  // ── Data Management / Folders ──
  if (t.includes('folders'))
    return 'Data Management/Folders';

  // ── Data Management / Items ──
  if (t.includes('items'))
    return 'Data Management/Items';

  // ── Data Management / Versions ──
  if (t.includes('versions'))
    return 'Data Management/Versions';

  // ── Data Management / Commands ──
  const commands = ['checkpermission','listrefs','listitems',
                    'publishmodel','publishwithoutlinks','getpublishmodeljob'];
  if (commands.some(c => t === c || t.includes(c)))
    return 'Data Management/Commands';

  // ── OSS / Buckets ──
  if (t.includes('bucket') && !t.includes('object'))
    return 'OSS/Buckets';
  if (/protect\s*bucket/i.test(text))
    return 'OSS/Buckets';

  // ── OSS / Objects ──
  if (t.includes('object') || t.includes('signed') ||
      t.includes('upload') || t.includes('download') ||
      t.includes('copy') || t.includes('bucketkey'))
    return 'OSS/Objects';

  // Fallback — check href for OSS patterns
  const h = href.toLowerCase();
  if (h.includes('buckets') && !h.includes('objects'))
    return 'OSS/Buckets';
  if (h.includes('buckets') || h.includes('signedresources'))
    return 'OSS/Objects';

  return 'Other';
}

// ── Helpers ────────────────────────────────────────────────────────
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .substring(0, 100);
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ── Page content extractor ────────────────────────────────────────
async function extractPageContent(page) {
  return await page.evaluate(() => {
    const main = document.querySelector('.content-body')
      || document.querySelector('[class*="content"]')
      || document.querySelector('main')
      || document.querySelector('article')
      || document.querySelector('#content');

    const root = main || document.body;

    const result = {
      title: '',
      httpMethod: '',
      endpointUrl: '',
      description: '',
      scopes: [],
      headers: [],
      pathParameters: [],
      queryParameters: [],
      bodyParameters: [],
      requestExample: '',
      responseExample: '',
      responseCodes: [],
    };

    // Title
    const h1 = root.querySelector('h1') || document.querySelector('h1');
    result.title = h1 ? h1.textContent.trim() : document.title;

    // Description – grab paragraphs before the first table / code block
    const descParts = [];
    const children = root.children;
    for (const child of children) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'table' || tag === 'pre' || tag === 'code') break;
      if (tag === 'p') descParts.push(child.textContent.trim());
      // Stop after a heading that isn't the title
      if ((tag === 'h2' || tag === 'h3' || tag === 'h4') && child !== h1) break;
    }
    result.description = descParts.join('\n');

    // Detect HTTP method + endpoint URL from code/pre blocks
    const codeEls = root.querySelectorAll('code, pre');
    for (const code of codeEls) {
      const text = code.textContent.trim();
      // Match "GET https://..." or "POST https://..."
      const methodMatch = text.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/\S+)/i);
      if (methodMatch) {
        result.httpMethod = methodMatch[1].toUpperCase();
        result.endpointUrl = methodMatch[2];
        break;
      }
      // Match curl command
      const curlMatch = text.match(/curl\s.*?'(https?:\/\/[^']+)'/);
      if (curlMatch && !result.endpointUrl) {
        result.endpointUrl = curlMatch[1];
        // Infer method from curl flags
        if (text.includes('-X POST') || text.includes('-X PUT') || text.includes('-X PATCH') || text.includes('-X DELETE')) {
          const m = text.match(/-X\s+(POST|PUT|PATCH|DELETE)/i);
          result.httpMethod = m ? m[1].toUpperCase() : 'GET';
        } else {
          result.httpMethod = 'GET';
        }
      }
      // Match path like /project/v1/hubs or /oss/v2/buckets
      const pathMatch = text.match(/(\/(?:project|data|oss)\/v[12]\/\S+)/);
      if (pathMatch && !result.endpointUrl) {
        result.endpointUrl = pathMatch[1];
      }
    }

    // Extract all tables
    const tables = root.querySelectorAll('table');
    tables.forEach(table => {
      const ths = Array.from(table.querySelectorAll('th'));
      const headerNames = ths.map(th => th.textContent.trim().toLowerCase());
      const rows = Array.from(table.querySelectorAll('tbody tr'));

      const tableData = rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const obj = {};
        cells.forEach((cell, i) => {
          const key = headerNames[i] || `col_${i}`;
          obj[key] = cell.textContent.trim();
        });
        return obj;
      });

      if (tableData.length === 0) return;

      // Classify by preceding heading or header content
      let sectionLabel = '';
      let el = table.previousElementSibling;
      while (el) {
        const tag = el.tagName.toLowerCase();
        if (['h1','h2','h3','h4','h5','h6','p','strong'].includes(tag)) {
          sectionLabel = el.textContent.trim().toLowerCase();
          break;
        }
        el = el.previousElementSibling;
      }
      const hdr = headerNames.join(' ');

      if (sectionLabel.includes('scope') || hdr.includes('scope')) {
        result.scopes = tableData;
      } else if (sectionLabel.includes('header') || hdr.includes('header')) {
        result.headers = tableData;
      } else if (hdr.includes('status') || hdr.includes('http code') || hdr.includes('code')) {
        result.responseCodes = tableData;
      } else if (sectionLabel.includes('path') || sectionLabel.includes('uri')) {
        result.pathParameters = tableData;
      } else if (sectionLabel.includes('query') || sectionLabel.includes('string')) {
        result.queryParameters = tableData;
      } else if (sectionLabel.includes('body') || sectionLabel.includes('request body') || sectionLabel.includes('payload')) {
        result.bodyParameters = tableData;
      } else {
        // Heuristic: if it has "name" and "description" columns, it's likely params
        if (hdr.includes('name') || hdr.includes('parameter')) {
          if (result.pathParameters.length === 0) {
            result.pathParameters = tableData;
          } else if (result.queryParameters.length === 0) {
            result.queryParameters = tableData;
          } else {
            result.bodyParameters = tableData;
          }
        } else {
          result.responseCodes = result.responseCodes.concat(tableData);
        }
      }
    });

    // Extract code examples
    const preBlocks = root.querySelectorAll('pre');
    preBlocks.forEach(pre => {
      const text = pre.textContent.trim();
      if (!text) return;

      let prevLabel = '';
      let el = pre.previousElementSibling;
      while (el) {
        const tag = el.tagName.toLowerCase();
        if (['h1','h2','h3','h4','h5','h6','p','strong'].includes(tag)) {
          prevLabel = el.textContent.toLowerCase();
          break;
        }
        el = el.previousElementSibling;
      }

      if (prevLabel.includes('request') || prevLabel.includes('curl') || text.includes('curl ')) {
        result.requestExample += (result.requestExample ? '\n\n' : '') + text;
      } else if (prevLabel.includes('response') || text.startsWith('{') || text.startsWith('[')) {
        result.responseExample += (result.responseExample ? '\n\n' : '') + text;
      } else if (text.startsWith('{') || text.startsWith('[')) {
        result.responseExample += (result.responseExample ? '\n\n' : '') + text;
      } else {
        result.requestExample += (result.requestExample ? '\n\n' : '') + text;
      }
    });

    // Try to parse the response example as JSON for cleanliness
    if (result.responseExample) {
      try {
        // Find the first JSON block in the response
        const jsonStart = result.responseExample.indexOf('{');
        const jsonEnd = result.responseExample.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonStr = result.responseExample.substring(jsonStart, jsonEnd + 1);
          result.responseExampleParsed = JSON.parse(jsonStr);
        }
      } catch { /* keep as string */ }
    }

    return result;
  });
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Autodesk Data Management API → JSON scraper');
  console.log(`📂 Output: ${OUTPUT_DIR}\n`);

  ensureDir(OUTPUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  // ── Step 1: Collect sidebar links ───────────────────────────────
  console.log('📡 Loading index page...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  const endpointLinks = await page.evaluate(() => {
    const allLinks = document.querySelectorAll('a[href*="/reference/http/"]');
    const results = [];
    const seen = new Set();
    allLinks.forEach(a => {
      const href = a.href.split('?')[0].split('#')[0];
      const text = a.textContent.trim().replace(/\s+/g, ' ');
      if (href && text && !seen.has(href) &&
          href !== window.location.href.split('?')[0].split('#')[0] &&
          text.length > 1) {
        seen.add(href);
        results.push({ text, href });
      }
    });
    return results;
  });

  console.log(`✅ Found ${endpointLinks.length} endpoints\n`);

  // ── Step 2: Scrape each endpoint and write JSON ─────────────────
  // Bucket to accumulate an index grouped by category
  const index = {};
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < endpointLinks.length; i++) {
    const link = endpointLinks[i];
    const tag = `[${i + 1}/${endpointLinks.length}]`;

    try {
      console.log(`${tag} ${link.text}`);

      await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(4000);

      const content = await extractPageContent(page);

      // Classify into folder
      const category = classifyEndpoint(link.text, link.href);
      const categoryDir = join(OUTPUT_DIR, category);
      ensureDir(categoryDir);

      // Build the JSON payload
      const json = {
        _meta: {
          source: link.href,
          scrapedAt: new Date().toISOString(),
          category,
        },
        title: content.title,
        httpMethod: content.httpMethod || null,
        endpointUrl: content.endpointUrl || null,
        description: content.description || null,
        scopes: content.scopes.length ? content.scopes : undefined,
        headers: content.headers.length ? content.headers : undefined,
        pathParameters: content.pathParameters.length ? content.pathParameters : undefined,
        queryParameters: content.queryParameters.length ? content.queryParameters : undefined,
        bodyParameters: content.bodyParameters.length ? content.bodyParameters : undefined,
        requestExample: content.requestExample || undefined,
        responseExample: content.responseExampleParsed || content.responseExample || undefined,
        responseCodes: content.responseCodes.length ? content.responseCodes : undefined,
      };

      // Remove undefined keys for cleanliness
      Object.keys(json).forEach(k => {
        if (json[k] === undefined) delete json[k];
      });

      const filename = sanitizeFilename(link.text) + '.json';
      const filepath = join(categoryDir, filename);
      writeFileSync(filepath, JSON.stringify(json, null, 2), 'utf-8');

      // Track in index
      if (!index[category]) index[category] = [];
      index[category].push({
        name: link.text,
        file: `${category}/${filename}`,
        method: content.httpMethod || null,
        url: content.endpointUrl || null,
      });

      console.log(`   ✅ → ${category}/${filename}`);
      successCount++;

    } catch (err) {
      console.error(`   ❌ ${err.message}`);
      errorCount++;
    }
  }

  // ── Step 3: Write master index ──────────────────────────────────
  const masterIndex = {
    _meta: {
      title: 'Autodesk Data Management API v2 — Reference Index',
      source: BASE_URL,
      scrapedAt: new Date().toISOString(),
      totalEndpoints: successCount,
    },
    categories: index,
  };
  writeFileSync(
    join(OUTPUT_DIR, '_index.json'),
    JSON.stringify(masterIndex, null, 2),
    'utf-8'
  );

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`📊 Done!  ${successCount} ✅ / ${errorCount} ❌`);
  console.log(`📂 ${OUTPUT_DIR}`);
  Object.entries(index).forEach(([cat, items]) => {
    console.log(`   ${cat}/ → ${items.length} files`);
  });
  console.log(`${'═'.repeat(55)}`);

  await browser.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
