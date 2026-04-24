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
	}

	eval(source: string): Promise<Response> {
		const id = this.nextId++;
		return new Promise((resolve) => {
			this.pending.set(id, resolve);
			const req: Request = { id, kind: 'eval', source };
			this.worker.postMessage(req);
		});
	}

	destroy() {
		this.worker.terminate();
		this.pending.clear();
	}
}
