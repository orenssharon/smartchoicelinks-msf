const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SOURCES_FILE = path.join(ROOT_DIR, 'data', 'sources.json');
const PUBLIC_CHARS_DIR = path.join(ROOT_DIR, 'public', 'characters');

function q() {
  return String.fromCharCode(34);
}

function replaceCharCode(inputStr, targetCode, replacement) {
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
  const amp = String.fromCharCode(38);
  let out = replaceCharCode(val, 38, amp + 'amp;');
  out = replaceCharCode(out, 60, amp + 'lt;');
  out = replaceCharCode(out, 62, amp + 'gt;');
  out = replaceCharCode(out, 34, amp + 'quot;');
  return out;
}

function slugify(text) {
  const raw = String(text || 'placeholder-character').toLowerCase();
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const isAlphaNum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    out += isAlphaNum ? ch : '-';
  }
  while (out.indexOf('--') !== -1) {
    out = out.split('--').join('-');
  }
  if (out.charAt(0) === '-') out = out.slice(1);
  if (out.charAt(out.length - 1) === '-') out = out.slice(0, -1);
  return out || 'placeholder-character';
}

async function queryExternalEndpoints(endpoints) {
  const collected = [];
  if (!Array.isArray(endpoints)) return collected;

  for (let i = 0; i < endpoints.length; i++) {
    const ep = endpoints[i];
    if (!ep || !ep.url || ep.url.indexOf('https://') !== 0) continue;
    try {
      const controller = new AbortController();
      const timer = setTimeout(function () {
        controller.abort();
      }, 10000);
      const res = await fetch(ep.url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.indexOf('application/json') !== -1) {
        const json = await res.json();
        collected.push({ source: ep.name || ep.url, data: json });
      } else {
        const text = await res.text();
        collected.push({ source: ep.name || ep.url, snippetLength: text.length });
      }
    } catch (err) {
      console.warn('Source fetch skipped:', ep.url, err.message);
    }
  }
  return collected;
}

function renderCharacterHtml(charItem, updatedAtIso) {
  const Q = q();
  const amp = String.fromCharCode(38);
  const name = escapeHtml(charItem.name || 'PLACEHOLDER: Character Name');
  const slug = slugify(charItem.slug || charItem.name);
  const title = 'Should You Recruit ' + name + ' in Marvel Strike Force?';

  const hasReq = typeof charItem.shardsRequired === 'number' && Number.isFinite(charItem.shardsRequired);
  const shardsReq = hasReq ? charItem.shardsRequired : 0;
  const shardsReqBadge = hasReq
    ? ''
    : '<span class=' + Q + 'msf-placeholder' + Q + '>PLACEHOLDER: Unlock Shards</span>';

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
          ? '<span class=' + Q + 'msf-placeholder' + Q + '>' + label + '</span>'
          : label;
      return (
        '<div class=' + Q + 'msf-field' + Q + '>' +
        '<label for=' + Q + 'msf-src-' + i + Q + '>' + labelHtml + '</label>' +
        '<input type=' + Q + 'number' + Q + ' min=' + Q + '0' + Q + ' step=' + Q + '0.5' + Q +
        ' class=' + Q + 'msf-daily-input' + Q + ' id=' + Q + 'msf-src-' + i + Q +
        ' value=' + Q + val + Q + ' />' +
        '</div>'
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
      return '<li>' + escapeHtml(line) + '</li>';
    })
    .join('\n');

  const teamsHtml = (
    Array.isArray(charItem.bestTeams) && charItem.bestTeams.length > 0
      ? charItem.bestTeams
      : [{ teamName: 'PLACEHOLDER: Team Name', gameModes: 'PLACEHOLDER: Modes', notes: 'PLACEHOLDER: Notes' }]
  )
    .map(function (t) {
      return (
        '<div class=' + Q + 'msf-card' + Q + '>' +
        '<h3>' + escapeHtml(t.teamName || 'PLACEHOLDER: Team Name') + '</h3>' +
        '<p><strong>Modes:</strong> ' + escapeHtml(t.gameModes || 'PLACEHOLDER: Modes') + '</p>' +
        '<p>' + escapeHtml(t.notes || 'PLACEHOLDER: Notes') + '</p>' +
        '</div>'
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
      return (
        '<details class=' + Q + 'msf-faq' + Q + '>' +
        '<summary>' + escapeHtml(f.question || 'PLACEHOLDER: Question') + '</summary>' +
        '<p>' + escapeHtml(f.answer || 'PLACEHOLDER: Answer') + '</p>' +
        '</details>'
      );
    })
    .join('\n');

  const h2Calc = 'Shard Unlock ' + amp + 'amp; Offer Savings Calculator';
  const h2Tools = 'Marvel Strike Force Tools ' + amp + 'amp; Hub';

  return (
    '<!DOCTYPE html>\n' +
    '<html lang=' + Q + 'en' + Q + '>\n' +
    '<head>\n' +
    '  <meta charset=' + Q + 'UTF-8' + Q + ' />\n' +
    '  <meta name=' + Q + 'viewport' + Q + ' content=' + Q + 'width=device-width, initial-scale=1.0' + Q + ' />\n' +
    '  <title>' + escapeHtml(title) + '</title>\n' +
    '  <style>\n' +
    '    .msf-wrap { font-family: system-ui, -apple-system, sans-serif; max-width: 860px; margin: 0 auto; padding: 20px; color: #111827; line-height: 1.6; }\n' +
    '    .msf-placeholder { display: inline-block; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; }\n' +
    '    .msf-box, .msf-card, .msf-verdict { border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; margin: 16px 0; background: #f9fafb; }\n' +
    '    .msf-field { display: grid; gap: 6px; margin-bottom: 12px; }\n' +
    '    .msf-field input { max-width: 220px; padding: 8px; border: 1px solid #9ca3af; border-radius: 6px; }\n' +
    '    .msf-results { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 12px; }\n' +
    '    .msf-stat { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; }\n' +
    '    .msf-faq { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin: 8px 0; }\n' +
    '    .msf-links { display: flex; flex-wrap: wrap; gap: 12px; list-style: none; padding: 0; }\n' +
    '  </style>\n' +
    '</head>\n' +
    '<body>\n' +
    '  <article class=' + Q + 'msf-wrap' + Q + ' data-slug=' + Q + escapeHtml(slug) + Q + ' data-updated=' + Q + escapeHtml(updatedAtIso) + Q + '>\n' +
    '    <p class=' + Q + 'msf-meta' + Q + '><small>Generated snapshot (UTC): ' + escapeHtml(updatedAtIso) + '</small></p>\n' +
    '    <h1>' + escapeHtml(title) + '</h1>\n' +
    '    <section class=' + Q + 'msf-box' + Q + ' aria-label=' + Q + 'Shard Calculator' + Q + '>\n' +
    '      <h2>' + h2Calc + '</h2>\n' +
    '      <div class=' + Q + 'msf-field' + Q + '>\n' +
    '        <label for=' + Q + 'msf-req' + Q + '>Shards Required ' + shardsReqBadge + '</label>\n' +
    '        <input type=' + Q + 'number' + Q + ' min=' + Q + '0' + Q + ' id=' + Q + 'msf-req' + Q + ' value=' + Q + shardsReq + Q + ' />\n' +
    '      </div>\n' +
    '      <div class=' + Q + 'msf-field' + Q + '>\n' +
    '        <label for=' + Q + 'msf-owned' + Q + '>Current Shards Owned</label>\n' +
    '        <input type=' + Q + 'number' + Q + ' min=' + Q + '0' + Q + ' id=' + Q + 'msf-owned' + Q + ' value=' + Q + '0' + Q + ' />\n' +
    '      </div>\n' +
    '      <h3>Daily Shard Sources</h3>\n' +
    dailyInputsHtml + '\n' +
    '      <div class=' + Q + 'msf-field' + Q + '>\n' +
    '        <label for=' + Q + 'msf-offer' + Q + '>' + offerLabel + ' - Shards per Purchase</label>\n' +
    '        <input type=' + Q + 'number' + Q + ' min=' + Q + '0' + Q + ' id=' + Q + 'msf-offer' + Q + ' value=' + Q + offerShards + Q + ' />\n' +
    '        <small><span class=' + Q + 'msf-placeholder' + Q + '>' + offerPrice + '</span></small>\n' +
    '      </div>\n' +
    '      <div class=' + Q + 'msf-results' + Q + '>\n' +
    '        <div class=' + Q + 'msf-stat' + Q + '><strong>Remaining Shards</strong><div id=' + Q + 'msf-out-rem' + Q + '>0</div></div>\n' +
    '        <div class=' + Q + 'msf-stat' + Q + '><strong>Daily Shards</strong><div id=' + Q + 'msf-out-daily' + Q + '>0</div></div>\n' +
    '        <div class=' + Q + 'msf-stat' + Q + '><strong>F2P Days to Unlock</strong><div id=' + Q + 'msf-out-days' + Q + '>N/A</div></div>\n' +
    '        <div class=' + Q + 'msf-stat' + Q + '><strong>Days Saved (1 Offer/Orb)</strong><div id=' + Q + 'msf-out-saved' + Q + '>N/A</div></div>\n' +
    '      </div>\n' +
    '    </section>\n' +
    '    <section><h2>What ' + name + ' Does</h2><ul>' + whatDoesList + '</ul></section>\n' +
    '    <section><h2>Best Teams</h2>' + teamsHtml + '</section>\n' +
    '    <section class=' + Q + 'msf-verdict' + Q + '><h2>Recommendation: ' + verdict + '</h2><p>' + verdictSummary + '</p></section>\n' +
    '    <section><h2>Frequently Asked Questions</h2>' + faqHtml + '</section>\n' +
    '    <nav aria-label=' + Q + 'MSF Tools' + Q + '>\n' +
    '      <h2>' + h2Tools + '</h2>\n' +
    '      <ul class=' + Q + 'msf-links' + Q + '>\n' +
    '        <li><a href=' + Q + '/5-essential-msf-calculators/' + Q + '>5 Essential MSF Calculators</a></li>\n' +
    '        <li><a href=' + Q + '/codes/' + Q + '>MSF Promo Codes</a></li>\n' +
    '        <li><a href=' + Q + '/g21-calculator/' + Q + '>G21 Calculator</a></li>\n' +
    '        <li><a href=' + Q + '/gold-calculator/' + Q + '>Gold Calculator</a></li>\n' +
    '        <li><a href=' + Q + '/turn-1-calculator/' + Q + '>Turn-1 Calculator</a></li>\n' +
    '        <li><a href=' + Q + '/meta-hub/' + Q + '>Meta Hub</a></li>\n' +
    '      </ul>\n' +
    '    </nav>\n' +
    '  </article>\n' +
    '  <script>\n' +
    '    (function () {\n' +
    '      var root = document.currentScript.closest(' + Q + '.msf-wrap' + Q + ');\n' +
    '      var reqEl = root.querySelector(' + Q + '#msf-req' + Q + ');\n' +
    '      var ownedEl = root.querySelector(' + Q + '#msf-owned' + Q + ');\n' +
    '      var offerEl = root.querySelector(' + Q + '#msf-offer' + Q + ');\n' +
    '      var dailyEls = Array.prototype.slice.call(root.querySelectorAll(' + Q + '.msf-daily-input' + Q + '));\n' +
    '      var outRem = root.querySelector(' + Q + '#msf-out-rem' + Q + ');\n' +
    '      var outDaily = root.querySelector(' + Q + '#msf-out-daily' + Q + ');\n' +
    '      var outDays = root.querySelector(' + Q + '#msf-out-days' + Q + ');\n' +
    '      var outSaved = root.querySelector(' + Q + '#msf-out-saved' + Q + ');\n' +
    '      function updateCalc() {\n' +
    '        var req = Math.max(0, Number(reqEl.value) || 0);\n' +
    '        var owned = Math.max(0, Number(ownedEl.value) || 0);\n' +
    '        var rem = Math.max(0, req - owned);\n' +
    '        var daily = dailyEls.reduce(function (acc, el) { return acc + Math.max(0, Number(el.value) || 0); }, 0);\n' +
    '        var offerGain = Math.max(0, Number(offerEl.value) || 0);\n' +
    '        outRem.textContent = String(rem);\n' +
    '        outDaily.textContent = String(daily);\n' +
    '        if (rem === 0) { outDays.textContent = ' + Q + '0 days' + Q + '; outSaved.textContent = ' + Q + '0 days' + Q + '; return; }\n' +
    '        if (daily > 0) {\n' +
    '          var days = Math.ceil(rem / daily);\n' +
    '          var remAfter = Math.max(0, rem - offerGain);\n' +
    '          var daysAfter = Math.ceil(remAfter / daily);\n' +
    '          var saved = Math.max(0, days - daysAfter);\n' +
    '          outDays.textContent = days + (days === 1 ? ' + Q + ' day' + Q + ' : ' + Q + ' days' + Q + ');\n' +
    '          outSaved.textContent = saved + (saved === 1 ? ' + Q + ' day' + Q + ' : ' + Q + ' days' + Q + ');\n' +
    '        } else {\n' +
    '          outDays.textContent = ' + Q + 'Set daily shards (> 0)' + Q + ';\n' +
    '          outSaved.textContent = ' + Q + 'Set daily shards (> 0)' + Q + ';\n' +
    '        }\n' +
    '      }\n' +
    '      [reqEl, ownedEl, offerEl].concat(dailyEls).forEach(function (el) { el.addEventListener(' + Q + 'input' + Q + ', updateCalc); });\n' +
    '      updateCalc();\n' +
    '    })();\n' +
    '  </script>\n' +
    '</body>\n' +
    '</html>'
  );
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

  fs.writeFileSync(
    path.join(PUBLIC_CHARS_DIR, 'manifest.json'),
    JSON.stringify(
      {
        updatedAt: updatedAtIso,
        externalSourcesChecked: externalResults.length,
        characters: manifest
      },
      null,
      2
    ),
    'utf8'
  );
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
