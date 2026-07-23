"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Project = {
  id: string;
  mlsNumber: string;
  addressLine: string;
  city: string;
  community: string | null;
  listPrice: number;
  beds: number;
  baths: number;
  description: string;
  status: string;
};

const empty = {
  mlsNumber: "",
  addressLine: "",
  city: "Toronto",
  community: "",
  listPrice: "899000",
  beds: "0",
  baths: "0",
  description: "",
  imageUrl: "",
};

export function PreConAdminClient() {
  const [items, setItems] = useState<Project[]>([]);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/pre-construction");
    const data = (await res.json()) as { items: Project[] };
    setItems(data.items ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setMessage(null);
    const res = await fetch("/api/admin/pre-construction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editId,
        mlsNumber: form.mlsNumber,
        addressLine: form.addressLine,
        city: form.city,
        community: form.community || undefined,
        listPrice: Number(form.listPrice),
        beds: Number(form.beds),
        baths: Number(form.baths),
        description: form.description,
        imageUrl: form.imageUrl || undefined,
        published: true,
      }),
    });
    if (!res.ok) {
      setMessage("Could not save project.");
      return;
    }
    setForm(empty);
    setEditId(undefined);
    setMessage("Saved.");
    await load();
  }

  async function remove(id: string) {
    await fetch("/api/admin/pre-construction", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">
          {editId ? "Edit project" : "Add pre-construction project"}
        </h2>
        {(
          [
            ["mlsNumber", "Project code / MLS-like id"],
            ["addressLine", "Project name / address"],
            ["city", "City"],
            ["community", "Community"],
            ["listPrice", "From price"],
            ["beds", "Beds (0 ok)"],
            ["baths", "Baths"],
            ["imageUrl", "Image URL (optional)"],
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
        <label className="block space-y-1 text-sm">
          <span className="text-ink/50">Description</span>
          <textarea
            className="min-h-28 w-full rounded-lg border border-line px-3 py-2 text-sm"
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </label>
        {message ? <p className="text-sm text-canopy">{message}</p> : null}
        <Button type="button" onClick={save}>
          Save project
        </Button>
      </div>

      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-2xl border border-line bg-surface p-4 text-sm"
          >
            <p className="font-semibold">{item.addressLine}</p>
            <p className="text-ink/55">
              {item.city} · {item.mlsNumber} · ${item.listPrice.toLocaleString()}
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditId(item.id);
                  setForm({
                    mlsNumber: item.mlsNumber,
                    addressLine: item.addressLine,
                    city: item.city,
                    community: item.community ?? "",
                    listPrice: String(item.listPrice),
                    beds: String(item.beds),
                    baths: String(item.baths),
                    description: item.description,
                    imageUrl: "",
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
