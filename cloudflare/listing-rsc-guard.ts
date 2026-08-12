/**
 * OpenNext on Cloudflare 500s `/listing/...` RSC when the client sends
 * `Next-Router-State-Tree`. Plain RSC (RSC: 1, no tree) returns 200.
 *
 * Strip the tree header on listing RSC only — before OpenNext/Next see it.
 * Full-document listing requests (no RSC header) are unchanged.
 */

function isListingPath(pathname: string) {
  return pathname === "/listing" || pathname.startsWith("/listing/");
}

function isRscRequest(request: Request) {
  const rsc = request.headers.get("RSC") ?? request.headers.get("rsc");
  return rsc === "1";
}

function hasRouterStateTree(request: Request) {
  return (
    request.headers.has("Next-Router-State-Tree") ||
    request.headers.has("next-router-state-tree")
  );
}

export function stripListingRscRouterStateTree(request: Request): Request {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return request;
  }

  if (
    !isListingPath(pathname) ||
    !isRscRequest(request) ||
    !hasRouterStateTree(request)
  ) {
    return request;
  }

  const headers = new Headers(request.headers);
  headers.delete("Next-Router-State-Tree");
  headers.delete("next-router-state-tree");
  return new Request(request, { headers });
}
