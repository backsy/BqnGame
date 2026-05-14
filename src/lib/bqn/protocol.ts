// Shared message types between the main thread and the BQN worker.
// This file is imported from both sides and must stay pure — no browser
// APIs, no worker APIs.

export type Request =
	| { id: number; kind: 'eval'; source: string }
	| { id: number; kind: 'eval-structured'; source: string };

export type Response =
	| { id: number; kind: 'ok'; value: string }
	| { id: number; kind: 'ok-structured'; value: BqnStructuredValue }
	| { id: number; kind: 'error'; message: string };

// Structured snapshot of a BQN runtime value. Mirrors v2/BqnValue so the
// animator can consume it directly. The worker walks the post-eval BQN
// value (numbers, characters, arrays with .sh) and emits this shape — no
// re-parsing of fmt() output, no main-thread interpretation.
export type BqnStructuredValue =
	| { kind: 'number'; value: number }
	| { kind: 'char'; value: string }
	| { kind: 'array'; shape: number[]; data: BqnStructuredValue[] }
	| { kind: 'fn' }
	| { kind: 'namespace' };
