"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Landing = {
  id: string;
  slug: string;
  title: string;
  headline: string | null;
  subtitle: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  areaFocus: string | null;
  utmCampaign: string | null;
  published: boolean;
};

const empty = {
  slug: "",
  title: "",
  headline: "",
  subtitle: "",
  ctaLabel: "Book a consult",
  ctaHref: "/home-valuation",
  areaFocus: "",
  utmCampaign: "",
  published: false,
};

export function LandingAdminClient() {
  const [items, setItems] = useState<Landing[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/landings");
    const data = (await res.json()) as { items: Landing[] };
    setItems(data.items ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setMessage(null);
    const res = await fetch("/api/admin/landings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editId, ...form }),
    });
    if (!res.ok) {
      setMessage("Could not save.");
      return;
    }
    setForm(empty);
    setEditId(undefined);
    setMessage("Saved.");
    await load();
  }

  async function remove(id: string) {
    await fetch("/api/admin/landings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <h2 className="font-semibold">
          {editId ? "Edit landing" : "New landing page"}
        </h2>
        {(
          [
            ["slug", "Slug (url path)"],
            ["title", "Admin title"],
            ["headline", "Headline"],
            ["subtitle", "Subtitle"],
            ["areaFocus", "Area focus"],
            ["ctaLabel", "CTA label"],
            ["ctaHref", "CTA href"],
            ["utmCampaign", "UTM campaign"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block space-y-1 text-sm">
            <span className="text-ink/50">{label}</span>
            <Input
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            />
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) =>
              setForm((f) => ({ ...f, published: e.target.checked }))
            }
          />
          Published
        </label>
        {message ? <p className="text-sm text-canopy">{message}</p> : null}
        <Button type="button" onClick={save}>
          Save landing
        </Button>
      </div>

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-2xl border border-line bg-surface p-4 text-sm"
          >
            <p className="font-semibold">
              {item.title}{" "}
              <span className="text-ink/40">
                {item.published ? "· live" : "· draft"}
              </span>
            </p>
            <p className="text-ink/55">/lp/{item.slug}</p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditId(item.id);
                  setForm({
                    slug: item.slug,
                    title: item.title,
                    headline: item.headline ?? "",
                    subtitle: item.subtitle ?? "",
                    ctaLabel: item.ctaLabel ?? "Get started",
                    ctaHref: item.ctaHref ?? "/home-valuation",
                    areaFocus: item.areaFocus ?? "",
                    utmCampaign: item.utmCampaign ?? "",
                    published: item.published,
                  });
                }}
              >
                Edit
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => remove(item.id)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
