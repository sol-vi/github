// Claude Code のセッション記録 (メイン <session>.jsonl と subagents/agent-<id>.jsonl) を
// ページに渡せる軽い形に整える。記録の解釈そのものは index.html 側で行う。依存パッケージなし。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const clip = (s, n = 120) => {
	s = String(s ?? '').replace(/\s+/g, ' ').trim();
	return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const KEEP = ['description', 'command', 'file_path', 'pattern', 'url', 'query', 'prompt', 'path', 'skill',
	'subject', 'activeForm', 'taskId', 'status', 'subagent_type'];

function slimInput(input = {}) {
	const out = {};
	for (const k of KEEP) if (input[k] != null) out[k] = clip(input[k]);
	if (Array.isArray(input.todos)) out.todos = input.todos.map((t) => ({ content: clip(t.content, 80), status: t.status }));
	return out;
}
function slimContent(content) {
	if (typeof content === 'string') return clip(content, 80);
	if (!Array.isArray(content)) return [];
	return content.map((b) =>
		b.type === 'tool_use' ? { type: 'tool_use', id: b.id, name: b.name, input: slimInput(b.input) }
		: b.type === 'tool_result' ? { type: 'tool_result', tool_use_id: b.tool_use_id, is_error: !!b.is_error }
		: b.type === 'text' ? { type: 'text', text: clip(b.text, 80) }
		: { type: b.type });
}

const cache = new Map(); // ファイルが変わったときだけ読み直す
function readLines(file, who) {
	const st = fs.statSync(file), hit = cache.get(file);
	if (hit && hit.size === st.size && hit.mtime === st.mtimeMs) return hit.rows;
	const rows = [];
	for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
		if (!line) continue;
		let d;
		try { d = JSON.parse(line); } catch { continue; } // 書き込み途中の行は飛ばす
		if ((d.type !== 'user' && d.type !== 'assistant') || !d.message) continue;
		const t = Date.parse(d.timestamp);
		if (!t) continue;
		const tur = d.toolUseResult && typeof d.toolUseResult === 'object'
			? { task: d.toolUseResult.task ? { id: d.toolUseResult.task.id } : undefined, isAsync: d.toolUseResult.isAsync }
			: undefined;
		rows.push({ t, w: who, role: d.type, content: slimContent(d.message.content), tur, meta: d.isMeta || undefined });
	}
	cache.set(file, { size: st.size, mtime: st.mtimeMs, rows });
	return rows;
}

// 現在の作業ディレクトリに対応する、いちばん新しいセッションのメイン記録を探す
export function findLatestSession(cwd = process.cwd()) {
	const root = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
	if (!fs.existsSync(root)) return null;
	const files = fs.readdirSync(root).filter((f) => f.endsWith('.jsonl'))
		.map((f) => path.join(root, f))
		.map((f) => ({ f, m: fs.statSync(f).mtimeMs }))
		.sort((a, b) => b.m - a.m);
	return files[0]?.f ?? null;
}

export function readSession(mainFile) {
	const raw = [], agents = [];
	if (!mainFile || !fs.existsSync(mainFile)) return { raw, agents, now: Date.now() };
	raw.push(...readLines(mainFile, 'main'));

	const sub = path.join(mainFile.replace(/\.jsonl$/, ''), 'subagents');
	if (fs.existsSync(sub)) {
		for (const f of fs.readdirSync(sub).filter((f) => /^agent-.*\.jsonl$/.test(f)).sort()) {
			const id = f.slice(6, -6);
			let meta = {};
			try { meta = JSON.parse(fs.readFileSync(path.join(sub, `agent-${id}.meta.json`), 'utf8')); } catch {}
			const key = meta.toolUseId ?? id; // メイン側の Agent 呼び出しと同じ鍵でそろえる
			agents.push({ key, type: meta.agentType, desc: meta.description, finished: !!meta.finished });
			raw.push(...readLines(path.join(sub, f), key));
		}
	}
	return { raw, agents, now: Date.now() };
}
