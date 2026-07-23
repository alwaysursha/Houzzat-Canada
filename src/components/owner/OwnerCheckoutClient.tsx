"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/listings/constants";

export function OwnerCheckoutClient({
  orderId,
  totalAmount,
  mlsNumber,
}: {
  orderId: string;
  totalAmount: number;
  mlsNumber: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function payStub() {
    setPending(true);
    setMessage(null);
    const res = await fetch(`/api/owner/checkout/${orderId}`, {
      method: "POST",
    });
    const data = (await res.json()) as { error?: string; message?: string };
    setPending(false);
    if (!res.ok) {
      setMessage(data.error ?? "Payment failed.");
      return;
    }
    setMessage(data.message ?? "Payment recorded.");
    router.push("/owner");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 rounded-2xl border border-line bg-surface p-6">
      <div>
        <h1 className="font-display text-3xl text-ink">Checkout</h1>
        <p className="mt-2 text-sm text-ink/65">
          Listing {mlsNumber}. Stripe will be connected later — use the stub
          below to simulate payment in development.
        </p>
      </div>
      <p className="text-2xl font-semibold text-canopy">
        {formatPrice(totalAmount)}
      </p>
      <Button type="button" className="w-full" disabled={pending} onClick={payStub}>
        {pending ? "Processing…" : "Pay with Stripe (stub)"}
      </Button>
      {message ? <p className="text-sm text-ink/70">{message}</p> : null}
      <Link href="/owner" className="text-sm font-semibold text-canopy">
        Back to my listings
      </Link>
    </div>
  );
}
