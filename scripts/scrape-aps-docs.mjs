/**
 * Universal APS Documentation Scraper
 *
 * Scrapes any Autodesk Platform Services documentation site and saves
 * as structured JSON files organized by sidebar category.
 *
 * Usage:
 *   node scripts/scrape-aps-docs.mjs --url <BASE_URL> --out <FOLDER_NAME>
 *
 * Examples:
 *   node scripts/scrape-aps-docs.mjs --url https://aps.autodesk.com/en/docs/oauth/v2/reference/http/ --out "AUTHENTICATION API"
 *   node scripts/scrape-aps-docs.mjs --url https://aps.autodesk.com/en/docs/design-automation/v3/reference/http/ --out "DESIGN AUTOMATION API"
 *   node scripts/scrape-aps-docs.mjs --url https://aps.autodesk.com/en/docs/bim360/v1/reference/http/ --out "BIM 360 API"
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// ── CLI args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const BASE_URL = getArg('--url');
const OUT_NAME = getArg('--out');

if (!BASE_URL || !OUT_NAME) {
  console.error('Usage: node scrape-aps-docs.mjs --url <URL> --out <FOLDER>');
  process.exit(1);
}

const OUTPUT_DIR = resolve(OUT_NAME);

// ── Derive the doc path prefix to identify related links ──────────
// e.g. from "https://aps.autodesk.com/en/docs/oauth/v2/reference/http/"
//   → "/docs/oauth/v2/"
const urlObj = new URL(BASE_URL);
const pathParts = urlObj.pathname.split('/');
const docsIdx = pathParts.indexOf('docs');
const DOC_PREFIX = pathParts.slice(0, docsIdx + 3).join('/'); // "/en/docs/<api>/<ver>"

// ── Helpers ───────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .substring(0, 120);
}

// ── Classify link into subfolder based on sidebar hierarchy ───────
// This uses the full sidebar context scraped from the page
function classifyLink(text, href, sidebarSections) {
  // Try to match against the extracted sidebar section mappings
  for (const section of sidebarSections) {
    if (section.links.includes(href)) {
      return section.path;
    }
  }

  // Fallback: infer from URL structure
  const h = href.toLowerCase();
  if (h.includes('/reference/http/'))  return 'REST API';
  if (h.includes('/reference/'))       return 'SDK Reference';
  if (h.includes('/developers_guide/') || h.includes('/developer_guide/'))
    return 'Developer Guide';
  if (h.includes('/tutorials/'))       return 'Tutorials';
  return 'Other';
}

// ── Extract page content (works for REST, SDK, and guide pages) ───
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
      tables: [],
      codeExamples: [],
      sections: [],
    };

    // Title
    const h1 = root.querySelector('h1') || document.querySelector('h1');
    result.title = h1 ? h1.textContent.trim() : document.title;

    // Walk through the content and extract sections
    let currentSection = { heading: '', content: [] };
    for (const child of root.children) {
      const tag = child.tagName.toLowerCase();

      if (['h1','h2','h3','h4'].includes(tag)) {
        if (currentSection.heading || currentSection.content.length > 0) {
          result.sections.push({ ...currentSection });
        }
        currentSection = { heading: child.textContent.trim(), content: [] };
      } else if (tag === 'p') {
        currentSection.content.push(child.textContent.trim());
      } else if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(child.querySelectorAll('li')).map(li => li.textContent.trim());
        currentSection.content.push(items);
      }
    }
    if (currentSection.heading || currentSection.content.length > 0) {
      result.sections.push(currentSection);
    }

    // Description — first paragraphs
    const descParts = [];
    for (const child of root.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'table' || tag === 'pre') break;
      if (tag === 'p') descParts.push(child.textContent.trim());
      if (['h2','h3','h4'].includes(tag) && child !== h1) break;
    }
    result.description = descParts.join('\n');

    // HTTP method + endpoint
    const codeEls = root.querySelectorAll('code, pre');
    for (const code of codeEls) {
      const text = code.textContent.trim();
      const methodMatch = text.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/\S+)/i);
      if (methodMatch) {
        result.httpMethod = methodMatch[1].toUpperCase();
        result.endpointUrl = methodMatch[2];
        break;
      }
      const curlMatch = text.match(/curl\s.*?'(https?:\/\/[^']+)'/);
      if (curlMatch && !result.endpointUrl) {
        result.endpointUrl = curlMatch[1];
        const m = text.match(/-X\s+(POST|PUT|PATCH|DELETE)/i);
        result.httpMethod = m ? m[1].toUpperCase() : 'GET';
      }
    }

    // Extract all tables
    const tables = root.querySelectorAll('table');
    tables.forEach(table => {
      const ths = Array.from(table.querySelectorAll('th'));
      const headerNames = ths.map(th => th.textContent.trim());
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

      // Determine table label from preceding heading
      let label = '';
      let el = table.previousElementSibling;
      while (el) {
        if (['h1','h2','h3','h4','h5','h6','p','strong'].includes(el.tagName.toLowerCase())) {
          label = el.textContent.trim();
          break;
        }
        el = el.previousElementSibling;
      }

      if (tableData.length > 0) {
        result.tables.push({ label, headers: headerNames, rows: tableData });
      }
    });

    // Extract code examples
    const preBlocks = root.querySelectorAll('pre');
    preBlocks.forEach(pre => {
      const text = pre.textContent.trim();
      if (!text) return;

      let label = '';
      let el = pre.previousElementSibling;
      while (el) {
        if (['h1','h2','h3','h4','h5','h6','p','strong'].includes(el.tagName.toLowerCase())) {
          label = el.textContent.trim();
          break;
        }
        el = el.previousElementSibling;
      }

      // Try to parse as JSON
      let parsed = null;
      try {
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
          parsed = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
        }
      } catch {}

      result.codeExamples.push({
        label: label || undefined,
        raw: text,
        parsed: parsed || undefined,
      });
    });

    return result;
  });
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log(`🚀 APS Documentation Scraper`);
  console.log(`   URL:    ${BASE_URL}`);
  console.log(`   Output: ${OUTPUT_DIR}\n`);

  ensureDir(OUTPUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  // ── Step 1: Load page and extract full sidebar with hierarchy ───
  console.log('📡 Loading page and extracting sidebar...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  // Extract sidebar hierarchy: sections → subsections → links
  const { allLinks, sidebarSections } = await page.evaluate((docPrefix) => {
    const allLinks = [];
    const sidebarSections = [];
    const seen = new Set();

    // Try to find the sidebar/nav container
    const sidebar = document.querySelector('nav')
      || document.querySelector('[class*="sidebar"]')
      || document.querySelector('[class*="nav"]')
      || document.body;

    // Walk the sidebar tree to build section hierarchy
    // We'll look at all links and infer sections from their structure
    const links = document.querySelectorAll('a');
    let currentTopSection = '';
    let currentSubSection = '';

    links.forEach(a => {
      const href = a.href.split('?')[0].split('#')[0];
      const text = a.textContent.trim().replace(/\s+/g, ' ');

      if (!href || !text || seen.has(href) || text.length < 2 || text.length > 200) return;
      if (!href.includes(docPrefix)) return;

      seen.add(href);

      // Determine the section from the URL path
      const urlPath = new URL(href).pathname;
      const afterPrefix = urlPath.replace(docPrefix, '').replace(/^\//, '');
      const segments = afterPrefix.split('/').filter(Boolean);

      let section = 'Other';
      if (segments[0] === 'reference') {
        if (segments[1] === 'http' && segments.length > 2) {
          // REST API endpoint
          section = 'REST API';
        } else if (segments[1] === 'http') {
          // REST API index
          return;
        } else if (segments.length > 1) {
          // SDK reference
          section = 'SDK Reference/' + segments.slice(1).join('/');
          // Remove the last segment (the actual page) to get the section
          if (segments.length > 2) {
            section = 'SDK Reference/' + segments.slice(1, -1).join('/');
          } else {
            section = 'SDK Reference';
          }
        }
      } else if (segments[0] === 'developers_guide' || segments[0] === 'developer_guide') {
        section = 'Developer Guide';
        if (segments.length > 2) {
          section = 'Developer Guide/' + segments.slice(1, -1).join('/');
        }
      } else if (segments[0] === 'tutorials') {
        section = 'Tutorials';
      }

      allLinks.push({ text, href, section });
    });

    return { allLinks, sidebarSections };
  }, DOC_PREFIX);

  // Filter out the index page itself
  const filteredLinks = allLinks.filter(l => l.href !== BASE_URL);

  console.log(`✅ Found ${filteredLinks.length} pages to scrape\n`);

  // Group by section for display
  const sectionCounts = {};
  filteredLinks.forEach(l => {
    sectionCounts[l.section] = (sectionCounts[l.section] || 0) + 1;
  });
  Object.entries(sectionCounts).forEach(([s, c]) => console.log(`   ${s}: ${c} pages`));
  console.log('');

  // ── Step 2: Scrape each page ────────────────────────────────────
  const index = {};
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < filteredLinks.length; i++) {
    const link = filteredLinks[i];
    const tag = `[${i + 1}/${filteredLinks.length}]`;

    try {
      console.log(`${tag} ${link.text}`);

      await page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);

      const content = await extractPageContent(page);

      const category = link.section;
      const categoryDir = join(OUTPUT_DIR, category);
      ensureDir(categoryDir);

      // Build the JSON
      const json = {
        _meta: {
          source: link.href,
          scrapedAt: new Date().toISOString(),
          category,
          apiName: OUT_NAME,
        },
        title: content.title,
        httpMethod: content.httpMethod || undefined,
        endpointUrl: content.endpointUrl || undefined,
        description: content.description || undefined,
        tables: content.tables.length ? content.tables : undefined,
        codeExamples: content.codeExamples.length ? content.codeExamples : undefined,
        sections: content.sections.length ? content.sections : undefined,
      };

      // Remove undefined keys
      Object.keys(json).forEach(k => { if (json[k] === undefined) delete json[k]; });

      const filename = sanitizeFilename(link.text) + '.json';
      const filepath = join(categoryDir, filename);
      writeFileSync(filepath, JSON.stringify(json, null, 2), 'utf-8');

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

  // ── Step 3: Write index ─────────────────────────────────────────
  const masterIndex = {
    _meta: {
      title: `${OUT_NAME} — Reference Index`,
      source: BASE_URL,
      scrapedAt: new Date().toISOString(),
      totalPages: successCount,
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
