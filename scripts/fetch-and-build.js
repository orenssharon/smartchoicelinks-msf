const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.join(__dirname, "..");
const SOURCES_FILE = path.join(ROOT_DIR, "data", "sources.json");
const PUBLIC_CHARS_DIR = path.join(ROOT_DIR, "public", "characters");
const QUOTE = String.fromCharCode(34);

function escapeHtml(val) {
  const str = String(val === undefined || val === null ? "" : val);
  return str
    .split("&").join("&")
    .split("<").join("<")
    .split(">").join(">")
    .split(QUOTE).join(""");
}

function slugify(text) {
  const raw = String(text || "placeholder-character").toLowerCase();
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    const isAlphaNum = (ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9");
    out += isAlphaNum ? ch : "-";
  }
  out = out.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return out || "placeholder-character";
}

async function queryExternalEndpoints(endpoints) {
  const collected = [];
  if (!Array.isArray(endpoints)) return collected;

  for (const ep of endpoints) {
    if (!ep || !ep.url || !ep.url.startsWith("https://")) continue;
    try {
      const res = await fetch(ep.url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const json = await res.json();
        collected.push({ source: ep.name || ep.url, data: json });
      } else {
        const text = await res.text();
        collected.push({ source: ep.name || ep.url, snippetLength: text.length });
      }
    } catch (err) {
      console.warn("Source fetch skipped:", ep.url, err.message);
    }
  }
  return collected;
}

function renderCharacterHtml(charItem, updatedAtIso) {
  const name = escapeHtml(charItem.name || "PLACEHOLDER: Character Name");
  const slug = slugify(charItem.slug || charItem.name);
  const title = "Should You Recruit " + name + " in Marvel Strike Force?";

  const hasReq = typeof charItem.shardsRequired === "number" && Number.isFinite(charItem.shardsRequired);
  const shardsReq = hasReq ? charItem.shardsRequired : 0;
  const shardsReqBadge = hasReq
    ? ""
    : `<span class="msf-placeholder">PLACEHOLDER: Unlock Shards</span>`;

  const dailySources = Array.isArray(charItem.dailySources) && charItem.dailySources.length > 0
    ? charItem.dailySources
    : [{ label: "PLACEHOLDER: Daily Source", defaultDailyShards: 0 }];

  const dailyInputsHtml = dailySources
    .map((src, i) => {
      const label = escapeHtml(src.label || `PLACEHOLDER: Daily Source ${i + 1}`);
      const val = typeof src.defaultDailyShards === "number" && Number.isFinite(src.defaultDailyShards)
        ? src.defaultDailyShards
        : 0;
      const labelHtml = label.includes("PLACEHOLDER")
        ? `<span class="msf-placeholder">${label}</span>`
        : label;
      return `
        <div class="msf-field">
          <label for="msf-src-${i}">${labelHtml}</label>
          <input type="number" min="0" step="0.5" class="msf-daily-input" id="msf-src-${i}" value="${val}" />
        </div>`;
    })
    .join("\n");

  const offer = charItem.offerOrOrb || {};
  const offerLabel = escapeHtml(offer.label || "PLACEHOLDER: Offer or Orb Name");
  const offerShards = typeof offer.shardsPerPurchase === "number" && Number.isFinite(offer.shardsPerPurchase)
    ? offer.shardsPerPurchase
    : 0;
  const offerPrice = escapeHtml(offer.priceLabel || "PLACEHOLDER: Price");

  const whatDoesList = (Array.isArray(charItem.whatCharacterDoes) && charItem.whatCharacterDoes.length > 0
    ? charItem.whatCharacterDoes
    : ["PLACEHOLDER: Character abilities, role, and combat mechanics."])
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join("\n");

  const teamsHtml = (Array.isArray(charItem.bestTeams) && charItem.bestTeams.length > 0
    ? charItem.bestTeams
    : [{ teamName: "PLACEHOLDER: Team Name", gameModes: "PLACEHOLDER: Modes", notes: "PLACEHOLDER: Notes" }])
    .map(
      (t) => `
      <div class="msf-card">
        <h3>${escapeHtml(t.teamName || "PLACEHOLDER: Team Name")}</h3>
        <p><strong>Modes:</strong> ${escapeHtml(t.gameModes || "PLACEHOLDER: Modes")}</p>
        <p>${escapeHtml(t.notes || "PLACEHOLDER: Notes")}</p>
      </div>`
    )
    .join("\n");

  const verdict = escapeHtml(charItem.recommendation && charItem.recommendation.verdict
    ? charItem.recommendation.verdict
    : "PLACEHOLDER: Recruit Now or Wait");
  const verdictSummary = escapeHtml(charItem.recommendation && charItem.recommendation.summary
    ? charItem.recommendation.summary
    : "PLACEHOLDER: Recommendation summary");

  const faqHtml = (Array.isArray(charItem.faq) && charItem.faq.length > 0
    ? charItem.faq
    : [{ question: "PLACEHOLDER: Question", answer: "PLACEHOLDER: Answer" }])
    .map(
      (f) => `
      <details class="msf-faq">
        <summary>${escapeHtml(f.question || "PLACEHOLDER: Question")}</summary>
        <p>${escapeHtml(f.answer || "PLACEHOLDER: Answer")}</p>
      </details>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    .msf-wrap { font-family: system-ui, -apple-system, sans-serif; max-width: 860px; margin: 0 auto; padding: 20px; color: #111827; line-height: 1.6; }
    .msf-placeholder { display: inline-block; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; }
    .msf-box, .msf-card, .msf-verdict { border: 1px solid #d1d5db; border-radius: 8px; padding: 16px; margin: 16px 0; background: #f9fafb; }
    .msf-field { display: grid; gap: 6px; margin-bottom: 12px; }
    .msf-field input { max-width: 220px; padding: 8px; border: 1px solid #9ca3af; border-radius: 6px; }
    .msf-results { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 12px; }
    .msf-stat { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; }
    .msf-faq { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 14px; margin: 8px 0; }
    .msf-links { display: flex; flex-wrap: wrap; gap: 12px; list-style: none; padding: 0; }
  </style>
</head>
<body>
  <article class="msf-wrap" data-slug="${escapeHtml(slug)}" data-updated="${escapeHtml(updatedAtIso)}">
    <p class="msf-meta"><small>Generated snapshot (UTC): ${escapeHtml(updatedAtIso)}</small></p>
    <h1>${escapeHtml(title)}</h1>

    <section class="msf-box" aria-label="Shard Calculator">
      <h2>Shard Unlock & Offer Savings Calculator</h2>

      <div class="msf-field">
        <label for="msf-req">Shards Required ${shardsReqBadge}</label>
        <input type="number" min="0" id="msf-req" value="${shardsReq}" />
      </div>

      <div class="msf-field">
        <label for="msf-owned">Current Shards Owned</label>
        <input type="number" min="0" id="msf-owned" value="0" />
      </div>

      <h3>Daily Shard Sources</h3>
      ${dailyInputsHtml}

      <div class="msf-field">
        <label for="msf-offer">${offerLabel} - Shards per Purchase</label>
        <input type="number" min="0" id="msf-offer" value="${offerShards}" />
        <small><span class="msf-placeholder">${offerPrice}</span></small>
      </div>

      <div class="msf-results">
        <div class="msf-stat">
          <strong>Remaining Shards</strong>
          <div id="msf-out-rem">0</div>
        </div>
        <div class="msf-stat">
          <strong>Daily Shards</strong>
          <div id="msf-out-daily">0</div>
        </div>
        <div class="msf-stat">
          <strong>F2P Days to Unlock</strong>
          <div id="msf-out-days">N/A</div>
        </div>
        <div class="msf-stat">
          <strong>Days Saved (1 Offer/Orb)</strong>
          <div id="msf-out-saved">N/A</div>
        </div>
      </div>
    </section>

    <section>
      <h2>What ${name} Does</h2>
      <ul>${whatDoesList}</ul>
    </section>

    <section>
      <h2>Best Teams</h2>
      ${teamsHtml}
    </section>

    <section class="msf-verdict">
      <h2>Recommendation: ${verdict}</h2>
      <p>${verdictSummary}</p>
    </section>

    <section>
      <h2>Frequently Asked Questions</h2>
      ${faqHtml}
    </section>

    <nav aria-label="MSF Tools">
      <h2>Marvel Strike Force Tools & Hub</h2>
      <ul class="msf-links">
        <li><a href="/5-essential-msf-calculators/">5 Essential MSF Calculators</a></li>
        <li><a href="/codes/">MSF Promo Codes</a></li>
        <li><a href="/g21-calculator/">G21 Calculator</a></li>
        <li><a href="/gold-calculator/">Gold Calculator</a></li>
        <li><a href="/turn-1-calculator/">Turn-1 Calculator</a></li>
        <li><a href="/meta-hub/">Meta Hub</a></li>
      </ul>
    </nav>
  </article>

  <script>
    (function () {
      var root = document.currentScript.closest(".msf-wrap");
      var reqEl = root.querySelector("#msf-req");
      var ownedEl = root.querySelector("#msf-owned");
      var offerEl = root.querySelector("#msf-offer");
      var dailyEls = Array.prototype.slice.call(root.querySelectorAll(".msf-daily-input"));

      var outRem = root.querySelector("#msf-out-rem");
      var outDaily = root.querySelector("#msf-out-daily");
      var outDays = root.querySelector("#msf-out-days");
      var outSaved = root.querySelector("#msf-out-saved");

      function updateCalc() {
        var req = Math.max(0, Number(reqEl.value) || 0);
        var owned = Math.max(0, Number(ownedEl.value) || 0);
        var rem = Math.max(0, req - owned);
        var daily = dailyEls.reduce(function (acc, el) {
          return acc + Math.max(0, Number(el.value) || 0);
        }, 0);
        var offerGain = Math.max(0, Number(offerEl.value) || 0);

        outRem.textContent = String(rem);
        outDaily.textContent = String(daily);

        if (rem === 0) {
          outDays.textContent = "0 days";
          outSaved.textContent = "0 days";
          return;
        }

        if (daily > 0) {
          var days = Math.ceil(rem / daily);
          var remAfter = Math.max(0, rem - offerGain);
          var daysAfter = Math.ceil(remAfter / daily);
          var saved = Math.max(0, days - daysAfter);
          outDays.textContent = days + (days === 1 ? " day" : " days");
          outSaved.textContent = saved + (saved === 1 ? " day" : " days");
        } else {
          outDays.textContent = "Set daily shards (> 0)";
          outSaved.textContent = "Set daily shards (> 0)";
        }
      }

      [reqEl, ownedEl, offerEl].concat(dailyEls).forEach(function (el) {
        el.addEventListener("input", updateCalc);
      });
      updateCalc();
    })();
  </script>
</body>
</html>`;
}

async function main() {
  const rawSources = fs.existsSync(SOURCES_FILE)
    ? JSON.parse(fs.readFileSync(SOURCES_FILE, "utf8"))
    : { candidateCharacters: [], externalEndpoints: [] };

  const externalResults = await queryExternalEndpoints(rawSources.externalEndpoints);
  const updatedAtIso = new Date().toISOString();
  const characters = Array.isArray(rawSources.candidateCharacters) ? rawSources.candidateCharacters : [];

  fs.mkdirSync(PUBLIC_CHARS_DIR, { recursive: true });
  const manifest = [];

  for (const charItem of characters) {
    const slug = slugify(charItem.slug || charItem.name);
    const charDir = path.join(PUBLIC_CHARS_DIR, slug);
    fs.mkdirSync(charDir, { recursive: true });

    const html = renderCharacterHtml(charItem, updatedAtIso);
    fs.writeFileSync(path.join(charDir, "index.html"), html, "utf8");

    manifest.push({
      name: charItem.name || "PLACEHOLDER: Character Name",
      slug: slug,
      updatedAt: updatedAtIso,
      htmlPath: "public/characters/" + slug + "/index.html"
    });
  }

  fs.writeFileSync(
    path.join(PUBLIC_CHARS_DIR, "manifest.json"),
    JSON.stringify(
      {
        updatedAt: updatedAtIso,
        externalSourcesChecked: externalResults.length,
        characters: manifest
      },
      null,
      2
    ),
    "utf8"
  );
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
