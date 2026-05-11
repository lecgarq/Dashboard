/**
 * Autodesk Data Management API — SDK Reference Scraper
 *
 * Scrapes all .NET and TypeScript SDK reference pages and saves
 * them as structured JSON files in:
 *
 *   DATA MANAGEMENT API/
 *   ├── .NET SDK (OSS)/
 *   │   ├── Autodesk.Oss/
 *   │   └── Autodesk.Oss.Model/
 *   ├── .NET SDK (Data Management)/
 *   │   ├── Autodesk.DataManagement/
 *   │   └── Autodesk.DataManagement.Model/
 *   ├── TypeScript SDK (OSS)/
 *   │   ├── Classes/
 *   │   ├── Enumerations/
 *   │   └── Interfaces/
 *   └── TypeScript SDK (Data Management)/
 *       ├── Classes/
 *       ├── Enumerations/
 *       ├── Interfaces/
 *       └── Type-aliases/
 */

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const BASE_URL = 'https://aps.autodesk.com/en/docs/data/v2/reference/http/';
const OUTPUT_DIR = resolve('DATA MANAGEMENT API');

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .substring(0, 100);
}

// ── Classify SDK link into folder path ────────────────────────────
function classifySDKLink(text, href) {
  const h = href.toLowerCase();

  // .NET SDK (OSS)
  if (h.includes('dot-net-sdk-oss')) {
    if (h.includes('/autodesk.oss.model/') || h.endsWith('/autodesk.oss.model'))
      return '.NET SDK (OSS)/Autodesk.Oss.Model';
    if (h.includes('/autodesk.oss/') || h.endsWith('/autodesk.oss'))
      return '.NET SDK (OSS)/Autodesk.Oss';
    return '.NET SDK (OSS)';
  }

  // .NET SDK (Data Management)
  if (h.includes('dot-net-sdk-dm')) {
    if (h.includes('/autodesk.datamanagement.model/') || h.endsWith('/autodesk.datamanagement.model'))
      return '.NET SDK (Data Management)/Autodesk.DataManagement.Model';
    if (h.includes('/autodesk.datamanagement/') || h.endsWith('/autodesk.datamanagement'))
      return '.NET SDK (Data Management)/Autodesk.DataManagement';
    return '.NET SDK (Data Management)';
  }

  // TypeScript SDK (OSS)
  if (h.includes('typescript-sdk-oss')) {
    if (h.includes('/classes/') || h.endsWith('/classes'))
      return 'TypeScript SDK (OSS)/Classes';
    if (h.includes('/enumerations/') || h.endsWith('/enumerations'))
      return 'TypeScript SDK (OSS)/Enumerations';
    if (h.includes('/interfaces/') || h.endsWith('/interfaces'))
      return 'TypeScript SDK (OSS)/Interfaces';
    return 'TypeScript SDK (OSS)';
  }

  // TypeScript SDK (Data Management)
  if (h.includes('typescript-sdk-dm')) {
    if (h.includes('/classes/') || h.endsWith('/classes'))
      return 'TypeScript SDK (Data Management)/Classes';
    if (h.includes('/enumerations/') || h.endsWith('/enumerations'))
      return 'TypeScript SDK (Data Management)/Enumerations';
    if (h.includes('/interfaces/') || h.endsWith('/interfaces'))
      return 'TypeScript SDK (Data Management)/Interfaces';
    if (h.includes('/type-aliases/') || h.endsWith('/type-aliases'))
      return 'TypeScript SDK (Data Management)/Type-aliases';
    return 'TypeScript SDK (Data Management)';
  }

  return 'SDK/Other';
}

// ── Extract SDK page content ──────────────────────────────────────
async function extractSDKContent(page) {
  return await page.evaluate(() => {
    const main = document.querySelector('.content-body')
      || document.querySelector('[class*="content"]')
      || document.querySelector('main')
      || document.querySelector('article')
      || document.querySelector('#content');

    const root = main || document.body;

    const result = {
      title: '',
      kind: '',          // Class, Interface, Enum, Namespace, Type-alias
      namespace: '',
      description: '',
      constructors: [],
      properties: [],
      methods: [],
      members: [],       // for enums
      codeExamples: [],
      fullText: '',
    };

    // Title
    const h1 = root.querySelector('h1') || document.querySelector('h1');
    result.title = h1 ? h1.textContent.trim() : document.title;

    // Detect kind from title or page content
    const titleLower = result.title.toLowerCase();
    if (titleLower.includes('class')) result.kind = 'Class';
    else if (titleLower.includes('interface')) result.kind = 'Interface';
    else if (titleLower.includes('enum')) result.kind = 'Enum';
    else if (titleLower.includes('namespace')) result.kind = 'Namespace';
    else if (titleLower.includes('type alias')) result.kind = 'TypeAlias';

    // Extract tables (properties, methods, constructors, enum members)
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

      // Classify based on preceding heading
      let sectionLabel = '';
      let el = table.previousElementSibling;
      while (el) {
        const tag = el.tagName.toLowerCase();
        if (['h1','h2','h3','h4','h5','h6'].includes(tag)) {
          sectionLabel = el.textContent.trim().toLowerCase();
          break;
        }
        el = el.previousElementSibling;
      }

      if (sectionLabel.includes('constructor')) {
        result.constructors = tableData;
      } else if (sectionLabel.includes('method') || sectionLabel.includes('function')) {
        result.methods = tableData;
      } else if (sectionLabel.includes('member') || sectionLabel.includes('value') || sectionLabel.includes('enumeration')) {
        result.members = tableData;
      } else if (sectionLabel.includes('propert') || sectionLabel.includes('field') || sectionLabel.includes('attribute')) {
        result.properties = tableData;
      } else {
        // Default: add to properties
        result.properties = result.properties.concat(tableData);
      }
    });

    // Extract code examples
    const preBlocks = root.querySelectorAll('pre');
    preBlocks.forEach(pre => {
      const text = pre.textContent.trim();
      if (text) result.codeExamples.push(text);
    });

    // Description — first paragraphs before any table/heading
    const descParts = [];
    for (const child of root.children) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'table' || tag === 'pre') break;
      if (tag === 'p') descParts.push(child.textContent.trim());
      if (['h2','h3','h4'].includes(tag) && child !== h1) break;
    }
    result.description = descParts.join('\n');

    // Full text (abbreviated for SDKs — just the main content, not sidebar)
    result.fullText = root.innerText.substring(0, 3000);

    return result;
  });
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Autodesk SDK Reference → JSON scraper');
  console.log(`📂 Output: ${OUTPUT_DIR}\n`);

  ensureDir(OUTPUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  // ── Step 1: Collect ALL SDK links from sidebar ──────────────────
  console.log('📡 Loading index page...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);

  const sdkLinks = await page.evaluate(() => {
    const allLinks = document.querySelectorAll('a');
    const results = [];
    const seen = new Set();

    allLinks.forEach(a => {
      const href = a.href.split('?')[0].split('#')[0];
      const text = a.textContent.trim().replace(/\s+/g, ' ');

      if (href && text && !seen.has(href) && text.length > 1 && text.length < 200) {
        if (href.includes('/docs/data/v2/reference/') && !href.includes('/reference/http/') && !href.includes('/reference/http')) {
          seen.add(href);
          results.push({ text, href });
        }
      }
    });

    return results;
  });

  // Filter out category index pages (like "Classes", "Enumerations", "Interfaces", "Type-aliases")
  // that are just navigation pages, not actual content
  const categoryPages = new Set(['classes', 'enumerations', 'interfaces', 'type-aliases']);
  const filteredLinks = sdkLinks.filter(link => {
    const lastSegment = link.href.split('/').pop().toLowerCase();
    return !categoryPages.has(lastSegment);
  });

  console.log(`✅ Found ${filteredLinks.length} SDK reference pages to scrape\n`);

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

      const content = await extractSDKContent(page);
      const category = classifySDKLink(link.text, link.href);
      const categoryDir = join(OUTPUT_DIR, category);
      ensureDir(categoryDir);

      // Build JSON
      const json = {
        _meta: {
          source: link.href,
          scrapedAt: new Date().toISOString(),
          category,
          sdkType: link.href.includes('typescript') ? 'TypeScript' : '.NET',
        },
        title: content.title,
        kind: content.kind || undefined,
        namespace: content.namespace || undefined,
        description: content.description || undefined,
        constructors: content.constructors.length ? content.constructors : undefined,
        properties: content.properties.length ? content.properties : undefined,
        methods: content.methods.length ? content.methods : undefined,
        members: content.members.length ? content.members : undefined,
        codeExamples: content.codeExamples.length ? content.codeExamples : undefined,
        fullText: content.fullText || undefined,
      };

      // Clean undefined
      Object.keys(json).forEach(k => { if (json[k] === undefined) delete json[k]; });

      const filename = sanitizeFilename(link.text) + '.json';
      const filepath = join(categoryDir, filename);
      writeFileSync(filepath, JSON.stringify(json, null, 2), 'utf-8');

      // Track index
      if (!index[category]) index[category] = [];
      index[category].push({ name: link.text, file: `${category}/${filename}` });

      console.log(`   ✅ → ${category}/${filename}`);
      successCount++;

    } catch (err) {
      console.error(`   ❌ ${err.message}`);
      errorCount++;
    }
  }

  // ── Step 3: Write SDK index ─────────────────────────────────────
  const sdkIndex = {
    _meta: {
      title: 'Autodesk Data Management API — SDK Reference Index',
      scrapedAt: new Date().toISOString(),
      totalPages: successCount,
    },
    categories: index,
  };
  writeFileSync(
    join(OUTPUT_DIR, '_sdk_index.json'),
    JSON.stringify(sdkIndex, null, 2),
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
