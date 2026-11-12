#!/usr/bin/env node
// 記録済みのセッションを埋め込んだ、単体で再生できる HTML を書き出す。
//   node agent-town/build.mjs <出力先.html> [--dir <subagentsフォルダ>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract, findLatestSubagentsDir } from './extract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) { console.error('出力先のファイル名を指定してください'); process.exit(1); }
const i = process.argv.indexOf('--dir');
const dir = i > -1 ? process.argv[i + 1] : findLatestSubagentsDir();

const data = extract(dir);
const json = JSON.stringify(data).replace(/</g, '\\u003c');
const marker = '<script id="town-data" type="application/json">null</script>';
const page = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
if (!page.includes(marker)) { console.error('index.html に埋め込み位置がありません'); process.exit(1); }
fs.writeFileSync(out, page.replace(marker, () => `<script id="town-data" type="application/json">${json}</script>`));
console.log(`${out}: エージェント ${data.agents.length} 体 / イベント ${data.events.length} 件`);
