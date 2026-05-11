// The harness uses DOM APIs (document.createElement) that do not exist during
// static prerendering. Disable prerender for this development-only route.
export const prerender = false;
export const ssr = false;
