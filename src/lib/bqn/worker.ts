/// <reference lib="webworker" />

// Mock BQN worker. Stands in for CBQN-wasm until the real interpreter is
// wired up, so we can iterate on the message contract and UI states without
// fighting the wasm build.
//
// Behavior: pretend to evaluate `source` after a small artificial delay,
// returning a canned result. Empty input is an error — exercises the error
// path end-to-end.

import type { Request, Response } from './protocol';

const ctx = self as DedicatedWorkerGlobalScope;
const post = (msg: Response) => ctx.postMessage(msg);

ctx.addEventListener('message', async (e: MessageEvent<Request>) => {
	const req = e.data;
	if (req.kind !== 'eval') return;

	await new Promise((r) => setTimeout(r, 30));

	const src = req.source.trim();
	if (!src) {
		post({ id: req.id, kind: 'error', message: 'empty input' });
		return;
	}
	post({ id: req.id, kind: 'ok', value: `(mock) ${src}` });
});
