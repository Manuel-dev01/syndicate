"use client";

import { useQuery } from "@tanstack/react-query";

const INK = "#0a0a0a";
const MINT = "#16d97f";

interface DevnetInfo {
  ok: boolean;
  network?: string;
  endpoint?: string;
  offset?: number;
  count?: number;
  contracts?: { template: string; contractId: string }[];
}

async function fetchDevnet(): Promise<DevnetInfo> {
  const res = await fetch("/api/devnet", { cache: "no-store" });
  return (await res.json()) as DevnetInfo;
}

// A live proof strip: reads the REAL Canton DevNet validator and shows our on-ledger contracts.
// Renders nothing until it confirms a live ledger read (so previews without the secret stay clean).
export function DevNetBanner({ compact = false }: { compact?: boolean }) {
  const { data } = useQuery({ queryKey: ["devnet"], queryFn: fetchDevnet, refetchInterval: 30_000 });
  if (!data?.ok) return null;

  const templates = Array.from(new Set((data.contracts ?? []).map((c) => c.template)));
  const offset = data.offset?.toLocaleString() ?? "—";

  if (compact) {
    return (
      <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: MINT, animation: "sc-blink 1.8s infinite" }} />
        DevNet · offset {offset}
      </span>
    );
  }

  return (
    <div
      className="font-mono"
      style={{
        background: MINT,
        color: INK,
        borderBottom: `2px solid ${INK}`,
        padding: "8px 40px",
        display: "flex",
        alignItems: "center",
        gap: 18,
        flexWrap: "wrap",
        fontSize: 11,
        letterSpacing: ".08em",
        textTransform: "uppercase",
        fontWeight: 700,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: INK, animation: "sc-blink 1.6s infinite" }} />
        Live on Canton DevNet
      </span>
      <span style={{ opacity: 0.55 }}>ledger offset {offset}</span>
      <span style={{ opacity: 0.55 }}>
        {data.count} contract{data.count === 1 ? "" : "s"} on-ledger{templates.length ? `: ${templates.join(" · ")}` : ""}
      </span>
    </div>
  );
}
