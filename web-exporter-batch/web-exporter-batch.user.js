// ==UserScript==
// @name        Web Exporter — sayfa sayfa export
// @namespace   local-web-exporter-batch
// @version     1.1.1
// @description Bookmarks/Likes: sec, Export Data, sonraki sayfa (100’luk sayfalar)
// @match       https://x.com/*
// @match       https://www.x.com/*
// @match       https://twitter.com/*
// @match       https://www.twitter.com/*
// @run-at      document-end
// @noframes
// @grant       none
// ==/UserScript==

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
    if (el.getAttribute('aria-checked') === 'true') return true;
    if (el.dataset && el.dataset.state === 'checked') return true;
    if (el.classList && (el.classList.contains('checked') || el.classList.contains('is-checked')))
      return true;
    return false;
  }

  /**
   * React/Shadcn vb. UI'larda ham .click() state'i guncellemeyebilir.
   * Gercek kullanici gibi pointer + mouse + click olaylarini dispatch eder,
   * native input'ta "checked"'i native setter ile degistirir.
   */
  function realisticClick(el) {
    try {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0 };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerType: 'mouse', pointerId: 1, isPrimary: true }));
      el.dispatchEvent(new MouseEvent('mousedown', base));
      el.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerType: 'mouse', pointerId: 1, isPrimary: true }));
      el.dispatchEvent(new MouseEvent('mouseup', base));
      el.dispatchEvent(new MouseEvent('click', base));
    } catch (_) {
      try { el.click(); } catch (__) {}
    }

    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      try {
        const proto = Object.getPrototypeOf(el);
        const desc = Object.getOwnPropertyDescriptor(proto, 'checked');
        if (desc && desc.set) desc.set.call(el, !el.checked ? true : el.checked);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {}
    }
  }

  /** Tiklamak icin: asil hedef bazen kardes/label. En "tiklanabilir" ataya cik. */
  function resolveClickTarget(el) {
    if (el instanceof HTMLInputElement) {
      const lbl = el.closest('label');
      if (lbl) return lbl;
      return el;
    }
    let cur = el;
    for (let i = 0; i < 4 && cur; i++) {
      const role = cur.getAttribute && cur.getAttribute('role');
      if (role === 'checkbox' || cur.tagName === 'BUTTON' || cur.tagName === 'LABEL') return cur;
      cur = cur.parentElement;
    }
    return el;
  }

  /** Ayni hucrede hem gizli input hem gorunen kontrol varsa tekillestir */
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

  /** Export dugmesinin ustundeki genis modal — satir kutulari burada aranir (basliktaki "hepsini sec" dislanir) */
  function findWebExporterTableRoot(exportBtn) {
    let el = exportBtn.parentElement;
    for (let i = 0; i < 24 && el; i++) {
      const r = el.getBoundingClientRect();
      if (r.width >= 400 && r.height >= 220) return el;
      el = el.parentElement;
    }
    return exportBtn.parentElement || document.documentElement;
  }

  /**
   * Basliktaki ilk kutu tum veritabanini seciyor; onu atla.
   * Sadece tablo satirlarindaki kutulara tikla (sayfadaki ~100 satir).
   */
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

  /**
   * @param {object} opts
   * @param {number} [opts.fromRow] 1 tabanli; dahil
   * @param {number} [opts.toRow] 1 tabanli; dahil. 0/undefined -> sona kadar
   */
  async function selectCurrentPageRowsOnly(log, root, opts = {}) {
    const rows = findDataRowCheckboxes(root);
    if (!rows.length) {
      log('Uyari: Satir kutusu bulunamadi. Bookmarks tablosu ve Exporter paneli acik olsun.');
      return 0;
    }
    const from = Math.max(1, opts.fromRow || 1);
    const to = opts.toRow && opts.toRow > 0 ? opts.toRow : rows.length;
    let clicks = 0;
    let considered = 0;
    let stillUnchecked = 0;
    for (let i = 0; i < rows.length; i++) {
      if (abortFlag) break;
      const rowNo = i + 1;
      if (rowNo < from || rowNo > to) continue;
      considered++;
      const cb = rows[i];
      if (isDisabled(cb)) continue;
      if (isChecked(cb)) continue;

      const target = resolveClickTarget(cb);
      realisticClick(target);
      await sleep(20);
      if (!isChecked(cb)) {
        realisticClick(cb);
        await sleep(20);
      }
      if (isChecked(cb)) clicks++;
      else stillUnchecked++;
    }
    log(
      `Bu sayfa: ${rows.length} satir; aralik ${from}-${to}; secilen ${clicks}, seçilemeyen ${stillUnchecked}.`
    );
    return clicks;
  }

  function parseSkipList(str) {
    const set = new Set();
    if (!str) return set;
    for (const part of String(str).split(/[,\s]+/)) {
      if (!part) continue;
      const m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
      if (m) {
        const a = Math.min(+m[1], +m[2]);
        const b = Math.max(+m[1], +m[2]);
        for (let i = a; i <= b; i++) set.add(i);
      } else if (/^\d+$/.test(part)) {
        set.add(Number(part));
      }
    }
    return set;
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
    const {
      pauseAfterExportMs,
      pauseAfterPageMs,
      maxPages,
      startPage,
      skipPages,
      rowFrom,
      rowTo,
      log,
    } = opts;

    let page = Math.max(1, startPage || 1) - 1;
    let processed = 0;

    while (!abortFlag && processed < maxPages) {
      page++;
      processed++;
      log(`Sayfa ${page}: isleniyor...`);

      const exportBtn =
        findByLabelIncludes(['export data', 'export']) ||
        findByLabelIncludes(['veriyi dışa aktar', 'disa aktar']);

      if (!exportBtn) {
        log('Hata: "Export Data" butonu bulunamadi. Panel acik ve Bookmarks sekmesinde misin?');
        break;
      }

      if (skipPages && skipPages.has(page)) {
        log(`Sayfa ${page}: atlaniyor (skip listesinde). Secim yapilmadi, export yok.`);
      } else {
        const tableRoot = findWebExporterTableRoot(exportBtn);
        const clicks = await selectCurrentPageRowsOnly(log, tableRoot, {
          fromRow: rowFrom,
          toRow: rowTo,
        });
        await sleep(300);

        if (clicks > 0) {
          exportBtn.click();
          log(`Sayfa ${page}: Export Data tiklandi. ${pauseAfterExportMs} ms bekleniyor...`);
          await sleep(pauseAfterExportMs);
        } else {
          log(`Sayfa ${page}: hic satir secilmedi; export atlandi.`);
        }
      }

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

    const inp = 'width:100%;margin-top:4px;padding:6px;border-radius:6px;border:1px solid #555;background:#111;color:#eee;';
    wrap.innerHTML = `
      <div style="font-weight:600;margin-bottom:8px;">Web Exporter — toplu export</div>

      <div style="display:flex;gap:8px;">
        <label style="flex:1;">Baslangic sayfasi
          <input id="web-exp-start-page" type="number" value="1" min="1" style="${inp}" />
        </label>
        <label style="flex:1;">Kac sayfa ilerle
          <input id="web-exp-max-pages" type="number" value="50" min="1" max="500" style="${inp}" />
        </label>
      </div>

      <label style="display:block;margin:8px 0 0;">Atlanacak sayfalar (ör: 31, 87-88)
        <input id="web-exp-skip" type="text" placeholder="ornek: 31, 87-88" style="${inp}" />
      </label>

      <div style="display:flex;gap:8px;margin-top:8px;">
        <label style="flex:1;">Satir baslangic
          <input id="web-exp-row-from" type="number" value="1" min="1" style="${inp}" />
        </label>
        <label style="flex:1;">Satir bitis (0=son)
          <input id="web-exp-row-to" type="number" value="0" min="0" style="${inp}" />
        </label>
      </div>

      <div style="display:flex;gap:8px;margin-top:8px;">
        <label style="flex:1;">Export sonrasi (ms)
          <input id="web-exp-wait-export" type="number" value="5000" min="1000" step="500" style="${inp}" />
        </label>
        <label style="flex:1;">Sayfa sonrasi (ms)
          <input id="web-exp-wait-page" type="number" value="2000" min="500" step="250" style="${inp}" />
        </label>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button id="web-exp-start" type="button"
          style="flex:1;padding:8px;border-radius:8px;border:none;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer;">Baslat</button>
        <button id="web-exp-stop" type="button"
          style="flex:1;padding:8px;border-radius:8px;border:1px solid #666;background:#2a2f3a;color:#eee;cursor:pointer;">Durdur</button>
      </div>
      <pre id="web-exp-log" style="margin-top:10px;white-space:pre-wrap;font-size:11px;color:#9ca3af;max-height:160px;overflow:auto;background:#111;padding:8px;border-radius:6px;"></pre>
      <div style="margin-top:8px;font-size:11px;color:#6b7280;">
        Bookmarks acik olsun; Rows per page 100. Basliktaki kutuya basmiyor.<br>
        Atla: bozuk sayfalari listeye ekle (ornek: <b>31, 87-88</b>). Tekrar calistirip sadece o sayfalari denersin.
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
      const startPage = Number(wrap.querySelector('#web-exp-start-page').value) || 1;
      const rowFrom = Number(wrap.querySelector('#web-exp-row-from').value) || 1;
      const rowTo = Number(wrap.querySelector('#web-exp-row-to').value) || 0;
      const skipPages = parseSkipList(wrap.querySelector('#web-exp-skip').value);
      log(
        `Basladi. Baslangic=${startPage}, adim=${maxPages}, satir=${rowFrom}-${rowTo || 'son'}, skip=[${Array.from(
          skipPages
        ).join(',')}]`
      );
      await runBatch({
        pauseAfterExportMs,
        pauseAfterPageMs,
        maxPages,
        startPage,
        skipPages,
        rowFrom,
        rowTo,
        log,
      });
    });

    wrap.querySelector('#web-exp-stop').addEventListener('click', () => {
      abortFlag = true;
      log('Durdurma istegi alindi...');
    });
  }

  /** X/Twitter SPA: tam yenileme olmadan URL degisince betik yeniden calismaz */
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
