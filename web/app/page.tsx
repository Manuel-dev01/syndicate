/**
 * Placeholder landing. The real institutional dashboard + role-switcher (the demo money shot)
 * lands in Phase 5, reading live from Canton DevNet via the JSON Ledger API + TanStack Query.
 */
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Syndicate</h1>
      <p className="max-w-md text-center text-sm text-neutral-400">
        Confidential syndicated lending on the Canton Network. The role-switcher dashboard
        lands in Phase 5 — Daml privacy partition and atomic settlement come first.
      </p>
    </main>
  );
}
