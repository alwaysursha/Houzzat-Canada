/** Stage 5.6 — minimal layout for tenant-branded public Viewings share pages. */
export default function ViewingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[var(--mist)] text-[var(--ink)]">{children}</div>
  );
}
