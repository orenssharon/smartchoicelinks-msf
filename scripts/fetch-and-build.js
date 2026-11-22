const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SOURCES_FILE = path.join(ROOT_DIR, 'data', 'sources.json');
const DISCOVERED_FILE = path.join(ROOT_DIR, 'data', 'discovered-characters.json');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PUBLIC_CHARS_DIR = path.join(PUBLIC_DIR, 'characters');
const SITEMAP_FILE = path.join(PUBLIC_DIR, 'sitemap.xml');

const SITE_BASE_URL = 'https://www.smartchoicelinks.com';
const HUB_PAGE_PATH = '/marvel-strike-force-character-guides-shard-calculators/';

function ch(code) {
  return String.fromCharCode(code);
}

function q() {
  return ch(34);
}

function sq() {
  return ch(39);
}

function lt() {
  return ch(60);
}

function gt() {
  return ch(62);
}

function amp() {
  return ch(38);
}

function replaceCode(inputStr, targetCode, replacement) {
  const s = String(inputStr === undefined || inputStr === null ? '' : inputStr);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) === targetCode) {
      out += replacement;
    } else {
      out += s[i];
    }
  }
  return out;
}

function escapeHtml(val) {
  let out = replaceCode(val, 38, amp() + 'amp;');
  out = replaceCode(out, 60, amp() + 'lt;');
  out = replaceCode(out, 62, amp() + 'gt;');
  out = replaceCode(out, 34, amp() + 'quot;');
  out = replaceCode(out, 39, amp() + '#39;');
  return out;
}

function slugify(text) {
  const raw = String(text || 'placeholder-character').toLowerCase();
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
    out += ok ? c : '-';
  }
  while (out.indexOf('--') !== -1) {
    out = out.split('--').join('-');
  }
  if (out.charAt(0) === '-') out = out.slice(1);
  if (out.charAt(out.length - 1) === '-') out = out.slice(0, -1);
  return out || 'placeholder-character';
}

function stripTags(htmlChunk) {
  let out = '';
  let insideTag = false;
  for (let i = 0; i < htmlChunk.length; i++) {
    const c = htmlChunk[i];
    if (c === '<') {
      insideTag = true;
      out += ' ';
    } else if (c === '>') {
      insideTag = false;
    } else if (!insideTag) {
      out += c;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

function isRelevantCandidateText(text) {
  const lower = String(text || '').toLowerCase();
  if (lower.length < 4 || lower.length > 140) return false;
  return (
    lower.indexOf('character') !== -1 ||
    lower.indexOf('unlock') !== -1 ||
    lower.indexOf('shards') !== -1 ||
    lower.indexOf('update') !== -1 ||
    lower.indexOf('release') !== -1 ||
    lower.indexOf('event') !== -1 ||
    lower.indexOf('war') !== -1 ||
    lower.indexOf('dimension') !== -1 ||
    lower.indexOf('sauron') !== -1 ||
    lower.indexOf('recruit') !== -1 ||
    lower.indexOf('milestone') !== -1
  );
}

function isLikelyCharacterCandidate(title) {
  const clean = String(title || '').trim();
  const lower = clean.toLowerCase();
  if (clean.length < 3 || clean.length > 65) return false;

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;

  const genericTitles = [
    'characters',
    'character',
    'game characters',
    'all characters',
    'list of characters',
    'character list',
    'roster',
    'unlock characters',
    'new characters',
    'upcoming characters'
  ];

  for (let g = 0; g < genericTitles.length; g++) {
    if (lower === genericTitles[g]) return false;
  }

  const noisePhrases = [
    'how do i',
    'anyone else',
    'what is the best',
    'unpopular opinion',
    'psa:',
    'bug',
    'maintenance',
    'compensation',
    'complaint',
    'rant',
    'help with',
    'tier list',
    'promo code',
    'codes'
  ];

  for (let i = 0; i < noisePhrases.length; i++) {
    if (lower.indexOf(noisePhrases[i]) !== -1) return false;
  }

  return true;
}

function extractLinksAndTitles(htmlText, baseUrl) {
  const items = [];
  const seenTitles = {};

  function pushUnique(title, url) {
    const clean = String(title || '').replace(/\s+/g, ' ').trim();
    if (!isRelevantCandidateText(clean)) return;
    const key = clean.toLowerCase();
    if (seenTitles[key]) return;
    seenTitles[key] = true;
    items.push({ title: clean, url: url || '' });
  }

  const anchorRegex = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  let count = 0;
  while ((match = anchorRegex.exec(htmlText)) !== null && count < 40) {
    const fullTag = match[0];
    const text = stripTags(match[1]);
    const hrefMatch = /href\s*=\s*["']([^"']+)["']/i.exec(fullTag);
    let href = hrefMatch ? hrefMatch[1] : '';
    if (href && href.indexOf('/') === 0) {
      try {
        href = new URL(href, baseUrl).toString();
      } catch (e) {
        // keep relative href if URL parsing fails
      }
    }
    const prevLen = items.length;
    pushUnique(text, href);
    if (items.length > prevLen) count++;
  }

  const headingRegex = /<(h1|h2|h3|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let hMatch;
  let hCount = 0;
  while ((hMatch = headingRegex.exec(htmlText)) !== null && hCount < 25) {
    const hText = stripTags(hMatch[2]);
    const prevLen = items.length;
    pushUnique(hText, baseUrl);
    if (items.length > prevLen) hCount++;
  }

  return items;
}

function parseRedditJson(jsonObj) {
  const posts = [];
  const children = jsonObj && jsonObj.data && Array.isArray(jsonObj.data.children)
    ? jsonObj.data.children
    : [];
  for (let i = 0; i < children.length; i++) {
    const d = children[i] && children[i].data ? children[i].data : null;
    if (!d || !d.title) continue;
    posts.push({
      title: String(d.title).trim(),
      url: d.permalink ? 'https://www.reddit.com' + d.permalink : '',
      flair: d.link_flair_text ? String(d.link_flair_text) : '',
      createdUtc: d.created_utc || null
    });
  }
  return posts;
}

async function querySingleEndpoint(ep) {
  if (!ep || !ep.url || ep.url.indexOf('https://') !== 0) {
    return { name: ep && ep.name ? ep.name : 'PLACEHOLDER: Endpoint', status: 'skipped-invalid-url', items: [] };
  }

  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, 12000);

  try {
    const res = await fetch(ep.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SmartChoiceLinks-MSF-Bot/1.0 (+https://smartchoicelinks.com)'
      }
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { name: ep.name || ep.url, url: ep.url, status: 'http-' + res.status, items: [] };
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.indexOf('json') !== -1 || ep.type === 'reddit-json' || ep.type === 'json') {
      const jsonData = await res.json();
      const parsedPosts = ep.type === 'reddit-json' ? parseRedditJson(jsonData) : [];
      return {
        name: ep.name || ep.url,
        url: ep.url,
        status: 'ok-json',
        postsCount: parsedPosts.length,
        items: parsedPosts.slice(0, 15)
      };
    }

    const htmlText = await res.text();
    const extracted = extractLinksAndTitles(htmlText, ep.url);
    return {
      name: ep.name || ep.url,
      url: ep.url,
      status: 'ok-html',
      itemsCount: extracted.length,
      items: extracted.slice(0, 20)
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      name: ep.name || ep.url,
      url: ep.url,
      status: 'error: ' + (err && err.message ? err.message : 'fetch failed'),
      items: []
    };
  }
}

async function queryExternalEndpoints(endpoints) {
  const results = [];
  if (!Array.isArray(endpoints)) return results;

  for (let i = 0; i < endpoints.length; i++) {
    const res = await querySingleEndpoint(endpoints[i]);
    results.push(res);
  }
  return results;
}

function collectDiscoveredCandidates(externalResults, existingCharacters, updatedAtIso) {
  const knownSlugs = {};
  const knownNames = {};

  for (let i = 0; i < existingCharacters.length; i++) {
    const c = existingCharacters[i];
    if (c && c.name) knownNames[String(c.name).toLowerCase().trim()] = true;
    if (c && c.slug) knownSlugs[slugify(c.slug)] = true;
    if (c && c.name) knownSlugs[slugify(c.name)] = true;
  }

  const discovered = [];
  const seenDiscovered = {};

  for (let i = 0; i < externalResults.length; i++) {
    const src = externalResults[i];
    if (!src || !Array.isArray(src.items)) continue;
    for (let j = 0; j < src.items.length; j++) {
      const item = src.items[j];
      const title = item && item.title ? String(item.title).trim() : '';
      if (!title) continue;
      if (!isLikelyCharacterCandidate(title)) continue;
      const lowerTitle = title.toLowerCase();
      const candSlug = slugify(title);
      if (knownNames[lowerTitle] || knownSlugs[candSlug] || seenDiscovered[candSlug]) continue;

      seenDiscovered[candSlug] = true;
      discovered.push({
        candidateTitle: title,
        slug: candSlug,
        sourceName: src.name || 'PLACEHOLDER: Source',
        sourceUrl: src.url || '',
        itemUrl: item.url || '',
        shardsRequiredPlaceholder: 'PLACEHOLDER: Unlock Shards',
        discoveredAt: updatedAtIso
      });
    }
  }

  return discovered;
}

function tag(tagName, attrs, innerHtml) {
  return lt() + tagName + (attrs ? ' ' + attrs : '') + gt() + innerHtml + lt() + '/' + tagName + gt();
}

function selfTag(tagName, attrs) {
  return lt() + tagName + (attrs ? ' ' + attrs : '') + ' /' + gt();
}

function buildSitemapXml(manifest, updatedAtIso) {
  const Q = q();
  const baseHubUrl = SITE_BASE_URL + HUB_PAGE_PATH;
  const entries = [
    {
      loc: baseHubUrl,
      lastmod: updatedAtIso,
      changefreq: 'daily',
      priority: '0.9'
    }
  ];

  for (let i = 0; i < manifest.length; i++) {
    const item = manifest[i];
    if (!item || !item.slug) continue;
    entries.push({
      loc: baseHubUrl + '?char=' + encodeURIComponent(item.slug),
      lastmod: item.updatedAt || updatedAtIso,
      changefreq: 'daily',
      priority: '0.8'
    });
  }

  const urlBlocks = entries
    .map(function (entry) {
      return (
        '  ' +
        tag(
          'url',
          '',
          '\n    ' +
            tag('loc', '', escapeHtml(entry.loc)) +
            '\n    ' +
            tag('lastmod', '', escapeHtml(entry.lastmod)) +
            '\n    ' +
            tag('changefreq', '', escapeHtml(entry.changefreq)) +
            '\n    ' +
            tag('priority', '', escapeHtml(entry.priority)) +
            '\n  '
        )
      );
    })
    .join('\n');

  const xmlHeader = lt() + '?xml version=' + Q + '1.0' + Q + ' encoding=' + Q + 'UTF-8' + Q + '?' + gt();
  const urlsetOpen = lt() + 'urlset xmlns=' + Q + 'http://www.sitemaps.org/schemas/sitemap/0.9' + Q + gt();
  const urlsetClose = lt() + '/urlset' + gt();

  return xmlHeader + '\n' + urlsetOpen + '\n' + urlBlocks + '\n' + urlsetClose + '\n';
}

function printBuildSummary(externalResults, manifest, discoveredCandidates, updatedAtIso) {
  console.log('====================================================');
  console.log('MSF BUILD SUMMARY (UTC): ' + updatedAtIso);
  console.log('====================================================');
  console.log('External Sources Checked: ' + externalResults.length);

  if (externalResults.length === 0) {
    console.log('  - No external endpoints configured in data/sources.json');
  } else {
    for (let i = 0; i < externalResults.length; i++) {
      const src = externalResults[i];
      const count =
        typeof src.postsCount === 'number'
          ? src.postsCount
          : typeof src.itemsCount === 'number'
          ? src.itemsCount
          : Array.isArray(src.items)
          ? src.items.length
          : 0;

      console.log('  [' + (i + 1) + '] ' + src.name);
      console.log('      Status: ' + src.status + ' | Extracted Items: ' + count);

      if (Array.isArray(src.items) && src.items.length > 0) {
        const previewLimit = Math.min(2, src.items.length);
        for (let j = 0; j < previewLimit; j++) {
          console.log('      Sample ' + (j + 1) + ': ' + src.items[j].title);
        }
      }
    }
  }

  console.log('----------------------------------------------------');
  console.log('New Discovered Candidates: ' + discoveredCandidates.length);
  for (let d = 0; d < Math.min(10, discoveredCandidates.length); d++) {
    console.log('  + ' + discoveredCandidates[d].candidateTitle + ' (' + discoveredCandidates[d].sourceName + ')');
  }

  console.log('----------------------------------------------------');
  console.log('Hub Page Built: public/characters/index.html');
  console.log('Sitemap Built: public/sitemap.xml (' + (manifest.length + 1) + ' URLs)');
  console.log('Character Pages Built: ' + manifest.length);
  for (let k = 0; k < manifest.length; k++) {
    console.log('  - ' + manifest[k].name + ' -> ' + manifest[k].htmlPath);
  }
  console.log('====================================================');
}

function getSharedCss() {
  return (
    '.msf-wrap { font-family: system-ui, -apple-system, sans-serif; max-width: 900px; width: 100%; margin: 0 auto; padding: 20px; color: #111827; line-height: 1.6; direction: ltr; text-align: left; float: none; box-sizing: border-box; }\n' +
    '.msf-wrap *, .msf-wrap *::before, .msf-wrap *::after { box-sizing: border-box; }\n' +
    '.msf-site-title { font-weight: 700; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.04em; color: #4b5563; margin: 0 0 6px 0; }\n' +
    '.msf-meta { margin: 0 0 14px 0; color: #6b7280; }\n' +
    '.msf-placeholder { display: inline-block; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600; }\n' +
    '.msf-badge { display: inline-block; background: #e0e7ff; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; font-weight: 600; }\n' +
    '.msf-box, .msf-card, .msf-verdict { border: 1px solid #d1d5db; border-radius: 10px; padding: 16px; margin: 16px 0; background: #f9fafb; }\n' +
    '.msf-field { display: grid; gap: 6px; margin-bottom: 12px; }\n' +
    '.msf-field input, .msf-search-input { width: 100%; padding: 10px 12px; border: 1px solid #9ca3af; border-radius: 8px; font-size: 1rem; background: #ffffff; color: #111827; }\n' +
    '.msf-field input { max-width: 260px; }\n' +
    '.msf-results { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 12px; }\n' +
    '.msf-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; margin-top: 14px; }\n' +
    '.msf-stat { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }\n' +
    '.msf-faq { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 14px; margin: 8px 0; }\n' +
    '.msf-btn { display: inline-block; margin-top: 10px; padding: 8px 14px; background: #1d4ed8; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 0.92rem; }\n' +
    '.msf-links { display: flex; flex-wrap: wrap; gap: 10px; list-style: none; padding: 0; margin: 12px 0 0 0; }\n' +
    '.msf-links a { display: inline-block; padding: 8px 12px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; color: #1f2937; text-decoration: none; font-weight: 500; font-size: 0.92rem; }\n' +
    '.msf-empty { display: none; padding: 14px; border: 1px dashed #9ca3af; border-radius: 8px; color: #4b5563; background: #ffffff; }'
  );
}

function getToolsNavHtml(includeHubBackLink) {
  const Q = q();
  const A = amp();
  const items = [
    ['/5-essential-msf-calculators/', '5 Essential MSF Calculators'],
    ['/codes/', 'MSF Promo Codes'],
    ['/g21-calculator/', 'G21 Calculator'],
    ['/gold-calculator/', 'Gold Calculator'],
    ['/turn-1-calculator/', 'Turn-1 Calculator'],
    ['/meta-hub/', 'Meta Hub']
  ];
  if (includeHubBackLink) {
    items.unshift(['./', 'All Character Guides']);
  }

  const navItems = items
    .map(function (pair) {
      return tag('li', '', tag('a', 'href=' + Q + pair[0] + Q, pair[1]));
    })
    .join('\n');

  return tag(
    'nav',
    'aria-label=' + Q + 'MSF Tools' + Q,
    tag('h2', '', 'Marvel Strike Force Tools ' + A + 'amp; Hub') +
    tag('ul', 'class=' + Q + 'msf-links' + Q, navItems)
  );
}

function renderHubHtml(characters, discoveredCandidates, updatedAtIso) {
  const Q = q();
  const SQ = sq();
  const A = amp();
  const title = 'Marvel Strike Force Character Guides ' + A + 'amp; Shard Calculators Hub';

  const charCardsHtml =
    characters.length > 0
      ? characters
          .map(function (c) {
            const name = escapeHtml(c.name || 'PLACEHOLDER: Character Name');
            const slug = slugify(c.slug || c.name);
            const hasReq = typeof c.shardsRequired === 'number' && Number.isFinite(c.shardsRequired);
            const reqHtml = hasReq
              ? tag('span', 'class=' + Q + 'msf-badge' + Q, c.shardsRequired + ' Shards to Unlock')
              : tag('span', 'class=' + Q + 'msf-placeholder' + Q, 'PLACEHOLDER: Unlock Shards');

            const teamNames = Array.isArray(c.bestTeams)
              ? c.bestTeams
                  .map(function (t) {
                    return t && t.teamName ? String(t.teamName) : '';
                  })
                  .filter(Boolean)
                  .join(', ')
              : '';
            const teamsText = escapeHtml(teamNames || 'PLACEHOLDER: Teams');
            const verdictText = escapeHtml(
              c.recommendation && c.recommendation.verdict
                ? c.recommendation.verdict
                : 'PLACEHOLDER: Recruit Now or Wait'
            );

            const searchBlob = escapeHtml(
              (c.name || '') + ' ' + teamNames + ' ' + (c.recommendation && c.recommendation.verdict ? c.recommendation.verdict : '')
            ).toLowerCase();

            return tag(
              'article',
              'class=' + Q + 'msf-card msf-hub-item' + Q + ' data-search=' + Q + searchBlob + Q,
              tag('h3', 'style=' + Q + 'margin-top:0;' + Q, name) +
              tag('p', '', reqHtml) +
              tag('p', '', tag('strong', '', 'Teams:') + ' ' + teamsText) +
              tag('p', '', tag('strong', '', 'Verdict:') + ' ' + verdictText) +
              tag('a', 'class=' + Q + 'msf-btn' + Q + ' href=' + Q + './' + escapeHtml(slug) + '/' + Q, 'Open Shard Calculator ' + A + 'amp; Guide')
            );
          })
          .join('\n')
      : tag(
          'div',
          'class=' + Q + 'msf-card' + Q,
          tag('span', 'class=' + Q + 'msf-placeholder' + Q, 'PLACEHOLDER: No verified characters published yet')
        );

  const discoveredSectionHtml =
    discoveredCandidates.length > 0
      ? tag(
          'section',
          '',
          tag('h2', '', 'Pending Verification Queue (' + discoveredCandidates.length + ')') +
          tag(
            'p',
            '',
            'Recently detected headlines/candidates awaiting manual shard and ability verification (no unverified stats are generated):'
          ) +
          tag(
            'div',
            'class=' + Q + 'msf-grid' + Q,
            discoveredCandidates
              .slice(0, 12)
              .map(function (d) {
                const dTitle = escapeHtml(d.candidateTitle || 'PLACEHOLDER: Candidate');
                const dSource = escapeHtml(d.sourceName || 'PLACEHOLDER: Source');
                const searchBlob = escapeHtml((d.candidateTitle || '') + ' ' + (d.sourceName || '')).toLowerCase();
                return tag(
                  'div',
                  'class=' + Q + 'msf-stat msf-hub-item' + Q + ' data-search=' + Q + searchBlob + Q,
                  tag('strong', '', dTitle) +
                  tag('div', 'style=' + Q + 'margin-top:6px;' + Q, tag('span', 'class=' + Q + 'msf-placeholder' + Q, 'PLACEHOLDER: Pending Verification')) +
                  tag('p', 'style=' + Q + 'margin:8px 0 0 0; font-size:0.88rem; color:#4b5563;' + Q, 'Source: ' + dSource)
                );
              })
              .join('\n')
          )
        )
      : '';

  const hubBody = tag(
    'main',
    'class=' + Q + 'msf-wrap' + Q + ' data-updated=' + Q + escapeHtml(updatedAtIso) + Q,
    tag('p', 'class=' + Q + 'msf-site-title' + Q, 'SmartChoiceLinks ' + A + 'bull; MSF Character Intelligence') +
    tag('p', 'class=' + Q + 'msf-meta' + Q, tag('small', '', 'Updated snapshot (UTC): ' + escapeHtml(updatedAtIso))) +
    tag('h1', '', title) +
    tag(
      'p',
      '',
      'Search verified Marvel Strike Force character guides and run F2P shard unlock vs. offer savings calculations before spending Power Cores.'
    ) +
    tag(
      'section',
      'class=' + Q + 'msf-box' + Q + ' aria-label=' + Q + 'Character Search' + Q,
      tag('label', 'for=' + Q + 'msf-hub-search' + Q + ' style=' + Q + 'font-weight:700; display:block; margin-bottom:6px;' + Q, 'Search Characters or Teams') +
      selfTag(
        'input',
        'type=' + Q + 'search' + Q + ' id=' + Q + 'msf-hub-search' + Q +
        ' class=' + Q + 'msf-search-input' + Q +
        ' placeholder=' + Q + 'Type character name or team (e.g. Sauron, Savage Land)...' + Q
      ) +
      tag('p', 'id=' + Q + 'msf-hub-count' + Q + ' style=' + Q + 'margin:8px 0 0 0; font-size:0.9rem; color:#4b5563;' + Q, 'Showing ' + characters.length + ' verified character guide(s)')
    ) +
    tag(
      'section',
      '',
      tag('h2', '', 'Verified Character Guides ' + A + 'amp; Shard Calculators') +
      tag('div', 'id=' + Q + 'msf-hub-list' + Q + ' class=' + Q + 'msf-grid' + Q, charCardsHtml) +
      tag('p', 'id=' + Q + 'msf-hub-empty' + Q + ' class=' + Q + 'msf-empty' + Q, 'No matching characters found. Clear the search box to view all entries.')
    ) +
    discoveredSectionHtml +
    getToolsNavHtml(false)
  );

  const hubScript =
    '(function () {' +
    '  var root = document.currentScript.closest(' + SQ + '.msf-wrap' + SQ + ');' +
    '  if (!root) return;' +
    '  var input = root.querySelector(' + SQ + '#msf-hub-search' + SQ + ');' +
    '  var items = Array.prototype.slice.call(root.querySelectorAll(' + SQ + '.msf-hub-item' + SQ + '));' +
    '  var emptyEl = root.querySelector(' + SQ + '#msf-hub-empty' + SQ + ');' +
    '  var countEl = root.querySelector(' + SQ + '#msf-hub-count' + SQ + ');' +
    '  if (!input) return;' +
    '  function filterHub() {' +
    '    var qStr = String(input.value || ' + SQ + SQ + ').toLowerCase().trim();' +
    '    var visible = 0;' +
    '    items.forEach(function (el) {' +
    '      var hay = el.getAttribute(' + SQ + 'data-search' + SQ + ') || ' + SQ + SQ + ';' +
    '      var match = !qStr || hay.indexOf(qStr) !== -1;' +
    '      el.style.display = match ? ' + SQ + SQ + ' : ' + SQ + 'none' + SQ + ';' +
    '      if (match) visible++;' +
    '    });' +
    '    if (emptyEl) emptyEl.style.display = visible === 0 ? ' + SQ + 'block' + SQ + ' : ' + SQ + 'none' + SQ + ';' +
    '    if (countEl) countEl.textContent = ' + SQ + 'Showing ' + SQ + ' + visible + ' + SQ + ' matching entry(s)' + SQ + ';' +
    '  }' +
    '  input.addEventListener(' + SQ + 'input' + SQ + ', filterHub);' +
    '})();';

  const headHtml = tag(
    'head',
    '',
    selfTag('meta', 'charset=' + Q + 'UTF-8' + Q) +
    selfTag('meta', 'name=' + Q + 'viewport' + Q + ' content=' + Q + 'width=device-width, initial-scale=1.0' + Q) +
    tag('title', '', title) +
    tag('style', '', getSharedCss())
  );

  const bodyHtml = tag('body', '', hubBody + tag('script', '', hubScript));
  return '<!DOCTYPE html>\n' + tag('html', 'lang=' + Q + 'en' + Q, headHtml + bodyHtml);
}

function renderCharacterHtml(charItem, updatedAtIso) {
  const Q = q();
  const SQ = sq();
  const A = amp();

  const name = escapeHtml(charItem.name || 'PLACEHOLDER: Character Name');
  const slug = slugify(charItem.slug || charItem.name);
  const title = 'Should You Recruit ' + name + ' in Marvel Strike Force?';

  const hasReq = typeof charItem.shardsRequired === 'number' && Number.isFinite(charItem.shardsRequired);
  const shardsReq = hasReq ? charItem.shardsRequired : 0;
  const shardsReqBadge = hasReq
    ? ''
    : ' ' + tag('span', 'class=' + Q + 'msf-placeholder' + Q, 'PLACEHOLDER: Unlock Shards');

  const dailySources =
    Array.isArray(charItem.dailySources) && charItem.dailySources.length > 0
      ? charItem.dailySources
      : [{ label: 'PLACEHOLDER: Daily Source', defaultDailyShards: 0 }];

  const dailyInputsHtml = dailySources
    .map(function (src, i) {
      const label = escapeHtml(src.label || 'PLACEHOLDER: Daily Source ' + (i + 1));
      const val =
        typeof src.defaultDailyShards === 'number' && Number.isFinite(src.defaultDailyShards)
          ? src.defaultDailyShards
          : 0;
      const labelHtml =
        label.indexOf('PLACEHOLDER') !== -1
          ? tag('span', 'class=' + Q + 'msf-placeholder' + Q, label)
          : label;
      const inputHtml = selfTag(
        'input',
        'type=' + Q + 'number' + Q + ' min=' + Q + '0' + Q + ' step=' + Q + '0.5' + Q +
        ' class=' + Q + 'msf-daily-input' + Q + ' id=' + Q + 'msf-src-' + i + Q +
        ' value=' + Q + val + Q
      );
      return tag(
        'div',
        'class=' + Q + 'msf-field' + Q,
        tag('label', 'for=' + Q + 'msf-src-' + i + Q, labelHtml) + inputHtml
      );
    })
    .join('\n');

  const offer = charItem.offerOrOrb || {};
  const offerLabel = escapeHtml(offer.label || 'PLACEHOLDER: Offer or Orb Name');
  const offerShards =
    typeof offer.shardsPerPurchase === 'number' && Number.isFinite(offer.shardsPerPurchase)
      ? offer.shardsPerPurchase
      : 0;
  const offerPrice = escapeHtml(offer.priceLabel || 'PLACEHOLDER: Price');

  const whatDoesList = (
    Array.isArray(charItem.whatCharacterDoes) && charItem.whatCharacterDoes.length > 0
      ? charItem.whatCharacterDoes
      : ['PLACEHOLDER: Character abilities, role, and combat mechanics.']
  )
    .map(function (line) {
      return tag('li', '', escapeHtml(line));
    })
    .join('\n');

  const teamsHtml = (
    Array.isArray(charItem.bestTeams) && charItem.bestTeams.length > 0
      ? charItem.bestTeams
      : [{ teamName: 'PLACEHOLDER: Team Name', gameModes: 'PLACEHOLDER: Modes', notes: 'PLACEHOLDER: Notes' }]
  )
    .map(function (t) {
      return tag(
        'div',
        'class=' + Q + 'msf-card' + Q,
        tag('h3', '', escapeHtml(t.teamName || 'PLACEHOLDER: Team Name')) +
        tag('p', '', tag('strong', '', 'Modes:') + ' ' + escapeHtml(t.gameModes || 'PLACEHOLDER: Modes')) +
        tag('p', '', escapeHtml(t.notes || 'PLACEHOLDER: Notes'))
      );
    })
    .join('\n');

  const verdict = escapeHtml(
    charItem.recommendation && charItem.recommendation.verdict
      ? charItem.recommendation.verdict
      : 'PLACEHOLDER: Recruit Now or Wait'
  );
  const verdictSummary = escapeHtml(
    charItem.recommendation && charItem.recommendation.summary
      ? charItem.recommendation.summary
      : 'PLACEHOLDER: Recommendation summary'
  );

  const faqHtml = (
    Array.isArray(charItem.faq) && charItem.faq.length > 0
      ? charItem.faq
      : [{ question: 'PLACEHOLDER: Question', answer: 'PLACEHOLDER: Answer' }]
  )
    .map(function (f) {
      return tag(
        'details',
        'class=' + Q + 'msf-faq' + Q,
        tag('summary', '', escapeHtml(f.question || 'PLACEHOLDER: Question')) +
        tag('p', '', escapeHtml(f.answer || 'PLACEHOLDER: Answer'))
      );
    })
    .join('\n');

  const calcBoxHtml =
    tag('h2', '', 'Shard Unlock ' + A + 'amp; Offer Savings Calculator') +
    tag(
      'div',
      'class=' + Q + 'msf-field' + Q,
      tag('label', 'for=' + Q + 'msf-req' + Q, 'Shards Required' + shardsReqBadge) +
      selfTag('input', 'type=' + Q + 'number' + Q + ' min=' + Q + '0' + Q + ' id=' + Q + 'msf-req' + Q + ' value=' + Q + shardsReq + Q)
    ) +
    tag(
      'div',
      'class=' + Q + 'msf-field' + Q,
      tag('label', 'for=' + Q + 'msf-owned' + Q, 'Current Shards Owned') +
      selfTag('input', 'type=' + Q + 'number' + Q + ' min=' + Q + '0' + Q + ' id=' + Q + 'msf-owned' + Q + ' value=' + Q + '0' + Q)
    ) +
    tag('h3', '', 'Daily Shard Sources') +
    dailyInputsHtml +
    tag(
      'div',
      'class=' + Q + 'msf-field' + Q,
      tag('label', 'for=' + Q + 'msf-offer' + Q, offerLabel + ' - Shards per Purchase') +
      selfTag('input', 'type=' + Q + 'number' + Q + ' min=' + Q + '0' + Q + ' id=' + Q + 'msf-offer' + Q + ' value=' + Q + offerShards + Q) +
      tag('small', '', tag('span', 'class=' + Q + 'msf-placeholder' + Q, offerPrice))
    ) +
    tag(
      'div',
      'class=' + Q + 'msf-results' + Q,
      tag('div', 'class=' + Q + 'msf-stat' + Q, tag('strong', '', 'Remaining Shards') + tag('div', 'id=' + Q + 'msf-out-rem' + Q, '0')) +
      tag('div', 'class=' + Q + 'msf-stat' + Q, tag('strong', '', 'Daily Shards') + tag('div', 'id=' + Q + 'msf-out-daily' + Q, '0')) +
      tag('div', 'class=' + Q + 'msf-stat' + Q, tag('strong', '', 'F2P Days to Unlock') + tag('div', 'id=' + Q + 'msf-out-days' + Q, 'N/A')) +
      tag('div', 'class=' + Q + 'msf-stat' + Q, tag('strong', '', 'Days Saved (1 Offer/Orb)') + tag('div', 'id=' + Q + 'msf-out-saved' + Q, 'N/A'))
    );

  const articleHtml = tag(
    'article',
    'class=' + Q + 'msf-wrap' + Q + ' data-slug=' + Q + escapeHtml(slug) + Q + ' data-updated=' + Q + escapeHtml(updatedAtIso) + Q,
    tag('p', 'class=' + Q + 'msf-site-title' + Q, 'Marvel Strike Force Character Guides ' + A + 'amp; Shard Calculators') +
    tag('p', 'class=' + Q + 'msf-meta' + Q, tag('small', '', 'Generated snapshot (UTC): ' + escapeHtml(updatedAtIso))) +
    tag('h1', '', escapeHtml(title)) +
    tag('section', 'class=' + Q + 'msf-box' + Q + ' aria-label=' + Q + 'Shard Calculator' + Q, calcBoxHtml) +
    tag('section', '', tag('h2', '', 'What ' + name + ' Does') + tag('ul', '', whatDoesList)) +
    tag('section', '', tag('h2', '', 'Best Teams') + teamsHtml) +
    tag('section', 'class=' + Q + 'msf-verdict' + Q, tag('h2', '', 'Recommendation: ' + verdict) + tag('p', '', verdictSummary)) +
    tag('section', '', tag('h2', '', 'Frequently Asked Questions') + faqHtml) +
    getToolsNavHtml(true)
  );

  const inlineJs =
    '(function () {' +
    '  var root = document.currentScript.closest(' + SQ + '.msf-wrap' + SQ + ');' +
    '  if (!root) return;' +
    '  var reqEl = root.querySelector(' + SQ + '#msf-req' + SQ + ');' +
    '  var ownedEl = root.querySelector(' + SQ + '#msf-owned' + SQ + ');' +
    '  var offerEl = root.querySelector(' + SQ + '#msf-offer' + SQ + ');' +
    '  var dailyEls = Array.prototype.slice.call(root.querySelectorAll(' + SQ + '.msf-daily-input' + SQ + '));' +
    '  var outRem = root.querySelector(' + SQ + '#msf-out-rem' + SQ + ');' +
    '  var outDaily = root.querySelector(' + SQ + '#msf-out-daily' + SQ + ');' +
    '  var outDays = root.querySelector(' + SQ + '#msf-out-days' + SQ + ');' +
    '  var outSaved = root.querySelector(' + SQ + '#msf-out-saved' + SQ + ');' +
    '  function updateCalc() {' +
    '    var req = Math.max(0, Number(reqEl.value) || 0);' +
    '    var owned = Math.max(0, Number(ownedEl.value) || 0);' +
    '    var rem = Math.max(0, req - owned);' +
    '    var daily = dailyEls.reduce(function (acc, el) { return acc + Math.max(0, Number(el.value) || 0); }, 0);' +
    '    var offerGain = Math.max(0, Number(offerEl.value) || 0);' +
    '    outRem.textContent = String(rem);' +
    '    outDaily.textContent = String(daily);' +
    '    if (rem === 0) { outDays.textContent = ' + SQ + '0 days' + SQ + '; outSaved.textContent = ' + SQ + '0 days' + SQ + '; return; }' +
    '    if (daily > 0) {' +
    '      var days = Math.ceil(rem / daily);' +
    '      var remAfter = Math.max(0, rem - offerGain);' +
    '      var daysAfter = Math.ceil(remAfter / daily);' +
    '      var saved = Math.max(0, days - daysAfter);' +
    '      outDays.textContent = days + (days === 1 ? ' + SQ + ' day' + SQ + ' : ' + SQ + ' days' + SQ + ');' +
    '      outSaved.textContent = saved + (saved === 1 ? ' + SQ + ' day' + SQ + ' : ' + SQ + ' days' + SQ + ');' +
    '    } else {' +
    '      outDays.textContent = ' + SQ + 'Set daily shards (> 0)' + SQ + ';' +
    '      outSaved.textContent = ' + SQ + 'Set daily shards (> 0)' + SQ + ';' +
    '    }' +
    '  }' +
    '  [reqEl, ownedEl, offerEl].concat(dailyEls).forEach(function (el) { el.addEventListener(' + SQ + 'input' + SQ + ', updateCalc); });' +
    '  updateCalc();' +
    '})();';

  const headHtml = tag(
    'head',
    '',
    selfTag('meta', 'charset=' + Q + 'UTF-8' + Q) +
    selfTag('meta', 'name=' + Q + 'viewport' + Q + ' content=' + Q + 'width=device-width, initial-scale=1.0' + Q) +
    tag('title', '', escapeHtml(title)) +
    tag('style', '', getSharedCss())
  );

  const bodyHtml = tag('body', '', articleHtml + tag('script', '', inlineJs));
  return '<!DOCTYPE html>\n' + tag('html', 'lang=' + Q + 'en' + Q, headHtml + bodyHtml);
}

async function main() {
  const rawSources = fs.existsSync(SOURCES_FILE)
    ? JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8'))
    : { candidateCharacters: [], externalEndpoints: [] };

  const externalResults = await queryExternalEndpoints(rawSources.externalEndpoints);
  const updatedAtIso = new Date().toISOString();
  const characters = Array.isArray(rawSources.candidateCharacters) ? rawSources.candidateCharacters : [];

  fs.mkdirSync(PUBLIC_CHARS_DIR, { recursive: true });
  const manifest = [];

  for (let i = 0; i < characters.length; i++) {
    const charItem = characters[i];
    const slug = slugify(charItem.slug || charItem.name);
    const charDir = path.join(PUBLIC_CHARS_DIR, slug);
    fs.mkdirSync(charDir, { recursive: true });

    const html = renderCharacterHtml(charItem, updatedAtIso);
    fs.writeFileSync(path.join(charDir, 'index.html'), html, 'utf8');

    manifest.push({
      name: charItem.name || 'PLACEHOLDER: Character Name',
      slug: slug,
      updatedAt: updatedAtIso,
      htmlPath: 'public/characters/' + slug + '/index.html'
    });
  }

  const discoveredCandidates = collectDiscoveredCandidates(externalResults, characters, updatedAtIso);

  const hubHtml = renderHubHtml(characters, discoveredCandidates, updatedAtIso);
  fs.writeFileSync(path.join(PUBLIC_CHARS_DIR, 'index.html'), hubHtml, 'utf8');

  const sitemapXml = buildSitemapXml(manifest, updatedAtIso);
  fs.writeFileSync(SITEMAP_FILE, sitemapXml, 'utf8');

  fs.writeFileSync(
    DISCOVERED_FILE,
    JSON.stringify(
      {
        updatedAt: updatedAtIso,
        candidates: discoveredCandidates
      },
      null,
      2
    ),
    'utf8'
  );

  fs.writeFileSync(
    path.join(PUBLIC_CHARS_DIR, 'manifest.json'),
    JSON.stringify(
      {
        updatedAt: updatedAtIso,
        hubPath: 'public/characters/index.html',
        sitemapPath: 'public/sitemap.xml',
        externalSources: externalResults,
        discoveredCandidates: discoveredCandidates,
        characters: manifest
      },
      null,
      2
    ),
    'utf8'
  );

  printBuildSummary(externalResults, manifest, discoveredCandidates, updatedAtIso);
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
