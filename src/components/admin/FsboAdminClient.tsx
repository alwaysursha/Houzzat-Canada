"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatListPrice, formatPrice } from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";

type OwnerOrder = {
  id: string;
  totalAmount: number;
  paymentStatus: string;
};

type FsboListing = {
  id: string;
  mlsNumber: string;
  addressLine: string;
  city: string;
  listPrice: number;
  transactionType: "SALE" | "LEASE";
  ownerStatus: string | null;
  status: string;
  description: string;
  owner: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
  } | null;
  ownerOrders: OwnerOrder[];
  titleParties: { id: string; fullName: string }[];
};

const emptyForm = {
  transactionType: "SALE" as "SALE" | "LEASE",
  segment: "RESIDENTIAL" as "RESIDENTIAL" | "COMMERCIAL",
  propertyType: "DETACHED",
  listPrice: "",
  beds: "3",
  baths: "2",
  sqft: "",
  addressLine: "",
  city: "Toronto",
  community: "",
  postalCode: "",
  description: "",
  ownerEmail: "",
  publish: true,
};

export function FsboAdminClient() {
  const [items, setItems] = useState<FsboListing[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/fsbo");
    const data = (await res.json()) as { items: FsboListing[] };
    setItems(data.items ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createListing() {
    setMessage(null);
    const listPrice = Number(form.listPrice);
    if (!form.addressLine || !form.description || !Number.isFinite(listPrice)) {
      setMessage("Address, description, and price are required.");
      return;
    }
    const res = await fetch("/api/admin/fsbo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionType: form.transactionType,
        segment: form.segment,
        propertyType: form.propertyType,
        listPrice,
        beds: Number(form.beds) || 0,
        baths: Number(form.baths) || 0,
        sqft: form.sqft ? Number(form.sqft) : null,
        addressLine: form.addressLine,
        city: form.city,
        community: form.community || null,
        postalCode: form.postalCode || null,
        description: form.description,
        ownerEmail: form.ownerEmail || undefined,
        publish: form.publish,
      }),
    });
    if (!res.ok) {
      setMessage("Could not create listing.");
      return;
    }
    setForm(emptyForm);
    setMessage("Owner listing created (payment waived).");
    await load();
  }

  async function act(
    id: string,
    action: "approve" | "reject" | "pause" | "resume",
  ) {
    setBusyId(id);
    setMessage(null);
    const res = await fetch(`/api/admin/fsbo/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    if (!res.ok) {
      setMessage("Action failed.");
      return;
    }
    await load();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="font-semibold">Create free owner listing</h2>
        <p className="text-xs text-ink/55">
          Waives payment and can publish immediately without Stripe.
        </p>
        <select
          className="w-full rounded-lg border border-line px-3 py-2 text-sm"
          value={form.transactionType}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              transactionType: e.target.value as "SALE" | "LEASE",
            }))
          }
        >
          <option value="SALE">For sale (FSBO)</option>
          <option value="LEASE">For lease (FLBO)</option>
        </select>
        <select
          className="w-full rounded-lg border border-line px-3 py-2 text-sm"
          value={form.segment}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              segment: e.target.value as "RESIDENTIAL" | "COMMERCIAL",
            }))
          }
        >
          <option value="RESIDENTIAL">Residential</option>
          <option value="COMMERCIAL">Commercial</option>
        </select>
        <Input
          placeholder="Address"
          value={form.addressLine}
          onChange={(e) =>
            setForm((f) => ({ ...f, addressLine: e.target.value }))
          }
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="City"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          />
          <Input
            placeholder="Community"
            value={form.community}
            onChange={(e) =>
              setForm((f) => ({ ...f, community: e.target.value }))
            }
          />
        </div>
        <Input
          placeholder="Price / monthly rent"
          value={form.listPrice}
          onChange={(e) =>
            setForm((f) => ({ ...f, listPrice: e.target.value }))
          }
        />
        <div className="grid grid-cols-3 gap-2">
          <Input
            placeholder="Beds"
            value={form.beds}
            onChange={(e) => setForm((f) => ({ ...f, beds: e.target.value }))}
          />
          <Input
            placeholder="Baths"
            value={form.baths}
            onChange={(e) => setForm((f) => ({ ...f, baths: e.target.value }))}
          />
          <Input
            placeholder="Sqft"
            value={form.sqft}
            onChange={(e) => setForm((f) => ({ ...f, sqft: e.target.value }))}
          />
        </div>
        <textarea
          className="min-h-24 w-full rounded-lg border border-line px-3 py-2 text-sm"
          placeholder="Description"
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
        />
        <Input
          placeholder="Owner email (optional)"
          value={form.ownerEmail}
          onChange={(e) =>
            setForm((f) => ({ ...f, ownerEmail: e.target.value }))
          }
        />
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input
            type="checkbox"
            checked={form.publish}
            onChange={(e) =>
              setForm((f) => ({ ...f, publish: e.target.checked }))
            }
          />
          Publish immediately (ACTIVE)
        </label>
        <Button type="button" onClick={() => void createListing()}>
          Create listing
        </Button>
        {message ? <p className="text-sm text-ink/65">{message}</p> : null}
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold">Owner listings queue</h2>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface p-6 text-sm text-ink/55">
            No FSBO/FLBO listings yet.
          </p>
        ) : null}
        {items.map((listing) => {
          const order = listing.ownerOrders[0];
          return (
            <article
              key={listing.id}
              className="rounded-2xl border border-line bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-canopy">
                    {listing.transactionType === "LEASE" ? "FLBO" : "FSBO"} ·{" "}
                    {listing.ownerStatus}
                  </p>
                  <h3 className="font-display text-xl text-ink">
                    {listing.addressLine}
                  </h3>
                  <p className="text-sm text-ink/60">
                    {listing.city} ·{" "}
                    {formatListPrice(
                      listing.listPrice,
                      listing.transactionType,
                    )}{" "}
                    · {listing.mlsNumber}
                  </p>
                  <p className="mt-1 text-xs text-ink/50">
                    Owner:{" "}
                    {listing.owner
                      ? `${listing.owner.name ?? "—"} · ${listing.owner.email}`
                      : "Unassigned"}
                    {order
                      ? ` · Order ${formatPrice(order.totalAmount)} (${order.paymentStatus})`
                      : ""}
                  </p>
                  {listing.titleParties.length ? (
                    <p className="mt-1 text-xs text-ink/50">
                      Title:{" "}
                      {listing.titleParties.map((p) => p.fullName).join(", ")}
                    </p>
                  ) : null}
                </div>
                <Link
                  href={listingPath(listing)}
                  className="text-sm font-semibold text-canopy"
                >
                  Public page
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {listing.ownerStatus === "PENDING_REVIEW" ||
                listing.ownerStatus === "PENDING_PAYMENT" ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === listing.id}
                    onClick={() => void act(listing.id, "approve")}
                  >
                    Approve
                  </Button>
                ) : null}
                {listing.ownerStatus === "ACTIVE" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busyId === listing.id}
                    onClick={() => void act(listing.id, "pause")}
                  >
                    Pause
                  </Button>
                ) : null}
                {listing.ownerStatus === "PAUSED" ||
                listing.ownerStatus === "REJECTED" ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === listing.id}
                    onClick={() => void act(listing.id, "resume")}
                  >
                    Resume
                  </Button>
                ) : null}
                {listing.ownerStatus !== "REJECTED" &&
                listing.ownerStatus !== "CANCELLED" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busyId === listing.id}
                    onClick={() => void act(listing.id, "reject")}
                  >
                    Reject
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
