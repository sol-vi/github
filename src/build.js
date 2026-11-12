#!/usr/bin/env node
// THRIVE Instagram クリエイティブ生成スクリプト
//   node src/build.js            … すべて書き出し
//   node src/build.js f1         … F1（カルーセル）のみ
//   node src/build.js r4         … R4（リール＋カバー）のみ
// 原稿は content.json、ロゴは assets/ に置く（無い場合は枠を表示）。

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync, execSync } = require('child_process');
const { chromium } = require('playwright');
const { icon } = require('./icons');

const ROOT = path.resolve(__dirname, '..');
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'content.json'), 'utf8'));
const B = C.brand;
const BUILD = path.join(ROOT, 'build');
const OUT_F1 = path.join(ROOT, 'output/F1');
const OUT_R4 = path.join(ROOT, 'output/R4');
for (const d of [BUILD, OUT_F1, OUT_R4]) fs.mkdirSync(d, { recursive: true });

const report = { warnings: [], files: [] };

// ---------- 共通パーツ ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// [[ ]] を強調 span に変換
const rich = (s) => esc(s).replace(/\[\[(.+?)\]\]/g, '<span class="em">$1</span>');
const lines = (arr, cls = '') => arr.map((l) => `<div class="t ${cls}">${rich(l)}</div>`).join('');

function fontCss() {
  const f = (w) => `file://${path.join(ROOT, `fonts/noto-sans-jp-japanese-${w}-normal.woff2`)}`;
  return `
  @font-face { font-family: "Noto Sans JP"; font-weight: 500; src: url("${f(500)}") format("woff2"); }
  @font-face { font-family: "Noto Sans JP"; font-weight: 700; src: url("${f(700)}") format("woff2"); }`;
}

// ロゴ：ファイルがあれば画像、無ければ差し込み用の枠
function logo(onBlue, extraStyle = '') {
  const rel = onBlue ? B.logoWhite : B.logo;
  const abs = path.join(ROOT, rel);
  const pos = `position:absolute;left:${B.logoMargin}px;top:${B.logoMargin}px;width:${B.logoWidth}px;${extraStyle}`;
  if (fs.existsSync(abs)) {
    return `<img class="logo" data-logo="image" src="file://${abs}" style="${pos}height:auto;display:block">`;
  }
  if (!report.warnings.includes('logo')) report.warnings.push('logo');
  const col = onBlue ? B.white : B.blue;
  return `<div class="logo" data-logo="placeholder" style="${pos}height:60px;box-sizing:border-box;border:3px dashed ${col};
    color:${col};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;letter-spacing:.12em">LOGO</div>`;
}

function baseHtml(w, h, body, css = '') {
  // content.json の brand.fontScale で全ページの文字サイズを一括調整
  css = css.replace(/font-size:(\d+)px/g, (_, n) => `font-size:${Math.round(n * (B.fontScale ?? 1))}px`);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>
  ${fontCss()}
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:${w}px; height:${h}px; overflow:hidden; }
  body { font-family:${B.fontFamily}; font-weight:500; color:${B.black}; background:${B.white};
         position:relative; font-feature-settings:"palt" 0; -webkit-font-smoothing:antialiased; }
  .t { white-space:nowrap; }
  .bold { font-weight:700; }
  .icon { display:block; }
  ${css}
  </style></head><body>${body}</body></html>`;
}

// ---------- F1 ----------
const F1 = { W: 1080, H: 1350, SAFE: 80 };

function f1Page(p, i, total) {
  const onBlue = p.type !== 'item';
  const fg = onBlue ? B.white : B.black;
  const accent = onBlue ? B.white : B.blue;
  const itemIdx = C.F1.pages.slice(0, i + 1).filter((x) => x.type === 'item').length;
  const itemTotal = C.F1.pages.filter((x) => x.type === 'item').length;
  const isLast = i === total - 1;

  let main = '';
  if (p.type === 'cover') {
    main = `<div class="center">
      <div class="rule"></div>
      <div class="headline bold">${lines(p.headline)}</div>
    </div>`;
  } else if (p.type === 'item') {
    main = `<div class="num t bold">${itemIdx}/${itemTotal}</div>
    <div class="item ${p.big ? 'big' : ''}">
      <div class="iconwrap">${icon(p.icon, { width: p.icon === 'clock' ? 290 : p.icon === 'sofaCoat' ? 560 : 440, color: B.blue })}</div>
      <div class="rule"></div>
      <div class="itemtext bold">${lines(p.text)}</div>
    </div>`;
  } else if (p.type === 'closing') {
    main = `<div class="center">
      <div class="rule"></div>
      <div class="headline bold">${lines(p.headline)}</div>
      <div class="body">${lines(p.body)}</div>
    </div>
    <div class="actions">${icon('comment', { width: 96, color: B.white })}${icon('share', { width: 96, color: B.white })}</div>`;
  }
  const arrow = isLast ? '' : `<div class="next">${icon('next', { width: 84, color: accent })}</div>`;

  const css = `
  body { background:${onBlue ? B.blue : B.white}; color:${fg}; }
  .num { position:absolute; right:${F1.SAFE}px; top:${F1.SAFE + 10}px; font-size:40px; line-height:1; color:${B.blue}; letter-spacing:.04em; }
  .next { position:absolute; right:${F1.SAFE}px; bottom:${F1.SAFE}px; }
  .rule { width:120px; height:8px; background:${accent}; border-radius:4px; }
  .center { position:absolute; left:${F1.SAFE}px; right:${F1.SAFE}px; top:50%; transform:translateY(-50%); }
  .headline { font-size:100px; line-height:1.4; margin-top:56px; letter-spacing:.01em; }
  .body { font-size:48px; line-height:1.75; margin-top:64px; }
  .actions { position:absolute; left:${F1.SAFE}px; bottom:${F1.SAFE}px; display:flex; gap:56px; }
  .item { position:absolute; left:${F1.SAFE}px; right:${F1.SAFE}px; top:230px; }
  .iconwrap { height:380px; display:flex; align-items:center; }
  .item .rule { margin-top:72px; }
  .itemtext { font-size:96px; line-height:1.4; margin-top:48px; letter-spacing:.01em; }
  .item.big .iconwrap { height:300px; }
  .item.big .rule { margin-top:56px; }
  .item.big .itemtext { font-size:84px; line-height:1; margin-top:36px; }
  .item.big .itemtext .t { display:flex; align-items:baseline; height:250px; padding-top:20px; }
  .item.big .em { font-size:230px; line-height:1; color:${B.blue}; margin:0 10px; letter-spacing:-.02em; }
  `;
  return baseHtml(F1.W, F1.H, `${logo(onBlue)}${main}${arrow}`, css);
}

// ---------- R4 ----------
const R4 = { W: 1080, H: 1920, TOP: 285, BOTTOM: 1470 }; // 上250/下450回避 かつ 中央1080×1350 の共通範囲

function r4Html({ cover }) {
  const r = C.R4;
  const panel = (id, d, blue) => `
    <div id="${id}" class="panel ${blue ? 'blue' : 'white'}">
      <div class="label t bold">${esc(d.label)}</div>
      <div class="picon">${icon(d.icon, { width: 300, color: blue ? B.white : B.blue })}</div>
      <div class="ptext bold">${lines(d.text)}</div>
    </div>`;
  const body = cover
    ? `${logo(false, 'top:300px;')}<div id="title" class="cover bold">${lines(r.cover)}<div class="rule"></div></div>`
    : `${logo(false, 'top:300px;')}
       <div id="title" class="bold">${lines(r.title)}</div>
       ${panel('A', r.a, true)}${panel('B', r.b, false)}
       <div id="cta" class="bold">${lines(r.cta)}</div>`;
  const css = `
  #title { position:absolute; left:0; right:0; top:900px; text-align:center; font-size:104px; line-height:1.35;
           transform:translateY(-50%); transform-origin:50% 50%; z-index:3; will-change:transform; }
  #title.cover { font-size:168px; line-height:1.3; }
  #title.cover .rule { width:160px; height:10px; border-radius:5px; background:${B.blue}; margin:56px auto 0; }
  #title .t:nth-last-child(1 of .t) { color:${B.blue}; }
  .panel { position:absolute; top:610px; width:480px; height:680px; border-radius:28px; padding:44px 40px; opacity:0; }
  .panel.blue { left:48px; background:${B.blue}; color:${B.white}; }
  .panel.white { left:552px; background:${B.white}; color:${B.black}; border:6px solid ${B.blue}; padding:38px 34px; }
  .label { font-size:104px; line-height:1; }
  .panel.white .label { color:${B.blue}; }
  .picon { margin-top:44px; display:flex; justify-content:center; }
  .ptext { position:absolute; left:0; right:0; bottom:52px; text-align:center; font-size:60px; line-height:1.35; }
  #cta { position:absolute; left:0; right:0; top:1340px; text-align:center; font-size:58px; line-height:1.4; opacity:0; }
  `;
  // 時刻 t（秒）で画面状態を決める。最終フレームが先頭フレームに戻るように組んである。
  const script = cover ? '' : `<script>
  const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2; };
  const seg = (t, a, b) => ease((t - a) / (b - a));
  window.setTime = (t) => {
    const out = seg(t, 6.5, 6.9);                 // ループ用：最初の画面へ戻る
    const up = seg(t, 0.95, 1.45) * (1 - out);    // 見出しが上に移動して小さくなる
    const title = document.getElementById('title');
    title.style.transform = 'translateY(calc(-50% - ' + (430 * up) + 'px)) scale(' + (1 - 0.4 * up) + ')';
    const a = seg(t, 1.35, 1.85), b = seg(t, 2.9, 3.4), c = seg(t, 5.0, 5.45);
    const A = document.getElementById('A'), Bp = document.getElementById('B'), cta = document.getElementById('cta');
    A.style.opacity = a * (1 - out);  A.style.transform = 'translateX(' + (-70 * (1 - a)) + 'px)';
    Bp.style.opacity = b * (1 - out); Bp.style.transform = 'translateX(' + (70 * (1 - b)) + 'px)';
    cta.style.opacity = c * (1 - out); cta.style.transform = 'translateY(' + (30 * (1 - c)) + 'px)';
  };
  window.setTime(0);
  </script>`;
  return baseHtml(R4.W, R4.H, body + script, css);
}

// ---------- 検査 ----------
// 文字・ロゴが安全範囲に収まっているか、フォントの代替（豆腐・別書体）が無いか
async function inspect(page, name, box) {
  const res = await page.evaluate(async ({ box, fam }) => {
    await document.fonts.ready;
    const issues = [];
    const check = (el, kind, b) => {
      for (let e = el; e; e = e.parentElement) if (parseFloat(getComputedStyle(e).opacity) === 0) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = kind === 'text' ? [...range.getClientRects()] : [el.getBoundingClientRect()];
      for (const r of rects) {
        if (r.width === 0) continue;
        if (r.left < b.l - .5 || r.right > b.r + .5 || r.top < b.t - .5 || r.bottom > b.b + .5)
          issues.push(`${kind} はみ出し: "${(el.textContent || '').trim().slice(0, 14)}" [${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}]`);
      }
    };
    document.querySelectorAll('.t').forEach((el) => check(el, 'text', box.text));
    document.querySelectorAll('.logo, .icon').forEach((el) => check(el, 'graphic', box.graphic));
    // 使用文字がすべて Web フォントで描けているか（代替フォントと描画を比較）
    const chars = [...new Set([...document.querySelectorAll('.t')].map((e) => e.textContent).join(''))].filter((c) => c.trim());
    for (const w of [500, 700]) await document.fonts.load(`${w} 48px "Noto Sans JP"`, chars.join(''));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const draw = (font, ch) => { ctx.clearRect(0, 0, 64, 64); ctx.font = font; ctx.textBaseline = 'top'; ctx.fillText(ch, 4, 4); return ctx.getImageData(0, 0, 64, 64).data.join(); };
    const missing = [];
    for (const w of [500, 700]) for (const ch of chars)
      if (draw(`${w} 48px "Noto Sans JP", monospace`, ch) === draw(`${w} 48px monospace`, ch)) missing.push(`${ch}(${w})`);
    const usedFont = getComputedStyle(document.body).fontFamily;
    return { issues, missing, usedFont, logo: document.querySelector('.logo')?.dataset.logo };
  }, { box, fam: B.fontFamily });
  for (const m of res.issues) report.warnings.push(`${name}: ${m}`);
  if (res.missing.length) report.warnings.push(`${name}: フォントに無い文字 ${res.missing.join(' ')}`);
  return res;
}

// PNG に sRGB チャンクを付ける
function tagSrgb(file) {
  const buf = fs.readFileSync(file);
  if (buf.includes(Buffer.from('sRGB'))) return;
  const ihdrEnd = 8 + 4 + 4 + 13 + 4;
  const type = Buffer.from('sRGB'), data = Buffer.from([0]);
  const len = Buffer.alloc(4); len.writeUInt32BE(1);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([type, data])) >>> 0);
  fs.writeFileSync(file, Buffer.concat([buf.subarray(0, ihdrEnd), len, type, data, crc, buf.subarray(ihdrEnd)]));
}

async function shot(page, file) {
  await page.screenshot({ path: file, type: 'png' });
  tagSrgb(file);
  report.files.push(file);
}

async function load(page, name, html) {
  const f = path.join(BUILD, `${name}.html`);
  fs.writeFileSync(f, html);
  await page.goto(`file://${f}`);
  await page.evaluate(() => document.fonts.ready);
}

// ---------- 実行 ----------
(async () => {
  const only = (process.argv[2] || 'all').toLowerCase();
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--allow-file-access-from-files'] });

  if (only === 'all' || only === 'f1') {
    const page = await browser.newPage({ viewport: { width: F1.W, height: F1.H }, deviceScaleFactor: 1 });
    const pages = C.F1.pages;
    for (let i = 0; i < pages.length; i++) {
      const name = `F1_${String(i + 1).padStart(2, '0')}`;
      await load(page, name, f1Page(pages[i], i, pages.length));
      const S = F1.SAFE;
      await inspect(page, name, {
        text: { l: S, t: S, r: F1.W - S, b: F1.H - S },
        graphic: { l: B.logoMargin, t: B.logoMargin, r: F1.W - B.logoMargin, b: F1.H - B.logoMargin }
      });
      await shot(page, path.join(OUT_F1, `${name}.png`));
    }
    await page.close();
  }

  if (only === 'all' || only === 'r4') {
    const page = await browser.newPage({ viewport: { width: R4.W, height: R4.H }, deviceScaleFactor: 1 });
    const box = { l: B.logoMargin, t: R4.TOP, r: R4.W - B.logoMargin, b: R4.BOTTOM };
    // カバー
    await load(page, 'R4_cover', r4Html({ cover: true }));
    await inspect(page, 'R4_cover', { text: box, graphic: box });
    await shot(page, path.join(OUT_R4, 'R4_cover.png'));
    // 動画フレーム
    await load(page, 'R4', r4Html({ cover: false }));
    const fps = C.R4.fps, n = Math.round(C.R4.duration * fps);
    const fdir = path.join(BUILD, 'frames');
    fs.rmSync(fdir, { recursive: true, force: true });
    fs.mkdirSync(fdir, { recursive: true });
    for (let i = 0; i < n; i++) {
      const t = i / fps;
      await page.evaluate((t) => window.setTime(t), t);
      if ([0, 2.5, 4.5, 6.2].some((k) => Math.abs(t - k) < 1e-6)) await inspect(page, `R4@${t}s`, { text: box, graphic: box });
      await page.screenshot({ path: path.join(fdir, `f${String(i).padStart(4, '0')}.png`), type: 'png' });
    }
    const mp4 = path.join(OUT_R4, 'R4.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(fdir, 'f%04d.png'),
      '-an', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '14', '-preset', 'slow',
      '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
      '-r', String(fps), '-movflags', '+faststart', mp4]);
    report.files.push(mp4);
    await page.close();
  }
  await browser.close();

  // ---------- レポート ----------
  let yu = false;
  try { yu = /yu ?gothic|游ゴシック/i.test(execSync('fc-list', { encoding: 'utf8' })); } catch {}
  console.log('\n== 出力ファイル ==');
  for (const f of report.files) console.log(`${path.relative(ROOT, f).padEnd(26)} ${(fs.statSync(f).size / 1024).toFixed(0).padStart(6)} KB`);
  console.log(`\nフォント: ${yu ? '游ゴシックを使用' : '游ゴシックが環境に無いため Noto Sans JP（Medium 500 / Bold 700）で代替'}`);
  const w = report.warnings.filter((x) => x !== 'logo');
  if (report.warnings.includes('logo')) console.log('ロゴ: assets にロゴファイルが無いため、差し込み用の枠（破線）を表示しています');
  console.log(w.length ? `\n!! 要確認 ${w.length} 件\n` + w.join('\n') : '\n文字・ロゴ・アイコンのはみ出し、フォント欠けはありません');
})();
