#!/usr/bin/env node
// ライブ表示: セッション記録を監視し、変化があればブラウザへ送る。
//   node agent-town/server.mjs [--session <メイン記録.jsonl>] [--port 4173]
// 同じネットワーク内の別の端末 (iPad など) からも開ける。
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findLatestSession, readSession } from './extract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > -1 ? process.argv[i + 1] : fallback;
};
const port = Number(arg('port', 4173));
const fixed = arg('session', null);
const current = () => fixed ?? findLatestSession();

const clients = new Set();
let last = '';
setInterval(() => {
	if (!clients.size) return;
	const snap = readSession(current());
	const key = `${snap.raw.length}/${snap.agents.filter((a) => a.finished).length}/${snap.agents.length}`;
	if (key === last) return;
	last = key;
	for (const res of clients) res.write(`data: ${JSON.stringify(snap)}\n\n`);
}, 500);

http.createServer((req, res) => {
	if (req.url === '/events') {
		res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
		res.write(`data: ${JSON.stringify(readSession(current()))}\n\n`);
		clients.add(res);
		req.on('close', () => clients.delete(res));
		return;
	}
	if (req.url === '/' || req.url === '/index.html') {
		const page = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
		res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
		res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${page}`);
		return;
	}
	res.writeHead(404).end('not found');
}).listen(port, () => {
	console.log(`Agent Town: http://localhost:${port}`);
	for (const list of Object.values(os.networkInterfaces()))
		for (const n of list ?? []) if (n.family === 'IPv4' && !n.internal) console.log(`同じネットワークの端末から: http://${n.address}:${port}`);
	console.log(`監視中: ${current() ?? '(セッションの記録がまだありません)'}`);
});
