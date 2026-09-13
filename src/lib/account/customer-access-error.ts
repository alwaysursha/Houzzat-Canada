/** Client helper for product-API 401/403 bodies from denyUnlessFullCustomerAccess. */

export type CustomerAccessDenial = {
  requiresAuth: boolean;
  requiresEmailVerification: boolean;
};

export function customerAccessDenialFromBody(
  status: number,
  data: unknown,
): CustomerAccessDenial {
  const payload =
    data && typeof data === "object"
      ? (data as { requiresAuth?: unknown; requiresEmailVerification?: unknown })
      : null;
  const requiresAuth =
    status === 401 || payload?.requiresAuth === true;
  const requiresEmailVerification =
    payload?.requiresEmailVerification === true || status === 403;
  return { requiresAuth, requiresEmailVerification };
}
