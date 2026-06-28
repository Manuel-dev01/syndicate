/**
 * Placeholder landing. The institutional dashboard + role-switcher (the demo money shot)
 * reads live from Canton DevNet via the JSON Ledger API + TanStack Query.
 */
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Syndicate</h1>
      <p className="max-w-md text-center text-sm text-neutral-400">
        Confidential syndicated lending on the Canton Network — per-lender privacy and
        atomic cash-vs-position settlement, enforced at the ledger.
      </p>
    </main>
  );
}
