// PWA share-target landing page (task D1, mvp-spec.md F2). Static route, no
// dynamic segment — prerenders to `share.html` same as `/add` and
// `/library`. `prerender`/`ssr` are already inherited from the root
// `+layout.ts` (the whole app prerenders as a client-only SPA shell); stated
// explicitly here too since this route's whole reason to exist is being a
// prerendered target the OS share sheet can navigate to.
export const prerender = true;
export const ssr = false;
