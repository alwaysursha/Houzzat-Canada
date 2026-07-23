"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Partner = {
  id: string;
  type: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  bio: string | null;
  active: boolean;
  portalToken: string;
};

const empty = {
  type: "MORTGAGE",
  name: "",
  company: "",
  email: "",
  phone: "",
  city: "Toronto",
  bio: "",
};

export function PartnersAdminClient() {
  const [items, setItems] = useState<Partner[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/partners");
    const data = (await res.json()) as { items: Partner[] };
    setItems(data.items ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setMessage(null);
    const res = await fetch("/api/admin/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editId,
        type: form.type,
        name: form.name,
        company: form.company || undefined,
        email: form.email,
        phone: form.phone || undefined,
        city: form.city || undefined,
        bio: form.bio || undefined,
        active: true,
      }),
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

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">{editId ? "Edit partner" : "New partner"}</h2>
        <select
          className="w-full rounded-lg border border-line px-3 py-2 text-sm"
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
        >
          <option value="MORTGAGE">Mortgage</option>
          <option value="LAWYER">Lawyer</option>
          <option value="INSPECTOR">Inspector</option>
          <option value="OTHER">Other</option>
        </select>
        <Input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Input
          placeholder="Company"
          value={form.company}
          onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
        />
        <Input
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <Input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
        <Input
          placeholder="City"
          value={form.city}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
        />
        <textarea
          className="min-h-24 w-full rounded-lg border border-line px-3 py-2 text-sm"
          placeholder="Bio"
          value={form.bio}
          onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
        />
        <Button type="button" onClick={() => void save()}>
          Save
        </Button>
        {message ? <p className="text-sm text-ink/60">{message}</p> : null}
      </div>

      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {items.map((p) => (
          <li key={p.id} className="space-y-2 px-4 py-3 text-sm">
            <div className="flex justify-between gap-2">
              <div>
                <p className="font-medium">
                  {p.name} · {p.type}
                </p>
                <p className="text-ink/55">{p.email}</p>
              </div>
              <button
                type="button"
                className="text-canopy"
                onClick={() => {
                  setEditId(p.id);
                  setForm({
                    type: p.type,
                    name: p.name,
                    company: p.company ?? "",
                    email: p.email,
                    phone: p.phone ?? "",
                    city: p.city ?? "",
                    bio: p.bio ?? "",
                  });
                }}
              >
                Edit
              </button>
            </div>
            <p className="break-all text-xs text-ink/40">
              Portal: /partners/portal/{p.portalToken}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
