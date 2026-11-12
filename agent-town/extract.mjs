// Claude Code のサブエージェント記録 (subagents/agent-<id>.jsonl) を
// 可視化用のイベント列に変換する。依存パッケージなし。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const clip = (s, n = 90) => {
	s = String(s ?? '').replace(/\s+/g, ' ').trim();
	return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

function detailOf(name, input = {}) {
	if (name === 'SubagentHandback') return '結果を本部へ報告';
	const v = input.description ?? input.command ?? input.file_path ?? input.pattern
		?? input.url ?? input.query ?? input.prompt ?? input.path ?? '';
	return clip(v);
}

// 現在の作業ディレクトリに対応する、いちばん新しいセッションの subagents フォルダを探す
export function findLatestSubagentsDir(cwd = process.cwd()) {
	const root = path.join(os.homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
	if (!fs.existsSync(root)) return null;
	const dirs = fs.readdirSync(root)
		.map((d) => path.join(root, d, 'subagents'))
		.filter((d) => fs.existsSync(d))
		.map((d) => ({ d, m: fs.statSync(d).mtimeMs }))
		.sort((a, b) => b.m - a.m);
	return dirs[0]?.d ?? null;
}

export function extract(dir) {
	const agents = [];
	const events = [];
	if (!dir || !fs.existsSync(dir)) return { agents, events, now: Date.now() };

	for (const f of fs.readdirSync(dir).filter((f) => /^agent-.*\.jsonl$/.test(f)).sort()) {
		const id = f.slice(6, -6);
		let meta = {};
		try { meta = JSON.parse(fs.readFileSync(path.join(dir, `agent-${id}.meta.json`), 'utf8')); } catch {}
		const agent = { id, type: meta.agentType ?? 'agent', desc: meta.description ?? id, finished: !!meta.finished, start: null, end: null, tools: 0 };

		for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
			if (!line) continue;
			let d;
			try { d = JSON.parse(line); } catch { continue; } // 書き込み途中の行は飛ばす
			const t = Date.parse(d.timestamp);
			if (!t) continue;
			agent.start ??= t;
			agent.end = t;
			const content = d.message?.content;
			if (!Array.isArray(content)) continue;
			for (const b of content) {
				if (d.type === 'assistant' && b.type === 'tool_use') {
					agent.tools++;
					events.push({ t, a: id, k: 'tool', tool: b.name, detail: detailOf(b.name, b.input), id: b.id });
				} else if (d.type === 'assistant' && b.type === 'thinking') {
					events.push({ t, a: id, k: 'think' });
				} else if (d.type === 'user' && b.type === 'tool_result') {
					events.push({ t, a: id, k: 'result', id: b.tool_use_id, err: !!b.is_error });
				}
			}
		}
		if (agent.start) {
			events.push({ t: agent.start, a: id, k: 'spawn' });
			if (agent.finished) events.push({ t: agent.end, a: id, k: 'done' });
			agents.push(agent);
		}
	}
	const order = { spawn: 0, think: 1, tool: 2, result: 3, done: 4 };
	events.sort((x, y) => x.t - y.t || order[x.k] - order[y.k]);
	agents.sort((x, y) => x.start - y.start);
	return { agents, events, now: Date.now() };
}
