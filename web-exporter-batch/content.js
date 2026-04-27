(function () {
  'use strict';

  if (window.top !== window.self) return;

  const PANEL_ID = 'web-exporter-batch-panel';

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Tum acik shadow root'lar dahil derin sorgu */
  function deepQueryAll(selector, root = document) {
    const out = [];
    const stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      try {
        if (node.querySelectorAll) {
          node.querySelectorAll(selector).forEach((el) => out.push(el));
        }
        if (node.querySelectorAll) {
          node.querySelectorAll('*').forEach((el) => {
            if (el.shadowRoot) stack.push(el.shadowRoot);
          });
        }
      } catch (_) {
        /* cross-origin shadow vb. */
      }
    }
    return out;
  }

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = window.getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0)
      return false;
    return true;
  }

  function norm(s) {
    return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /** Metin iceren tiklanabilir ogeler (buton, [role=button], a) */
  function findByLabelIncludes(substrings) {
    const subs = substrings.map(norm);
    const candidates = deepQueryAll(
      'button, [role="button"], a, input[type="button"], input[type="submit"]'
    );
    for (const el of candidates) {
      if (!visible(el)) continue;
      const t = norm(el.textContent || el.value || el.getAttribute('aria-label') || '');
      if (subs.some((s) => t.includes(s))) return el;
    }
    return null;
  }

  function isChecked(el) {
    if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked;
    return el.getAttribute('aria-checked') === 'true';
  }

  function dedupeCheckboxEls(els) {
    const kept = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const dup = kept.some((k) => {
        const rk = k.getBoundingClientRect();
        return Math.abs(r.top - rk.top) < 4 && Math.abs(r.left - rk.left) < 4;
      });
      if (!dup) kept.push(el);
    }
    return kept;
  }

  function findWebExporterTableRoot(exportBtn) {
    let el = exportBtn.parentElement;
    for (let i = 0; i < 24 && el; i++) {
      const r = el.getBoundingClientRect();
      if (r.width >= 400 && r.height >= 220) return el;
      el = el.parentElement;
    }
    return exportBtn.parentElement || document.documentElement;
  }

  function findDataRowCheckboxes(root) {
    const sel = 'input[type="checkbox"], [role="checkbox"]';
    let boxes = deepQueryAll(sel, root).filter(visible);
    boxes = boxes.filter((el) => !el.closest(`#${PANEL_ID}`));
    boxes = dedupeCheckboxEls(boxes);
    boxes.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      if (Math.abs(ra.top - rb.top) < 2) return ra.left - rb.left;
      return ra.top - rb.top;
    });
    if (boxes.length <= 1) return [];
    return boxes.slice(1);
  }

  async function selectCurrentPageRowsOnly(log, root) {
    const rows = findDataRowCheckboxes(root);
    if (!rows.length) {
      log('Uyari: Satir kutusu bulunamadi. Bookmarks tablosu ve Exporter paneli acik olsun.');
      return false;
    }
    let clicks = 0;
    for (const cb of rows) {
      if (abortFlag) break;
      if (isDisabled(cb)) continue;
      if (!isChecked(cb)) {
        cb.click();
        clicks++;
        await sleep(25);
      }
    }
    log(`Bu sayfa: ${rows.length} satir, ${clicks} tiklama ile secildi (baslik kutusu yok).`);
    return true;
  }

  function findNextPageButton() {
    const byAria = deepQueryAll('[aria-label*="next" i], [aria-label*="sonraki" i]');
    const v = byAria.filter(visible);
    if (v.length) return v[v.length - 1];

    const arrows = deepQueryAll('button, [role="button"]').filter((el) => {
      if (!visible(el)) return false;
      const t = norm(el.textContent || el.getAttribute('aria-label') || '');
      if (t === '>' || t.includes('chevron right') || t.includes('arrow right')) return true;
      return false;
    });
    return arrows[arrows.length - 1] || null;
  }

  function isDisabled(el) {
    if (!el) return true;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
    if (el.classList && el.classList.contains('disabled')) return true;
    return false;
  }

  let abortFlag = false;

  async function runBatch(opts) {
    const { pauseAfterExportMs, pauseAfterPageMs, maxPages, log } = opts;
    let page = 0;

    while (!abortFlag && page < maxPages) {
      page++;
      log(`Sayfa ${page}: secim yapiliyor...`);

      const exportBtn =
        findByLabelIncludes(['export data', 'export']) ||
        findByLabelIncludes(['veriyi dışa aktar', 'disa aktar']);

      if (!exportBtn) {
        log('Hata: "Export Data" butonu bulunamadi. Panel acik ve Bookmarks sekmesinde misin?');
        break;
      }

      const tableRoot = findWebExporterTableRoot(exportBtn);
      await selectCurrentPageRowsOnly(log, tableRoot);
      await sleep(300);

      exportBtn.click();
      log(`Sayfa ${page}: Export Data tiklandi. ${pauseAfterExportMs} ms bekleniyor...`);
      await sleep(pauseAfterExportMs);

      const next = findNextPageButton();
      if (!next || isDisabled(next)) {
        log('Son sayfa veya ileri dugmesi kapali. Bitti.');
        break;
      }
      next.click();
      log(`Sonraki sayfa. ${pauseAfterPageMs} ms bekleniyor...`);
      await sleep(pauseAfterPageMs);
    }

    if (abortFlag) log('Durduruldu.');
    else log('Dongu tamamlandi.');
  }

  function ensurePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing && existing.isConnected) return;
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.id = PANEL_ID;
    Object.assign(wrap.style, {
      position: 'fixed',
      zIndex: '2147483646',
      right: '12px',
      bottom: '12px',
      width: '320px',
      maxHeight: '70vh',
      overflow: 'auto',
      background: '#1c1f26',
      color: '#e7e9ee',
      border: '1px solid #3d4454',
      borderRadius: '10px',
      padding: '12px',
      font: '13px/1.4 system-ui,Segoe UI,sans-serif',
      boxShadow: '0 8px 32px rgba(0,0,0,.45)',
    });

    wrap.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px;">Web Exporter — toplu export</div>
      <label style="display:block;margin:6px 0;">Export sonrasi bekleme (ms)
        <input id="web-exp-wait-export" type="number" value="5000" min="1000" step="500"
          style="width:100%;margin-top:4px;padding:6px;border-radius:6px;border:1px solid #555;background:#111;color:#eee;" />
      </label>
      <label style="display:block;margin:6px 0;">Sayfa degisimi sonrasi bekleme (ms)
        <input id="web-exp-wait-page" type="number" value="2000" min="500" step="250"
          style="width:100%;margin-top:4px;padding:6px;border-radius:6px;border:1px solid #555;background:#111;color:#eee;" />
      </label>
      <label style="display:block;margin:6px 0;">En fazla sayfa (3910/100 ≈ 40)
        <input id="web-exp-max-pages" type="number" value="50" min="1" max="500"
          style="width:100%;margin-top:4px;padding:6px;border-radius:6px;border:1px solid #555;background:#111;color:#eee;" />
      </label>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button id="web-exp-start" type="button"
          style="flex:1;padding:8px;border-radius:8px;border:none;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer;">Baslat</button>
        <button id="web-exp-stop" type="button"
          style="flex:1;padding:8px;border-radius:8px;border:1px solid #666;background:#2a2f3a;color:#eee;cursor:pointer;">Durdur</button>
      </div>
      <pre id="web-exp-log" style="margin-top:10px;white-space:pre-wrap;font-size:11px;color:#9ca3af;max-height:160px;overflow:auto;background:#111;padding:8px;border-radius:6px;"></pre>
      <div style="margin-top:8px;font-size:11px;color:#6b7280;">
        Once Web Exporter'da Bookmarks (veya Likes) tablosunu ac; "Rows per page" 100 olsun.
        Elementler bulunamazsa F12 ile secici gonder, script guncellenir.
      </div>
    `;

    document.documentElement.appendChild(wrap);

    const logEl = wrap.querySelector('#web-exp-log');
    function log(msg) {
      const line = `[${new Date().toLocaleTimeString('tr-TR')}] ${msg}\n`;
      logEl.textContent += line;
      logEl.scrollTop = logEl.scrollHeight;
    }

    wrap.querySelector('#web-exp-start').addEventListener('click', async () => {
      abortFlag = false;
      logEl.textContent = '';
      const pauseAfterExportMs = Number(wrap.querySelector('#web-exp-wait-export').value) || 5000;
      const pauseAfterPageMs = Number(wrap.querySelector('#web-exp-wait-page').value) || 2000;
      const maxPages = Number(wrap.querySelector('#web-exp-max-pages').value) || 50;
      log('Basladi.');
      await runBatch({ pauseAfterExportMs, pauseAfterPageMs, maxPages, log });
    });

    wrap.querySelector('#web-exp-stop').addEventListener('click', () => {
      abortFlag = true;
      log('Durdurma istegi alindi...');
    });
  }

  function watchSpaNavigation() {
    let last = location.href;
    const onRouteChange = () => {
      if (location.href !== last) {
        last = location.href;
        ensurePanel();
      }
    };
    setInterval(onRouteChange, 700);
    window.addEventListener('popstate', onRouteChange);
    const _push = history.pushState;
    const _replace = history.replaceState;
    history.pushState = function () {
      _push.apply(this, arguments);
      setTimeout(onRouteChange, 0);
    };
    history.replaceState = function () {
      _replace.apply(this, arguments);
      setTimeout(onRouteChange, 0);
    };
  }

  function boot() {
    ensurePanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      boot();
      watchSpaNavigation();
    });
  } else {
    boot();
    watchSpaNavigation();
  }
  [400, 1200, 2500, 5000].forEach((ms) => setTimeout(boot, ms));
})();
