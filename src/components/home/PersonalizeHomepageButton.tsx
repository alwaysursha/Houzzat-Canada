"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { PersonalizeHomepageModal } from "@/components/home/PersonalizeHomepageModal";
import { Button } from "@/components/ui/button";

export function PersonalizeHomepageButton({
  cities,
}: {
  cities: string[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 border border-white/40 bg-white/15 text-white backdrop-blur hover:bg-white/25"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Personalized listings
      </Button>
      <PersonalizeHomepageModal
        open={open}
        onClose={() => setOpen(false)}
        cities={cities}
      />
    </>
  );
}
