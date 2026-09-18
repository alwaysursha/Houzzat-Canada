/** Preserve /account/* deep links when the account layout gates an unsigned visitor. */

export function accountSignInCallbackPath(requestPath: string): string {
  let path = requestPath.trim();
  if (path.startsWith("http")) {
    try {
      path = new URL(path).pathname;
    } catch {
      // keep raw
    }
  }
  const query = path.indexOf("?");
  if (query >= 0) path = path.slice(0, query);
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1) || "/";
  }
  if (path === "/account" || path.startsWith("/account/")) {
    return path;
  }
  return "/account";
}

export function accountSignInHref(requestPath: string): string {
  return `/auth/sign-in?callbackUrl=${encodeURIComponent(
    accountSignInCallbackPath(requestPath),
  )}`;
}
