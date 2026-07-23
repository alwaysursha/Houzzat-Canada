"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Partner = { id: string; name: string; type: string };
type Handoff = {
  id: string;
  token: string;
  status: string;
  customerName: string | null;
  partner: Partner;
};

export function HandoffClient({ leadId }: { leadId?: string }) {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/agent/handoffs");
    if (!res.ok) return;
    const data = (await res.json()) as {
      partners: Partner[];
      handoffs: Handoff[];
    };
    setPartners(data.partners ?? []);
    setHandoffs(data.handoffs ?? []);
    if (!partnerId && data.partners?.[0]) setPartnerId(data.partners[0].id);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send() {
    setMessage(null);
    const res = await fetch("/api/agent/handoffs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partnerId,
        leadId,
        notes: notes || undefined,
      }),
    });
    const data = (await res.json()) as {
      error?: string;
      trackUrl?: string;
    };
    if (!res.ok) {
      setMessage(data.error ?? "Failed");
      return;
    }
    setTrackUrl(data.trackUrl ?? null);
    setMessage("Handoff sent.");
    setNotes("");
    await load();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-semibold">Refer to partner</h2>
      <select
        className="w-full rounded-lg border border-line px-3 py-2 text-sm"
        value={partnerId}
        onChange={(e) => setPartnerId(e.target.value)}
      >
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.type} · {p.name}
          </option>
        ))}
      </select>
      <Input
        placeholder="Notes for partner"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <Button type="button" onClick={() => void send()} disabled={!partnerId}>
        Send handoff
      </Button>
      {message ? <p className="text-sm text-ink/65">{message}</p> : null}
      {trackUrl ? (
        <p className="break-all text-xs text-canopy">{trackUrl}</p>
      ) : null}

      {handoffs.length > 0 ? (
        <ul className="space-y-2 border-t border-line pt-3 text-sm">
          {handoffs.slice(0, 5).map((h) => (
            <li key={h.id} className="flex justify-between gap-2">
              <span>
                {h.partner.name} · {h.customerName ?? "client"}
              </span>
              <span className="text-ink/45">{h.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
