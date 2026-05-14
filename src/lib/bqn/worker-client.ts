// Web-Worker-backed BQN evaluator. Every BQN computation in the v2 harness
// (and any future caller that needs structured output) goes through this —
// there is NO main-thread evaluation, NO hand-rolled walk of FnExpr in the
// caller. The worker runs the real, unmodified BQN interpreter from
// vendor/bqn.js; the only main-thread responsibility is to ship source
// strings in and shape the structured reply.

import type { Request, Response, BqnStructuredValue } from './protocol';

type Pending = {
	resolve: (v: BqnStructuredValue) => void;
	reject: (err: Error) => void;
};

export class BqnWorkerClient {
	private worker: Worker;
	private nextId = 0;
	private pending = new Map<number, Pending>();

	constructor() {
		// Vite / SvelteKit-supported worker spawn pattern. The {type:'module'}
		// flag lets the worker use ESM imports (it imports vendor/bqn.js).
		this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
			type: 'module',
		});
		this.worker.addEventListener('message', (e: MessageEvent<Response>) => {
			const res = e.data;
			const p = this.pending.get(res.id);
			if (!p) return;
			this.pending.delete(res.id);
			if (res.kind === 'ok-structured') {
				p.resolve(res.value);
			} else if (res.kind === 'error') {
				p.reject(new Error(res.message));
			} else {
				p.reject(new Error(`unexpected response kind: ${res.kind}`));
			}
		});
	}

	// Send a BQN source string to the worker. The interpreter compiles and
	// runs it; the result is walked into a structured snapshot and returned.
	// No fallback path, no try/catch on the main thread that could mask
	// divergence — if BQN throws, this Promise rejects with BQN's own error.
	evalStructured(source: string): Promise<BqnStructuredValue> {
		const id = this.nextId++;
		return new Promise<BqnStructuredValue>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			const req: Request = { id, kind: 'eval-structured', source };
			this.worker.postMessage(req);
		});
	}

	destroy(): void {
		this.worker.terminate();
		this.pending.clear();
	}
}
