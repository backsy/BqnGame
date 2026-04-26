// Main-thread wrapper around the BQN worker. Turns the postMessage protocol
// into Promise-returning methods, correlating requests and responses by id.

import BqnWorker from './worker?worker';
import type { Request, Response } from './protocol';

type Resolver = (r: Response) => void;

export class BqnClient {
	private worker: Worker;
	private pending = new Map<number, Resolver>();
	private nextId = 0;

	constructor() {
		this.worker = new BqnWorker();
		this.worker.addEventListener('message', (e: MessageEvent<Response>) => {
			const resolver = this.pending.get(e.data.id);
			if (!resolver) return;
			this.pending.delete(e.data.id);
			resolver(e.data);
		});
		this.worker.addEventListener('error', (e) => {
			// A worker-level script error (init failure, unhandled throw)
			// leaves every pending eval hanging. Surface it and drain the
			// queue so the UI doesn't sit on a stuck "running" state.
			console.error('[BqnWorker] error', e.message, e.filename, e.lineno);
			const msg = e.message || 'worker crashed';
			this.drain(`worker error: ${msg}`);
		});
		this.worker.addEventListener('messageerror', (e) => {
			console.error('[BqnWorker] messageerror', e);
			this.drain('worker message could not be deserialized');
		});
	}

	eval(source: string, timeoutMs = 5000): Promise<Response> {
		const id = this.nextId++;
		return new Promise((resolve) => {
			let settled = false;
			const settle = (r: Response) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				this.pending.delete(id);
				resolve(r);
			};
			this.pending.set(id, settle);
			const timer = setTimeout(
				() => settle({ id, kind: 'error', message: `eval timed out (${timeoutMs}ms)` }),
				timeoutMs
			);
			const req: Request = { id, kind: 'eval', source };
			try {
				this.worker.postMessage(req);
			} catch (err) {
				settle({ id, kind: 'error', message: `postMessage failed: ${err}` });
			}
		});
	}

	destroy() {
		this.worker.terminate();
		this.pending.clear();
	}

	private drain(message: string) {
		for (const [id, resolver] of this.pending) {
			resolver({ id, kind: 'error', message });
		}
		this.pending.clear();
	}
}
