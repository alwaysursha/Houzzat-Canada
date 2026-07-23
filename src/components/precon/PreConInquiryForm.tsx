"use client";

import { useState } from "react";
import { loadPersistedUtm } from "@/components/ads/UtmCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PreConInquiryForm({ mlsNumber }: { mlsNumber: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const res = await fetch("/api/pre-construction/inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mlsNumber,
        name,
        email,
        phone: phone || undefined,
        message: message || undefined,
        ...loadPersistedUtm(),
      }),
    });
    setPending(false);
    if (res.ok) setDone(true);
  }

  if (done) {
    return (
      <p className="rounded-xl border border-canopy/30 bg-canopy/5 px-4 py-3 text-sm text-canopy-deep">
        Thanks — a pre-construction specialist will reach out shortly.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input required type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <textarea
        className="min-h-20 w-full rounded-lg border border-line px-3 py-2 text-sm"
        placeholder="Which suites / budgets are you considering?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Request info"}
      </Button>
    </form>
  );
}
