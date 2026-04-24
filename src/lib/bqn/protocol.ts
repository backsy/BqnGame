// Shared message types between the main thread and the BQN worker.
// This file is imported from both sides and must stay pure — no browser
// APIs, no worker APIs.

export type Request = { id: number; kind: 'eval'; source: string };

export type Response =
	| { id: number; kind: 'ok'; value: string }
	| { id: number; kind: 'error'; message: string };
