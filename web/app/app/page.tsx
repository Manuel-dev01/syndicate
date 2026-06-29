"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCopilot,
  fetchFacility,
  qk,
  settle,
  type CopilotProposal,
  type FacilityView,
  type SettleResult,
  type SettlementKind,
  type SettlementRecord,
} from "@/lib/api";
import { money, mult, pct } from "@/lib/format";

const INK = "#0a0a0a";
const MINT = "#16d97f";
const PAPER = "#f2f2f0";
const PANEL = "#fafaf8";
const HAIR = "#e4e4e0";

const STAGE_META: Record<string, { title: string; note: string }> = {
  origination: { title: "The deal & your slice", note: "Your private view of a facility six lenders share." },
  drawdown: { title: "Fund a drawdown", note: "Borrower draws; lender cash moves atomically." },
  interest: { title: "Distribute Q2 interest", note: "Cash in, accrual retired — one indivisible commit." },
  secondary: { title: "Trade on the secondary", note: "Lender-to-lender DvP; counterparty sealed." },
  repayment: { title: "Return principal", note: "Scheduled amortization to every holder." },
  maturity: { title: "Run to maturity", note: "Projected payoff and return on your slice." },
};

export default function DealSpine() {
  const qc = useQueryClient();
  const [active, setActive] = useState(0);
  const [flash, setFlash] = useState<SettlementRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: view } = useQuery({ queryKey: qk.facility, queryFn: fetchFacility });
  const stageKey = view?.lifecycle[active]?.key ?? "origination";

  const { data: copilot } = useQuery({
    queryKey: qk.copilot(stageKey),
    queryFn: () => fetchCopilot(stageKey),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (v: { kind: SettlementKind; args?: Record<string, number> }) => settle(v.kind, v.args),
    onMutate: () => {
      setErr(null);
      setFlash(null);
    },
    onSuccess: (r: SettleResult) => {
      setFlash(r.record);
      qc.invalidateQueries({ queryKey: qk.facility });
      qc.invalidateQueries({ queryKey: ["copilot"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const doSettle = (kind: SettlementKind, args?: Record<string, number>) =>
    mutation.mutate({ kind, args });

  if (!view) {
    return (
      <div className="font-mono" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#999" }}>
        Loading ledger…
      </div>
    );
  }

  const meta = STAGE_META[stageKey];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", color: INK, background: "#fff", overflow: "hidden" }}>
      <TopBar view={view} />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "312px 1fr 372px", overflow: "hidden" }}>
        <Spine view={view} active={active} setActive={setActive} />

        <div style={{ overflow: "auto", background: "#fff" }}>
          <div style={{ borderBottom: `2px solid ${INK}`, padding: "22px 30px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 2 }}>
            <div>
              <div className="font-mono" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>
                You are here · {view.lifecycle[active].label}
              </div>
              <div style={{ fontWeight: 700, fontSize: 30, letterSpacing: "-.035em", marginTop: 4 }}>{meta.title}</div>
            </div>
            <div className="font-mono" style={{ fontSize: 11, color: "#666", letterSpacing: ".06em", textAlign: "right", maxWidth: 230 }}>{meta.note}</div>
          </div>

          <div style={{ padding: 30 }}>
            {(flash || err) && (
              <SettleBanner record={flash} error={err} pending={mutation.isPending} />
            )}
            <Stage stageKey={stageKey} view={view} onSettle={doSettle} pending={mutation.isPending} />
          </div>
        </div>

        <CopilotRail copilot={copilot} stageKey={stageKey} onAuthorize={() => doSettle("interest")} pending={mutation.isPending} />
      </div>
    </div>
  );
}

function TopBar({ view }: { view: FacilityView }) {
  return (
    <div style={{ height: 60, borderBottom: `2px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flex: "0 0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Logo />
          <span style={{ fontWeight: 700, letterSpacing: "-.02em", fontSize: 17 }}>SYNDICATE</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 10, border: `2px solid ${INK}`, padding: "8px 14px", cursor: "pointer" }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{view.facility.name}</span>
          <span className="font-mono" style={{ fontSize: 11, color: "#666" }}>· {view.facility.tranche}</span>
          <span style={{ fontSize: 11, color: "#666" }}>▾</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div className="font-mono" style={{ display: "flex", alignItems: "center", gap: 8, border: "1.5px solid #e4e4e0", padding: "7px 12px", fontSize: 11, letterSpacing: ".08em", color: "#999" }}>
          <span>⌘K</span>
          <span>Command</span>
        </div>
        <div className="font-mono" style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: MINT, animation: "sc-blink 1.8s infinite" }} />
          Ledger live
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, borderLeft: "2px solid #e4e4e0", paddingLeft: 18 }}>
          <div style={{ width: 26, height: 26, background: INK, display: "grid", gridTemplateColumns: "7px 7px", gridTemplateRows: "7px 7px", gap: 2, padding: 5 }}>
            <div style={{ background: "#fff" }} />
            <div style={{ background: MINT }} />
            <div style={{ background: "#fff" }} />
            <div style={{ background: "#fff" }} />
          </div>
          <span className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em" }}>{view.position.lender.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}

function Spine({ view, active, setActive }: { view: FacilityView; active: number; setActive: (i: number) => void }) {
  const drawnPct = (view.position.drawn / view.position.commitment) * 100;
  return (
    <div style={{ borderRight: `2px solid ${INK}`, background: PANEL, padding: "28px 26px", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#666" }}>Deal lifecycle</div>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#999", marginTop: 4, letterSpacing: ".02em" }}>navigate the deal, not features</div>
      <div style={{ position: "relative", marginTop: 26, display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
        {view.lifecycle.map((n, i) => {
          const isActive = i === active;
          const dot = isActive
            ? { width: 24, height: 24, background: MINT, border: `3px solid ${INK}`, flex: "0 0 auto", marginLeft: -4 }
            : n.done
              ? { width: 16, height: 16, background: INK, flex: "0 0 auto" }
              : { width: 16, height: 16, border: "2px solid #999", background: "#fff", flex: "0 0 auto" };
          return (
            <div key={n.key} onClick={() => setActive(i)} style={{ display: "flex", alignItems: "center", gap: 16, cursor: "pointer", padding: "5px 0", opacity: isActive ? 1 : n.done ? 0.85 : 0.5 }}>
              <div style={dot as React.CSSProperties} />
              <div>
                <div style={{ fontWeight: 700, fontSize: isActive ? 19 : 15, letterSpacing: isActive ? "-.01em" : undefined }}>{n.label}</div>
                <div className="font-mono" style={{ fontSize: 11, color: isActive ? INK : "#999", fontWeight: isActive ? 700 : 400 }}>{n.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: `2px solid ${INK}`, paddingTop: 16, marginTop: 8 }}>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#666" }}>Your slice</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-.03em" }}>{money(view.position.drawn)}</span>
          <span className="font-mono" style={{ fontSize: 11, color: "#999" }}>{pct(view.position.holdPct)} hold</span>
        </div>
        <div style={{ marginTop: 8, height: 8, background: "#fff", border: `2px solid ${INK}` }}>
          <div style={{ width: `${drawnPct}%`, height: "100%", background: MINT }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Stage bodies ---------- */

function Stage(props: { stageKey: string; view: FacilityView; onSettle: (k: SettlementKind, a?: Record<string, number>) => void; pending: boolean }) {
  switch (props.stageKey) {
    case "drawdown":
      return <DrawdownStage {...props} />;
    case "interest":
      return <InterestStage {...props} />;
    case "secondary":
      return <SecondaryStage {...props} />;
    case "repayment":
      return <RepaymentStage {...props} />;
    case "maturity":
      return <MaturityStage {...props} />;
    default:
      return <OriginationStage {...props} />;
  }
}

function OriginationStage({ view }: { view: FacilityView }) {
  const p = view.position;
  const f = view.facility;
  const drawnPct = (p.drawn / p.commitment) * 100;
  const available = p.commitment - p.drawn;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 20 }}>
        <div style={{ border: `2px solid ${INK}`, background: MINT, padding: 24 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700 }}>Your position</div>
          <div style={{ fontWeight: 700, fontSize: 52, letterSpacing: "-.04em", marginTop: 8 }}>{money(p.drawn)}</div>
          <div className="font-mono" style={{ fontSize: 13, marginTop: 2 }}>drawn of {money(p.commitment)} committed</div>
          <div style={{ marginTop: 18, height: 12, background: INK, border: `2px solid ${INK}` }}>
            <div style={{ width: `${drawnPct}%`, height: "100%", background: "#fff" }} />
          </div>
          <div className="font-mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 7, fontWeight: 700 }}>
            <span>{drawnPct.toFixed(0)}% DRAWN</span>
            <span>{money(available)} AVAILABLE</span>
          </div>
        </div>
        <div style={{ border: `2px solid ${INK}`, background: "#fff", padding: 24 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, color: "#666" }}>Terms</div>
          <div className="font-mono" style={{ marginTop: 14, fontSize: 13, lineHeight: 2.3 }}>
            <Term k="Coupon" v={f.couponLabel} />
            <Term k="Maturity" v={f.maturityDate} />
            <Term k="Next interest" v={f.nextInterestDate} />
            <Term k="Seniority" v={f.seniority} last />
          </div>
        </div>
      </div>

      <div style={{ border: `2px solid ${INK}`, background: "#fff", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, color: "#666" }}>Syndicate · {f.lenderCount} lenders share this facility</div>
          <div className="font-mono" style={{ fontSize: 10, color: MINT, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700 }}>Others sealed by Daml</div>
        </div>
        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: `repeat(${f.lenderCount},1fr)`, gap: 10 }}>
          <div style={{ border: `2px solid ${INK}`, background: MINT, padding: 14, height: 92, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <span className="font-mono" style={{ fontSize: 10, fontWeight: 700 }}>YOU</span>
            <span style={{ fontWeight: 700, fontSize: 20 }}>{pct(p.holdPct)}</span>
          </div>
          {view.sealedLenders.map((s) => (
            <div key={s.index} style={{ border: `2px solid ${INK}`, background: INK, color: "#3a3a3a", padding: 14, height: 92, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".2em" }}>{"█".repeat(2 + ((s.index * 2) % 4))}</span>
              <span style={{ fontWeight: 700, fontSize: 20 }}>▓▓</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
        {view.covenants.map((c) => (
          <div key={c.key} style={{ border: `2px solid ${INK}`, background: "#fff", padding: "18px 20px" }}>
            <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#666" }}>{c.label}</div>
            <div style={{ fontWeight: 700, fontSize: 30, letterSpacing: "-.03em", marginTop: 4 }}>{mult(c.value)}</div>
            <div className="font-mono" style={{ fontSize: 10, color: c.ok ? MINT : "#a3611f", fontWeight: 700 }}>
              {c.kind === "floor" ? "FLOOR" : "CAP"} {mult(c.threshold)} · {c.ok ? "OK" : "BREACH"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Term({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderBottom: last ? undefined : "1px solid #e4e4e0" }}>
      <span style={{ color: "#666" }}>{k}</span>
      <span style={{ fontWeight: 700 }}>{v}</span>
    </div>
  );
}

function TwoLegCard({
  tag, both, leg1Label, leg1Value, leg2Label, leg2Value, cta, note, onClick, pending,
}: {
  tag: string; both: string; leg1Label: string; leg1Value: string; leg2Label: string; leg2Value: string;
  cta: string; note: string; onClick: () => void; pending: boolean;
}) {
  return (
    <div style={{ border: `2px solid ${INK}`, background: INK, color: PAPER, padding: 26 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#9a9a96" }}>{tag}</div>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>{both}</div>
      </div>
      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 56px 1fr", alignItems: "center" }}>
        <div style={{ border: `2px solid ${MINT}`, padding: 20 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>{leg1Label}</div>
          <div style={{ fontWeight: 700, fontSize: 34, letterSpacing: "-.03em", marginTop: 6 }}>{leg1Value}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 44, height: 44, border: `2px solid ${MINT}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 15, height: 15, background: MINT }} />
          </div>
        </div>
        <div style={{ border: "2px solid #2a2a2a", padding: 20 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#9a9a96", fontWeight: 700 }}>{leg2Label}</div>
          <div style={{ fontWeight: 700, fontSize: 34, letterSpacing: "-.03em", marginTop: 6 }}>{leg2Value}</div>
        </div>
      </div>
      <div style={{ marginTop: 22, display: "flex", gap: 14, alignItems: "center" }}>
        <button onClick={onClick} disabled={pending} className="font-mono" style={{ background: MINT, color: INK, padding: "15px 26px", fontWeight: 700, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase", border: "none", cursor: pending ? "wait" : "pointer", opacity: pending ? 0.6 : 1 }}>
          {pending ? "Settling…" : cta}
        </button>
        <div className="font-mono" style={{ fontSize: 11, color: "#9a9a96", lineHeight: 1.5 }}>{note}</div>
      </div>
    </div>
  );
}

function HistoryTable({ title, rows }: { title: string; rows: SettlementRecord[] }) {
  return (
    <div style={{ border: `2px solid ${INK}`, background: "#fff" }}>
      <div className="font-mono" style={{ padding: "12px 16px", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#666", background: PAPER, borderBottom: `2px solid ${INK}` }}>{title}</div>
      {rows.map((r, i) => (
        <div key={r.id} className="font-mono" style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", fontSize: 13, padding: "14px 16px", borderBottom: i < rows.length - 1 ? "1px solid #e4e4e0" : undefined, gap: 14 }}>
          <span style={{ fontFamily: "var(--font-space-mono)" }}>{r.label}</span>
          <span style={{ color: r.cashLeg >= 0 ? INK : "#444", fontWeight: r.cashLeg >= 0 ? 700 : 400 }}>{money(r.cashLeg, { sign: true })}</span>
          <span style={{ color: "#999", fontSize: 11 }}>{r.date} · {r.txRef}</span>
        </div>
      ))}
      {rows.length === 0 && <div className="font-mono" style={{ padding: "14px 16px", fontSize: 12, color: "#999" }}>No records yet.</div>}
    </div>
  );
}

function DrawdownStage({ view, onSettle, pending }: { view: FacilityView; onSettle: (k: SettlementKind, a?: Record<string, number>) => void; pending: boolean }) {
  const share = 4_000_000 * (view.position.holdPct / 100);
  const rows = view.history.filter((r) => r.kind === "drawdown");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <TwoLegCard
        tag="Atomic transaction · 2 legs" both="Both or neither"
        leg1Label="Leg 1 · Cash out" leg1Value={money(-share, { sign: true })}
        leg2Label="Leg 2 · Position up" leg2Value={money(share, { sign: true })}
        cta="Authorize drawdown →"
        note={`Borrower requests $4.0M; all ${view.facility.lenderCount} lenders' cash debits pro-rata in one indivisible commit.`}
        onClick={() => onSettle("drawdown", { amount: 4_000_000 })} pending={pending}
      />
      <HistoryTable title="Drawdown history · your slice" rows={rows} />
    </div>
  );
}

function InterestStage({ view, onSettle, pending }: { view: FacilityView; onSettle: (k: SettlementKind, a?: Record<string, number>) => void; pending: boolean }) {
  const accrued = view.position.accruedInterest;
  const rows = view.history.filter((r) => r.kind === "interest");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {accrued > 0 ? (
        <TwoLegCard
          tag={`Q2 interest distribution · atomic`} both={`${view.facility.lenderCount} holders · pro-rata`}
          leg1Label="Leg 1 · Cash in" leg1Value={money(accrued, { sign: true })}
          leg2Label="Leg 2 · Accrual" leg2Value="→ 0"
          cta="Settle atomically →"
          note="Co-pilot has proposed this sequence — authorize it here or in the rail. Daml checks signatory rights before commit."
          onClick={() => onSettle("interest")} pending={pending}
        />
      ) : (
        <div style={{ border: `2px solid ${INK}`, background: INK, color: PAPER, padding: 26 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>Q2 distributed</div>
          <div style={{ marginTop: 10, fontSize: 18, lineHeight: 1.4 }}>Accrual retired to zero and cash delivered to your slice — both legs in one transaction.</div>
        </div>
      )}
      <HistoryTable title="Recent settlements · your slice" rows={rows} />
    </div>
  );
}

function SecondaryStage({ view, onSettle, pending }: { view: FacilityView; onSettle: (k: SettlementKind, a?: Record<string, number>) => void; pending: boolean }) {
  const [notional, setNotional] = useState(8_000_000);
  const [price] = useState(99.25);
  const proceeds = notional * (price / 100);
  const book: [string, string, string][] = [
    ["BID", `99.25 · ${money(8_000_000)}`, MINT],
    ["BID", `99.10 · ${money(5_000_000)}`, MINT],
    ["OFFER", `99.60 · ${money(3_000_000)}`, "#a3611f"],
    ["OFFER", `99.80 · ${money(6_500_000)}`, "#a3611f"],
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div style={{ border: `2px solid ${INK}`, background: "#fff", padding: 24 }}>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, color: "#666" }}>Sell ticket · DvP</div>
        <Field label="Notional to sell" value={money(notional)} sub={`of ${money(view.position.drawn)}`} />
        <input type="range" min={1_000_000} max={Math.max(1_000_000, Math.round(view.position.drawn))} step={500_000} value={notional} onChange={(e) => setNotional(Number(e.target.value))} style={{ width: "100%", accentColor: MINT, marginTop: 10 }} />
        <Field label="Price" value={price.toFixed(2)} sub="/ par" />
        <Field label="Counterparty" value="Lender · ████ (sealed)" sub="" right={<span className="font-mono" style={{ fontSize: 11, color: MINT, fontWeight: 700 }}>MATCHED</span>} />
        <button onClick={() => onSettle("secondary", { notional, price })} disabled={pending} className="font-mono" style={{ marginTop: 20, width: "100%", background: MINT, border: "none", textAlign: "center", padding: 15, fontWeight: 700, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase", cursor: pending ? "wait" : "pointer", opacity: pending ? 0.6 : 1, color: INK }}>
          {pending ? "Executing…" : "Execute DvP →"}
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ border: `2px solid ${INK}`, background: "#fff", flex: 1 }}>
          <div className="font-mono" style={{ padding: "12px 16px", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#666", background: PAPER, borderBottom: `2px solid ${INK}` }}>Anonymized book</div>
          {book.map(([side, line, col], i) => (
            <div key={i} className="font-mono" style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", fontSize: 12, padding: "12px 16px", borderBottom: i < 3 ? "1px solid #e4e4e0" : undefined, alignItems: "center", gap: 10 }}>
              <span style={{ color: col, fontWeight: 700 }}>{side}</span>
              <span>{line}</span>
              <span style={{ color: "#999" }}>sealed</span>
            </div>
          ))}
        </div>
        <div style={{ border: `2px solid ${INK}`, background: INK, color: PAPER, padding: 20 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#9a9a96" }}>Trade preview</div>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 19 }}>{money(-notional, { sign: true })} slice</div>
              <div className="font-mono" style={{ fontSize: 11, color: "#9a9a96" }}>leaves your book</div>
            </div>
            <div style={{ color: MINT, fontSize: 20 }}>⇄</div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, fontSize: 19, color: MINT }}>{money(proceeds, { sign: true })} cash</div>
              <div className="font-mono" style={{ fontSize: 11, color: "#9a9a96" }}>net at {price.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, sub, right }: { label: string; value: string; sub: string; right?: React.ReactNode }) {
  return (
    <>
      <div className="font-mono" style={{ marginTop: 16, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "#999" }}>{label}</div>
      <div style={{ marginTop: 6, border: `2px solid ${INK}`, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: right ? 15 : 30, letterSpacing: "-.03em" }}>{value}</span>
        {right ?? <span className="font-mono" style={{ fontSize: 11, color: "#999" }}>{sub}</span>}
      </div>
    </>
  );
}

function RepaymentStage({ view, onSettle, pending }: { view: FacilityView; onSettle: (k: SettlementKind, a?: Record<string, number>) => void; pending: boolean }) {
  const amt = 1_200_000;
  const rows = view.history.filter((r) => r.kind === "repayment");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <TwoLegCard
        tag="Scheduled amortization · atomic" both="Due 06-30"
        leg1Label="Leg 1 · Cash in" leg1Value={money(amt, { sign: true })}
        leg2Label="Leg 2 · Position down" leg2Value={money(-amt, { sign: true })}
        cta="Authorize repayment →"
        note="Principal returns to you and your drawn balance amortizes in one indivisible commit."
        onClick={() => onSettle("repayment", { amount: amt })} pending={pending}
      />
      <div style={{ border: `2px solid ${INK}`, background: "#fff" }}>
        <div className="font-mono" style={{ padding: "12px 16px", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#666", background: PAPER, borderBottom: `2px solid ${INK}` }}>Repayment schedule · your slice</div>
        {[
          ["2026-06-30 · amortization", money(1_200_000, { sign: true }), "DUE"],
          ["2026-12-31 · amortization", money(1_200_000, { sign: true }), "scheduled"],
          ["2031-06-30 · bullet", money(25_200_000, { sign: true }), "at maturity"],
        ].map(([l, v, tag], i) => (
          <div key={i} className="font-mono" style={{ display: "grid", gridTemplateColumns: "1fr auto auto", alignItems: "center", fontSize: 13, padding: "14px 16px", borderBottom: i < 2 ? "1px solid #e4e4e0" : undefined, gap: 14 }}>
            <span>{l}</span>
            <span style={{ color: INK, fontWeight: tag === "DUE" ? 700 : 400 }}>{v}</span>
            <span style={tag === "DUE" ? { background: PAPER, border: "1.5px solid #c8772e", color: "#a3611f", padding: "3px 7px", fontSize: 9, fontWeight: 700 } : { color: "#999", fontSize: 11 }}>{tag}</span>
          </div>
        ))}
      </div>
      {rows.length > 0 && <HistoryTable title="Settled amortizations · your slice" rows={rows} />}
    </div>
  );
}

function MaturityStage({ view }: { view: FacilityView }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>
        <Metric bg={MINT} label="Projected payoff" value={money(view.position.commitment)} sub="full principal returned" />
        <Metric bg="#fff" label="Projected IRR" value="11.8%" sub="to your slice" subMint />
        <Metric bg="#fff" label="Final maturity" value="2031" sub="06-30 bullet" />
      </div>
      <div style={{ border: `2px solid ${INK}`, background: INK, color: PAPER, padding: 26 }}>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>Lifecycle complete · projection</div>
        <div style={{ marginTop: 12, fontWeight: 700, fontSize: 32, letterSpacing: "-.03em", lineHeight: 1.1 }}>
          At current trajectory, this facility retires fully at maturity — every leg along the way settled atomically, your
          slice private throughout.
        </div>
      </div>
    </div>
  );
}

function Metric({ bg, label, value, sub, subMint }: { bg: string; label: string; value: string; sub: string; subMint?: boolean }) {
  return (
    <div style={{ border: `2px solid ${INK}`, background: bg, padding: 22 }}>
      <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: bg === MINT ? 700 : 400, color: bg === MINT ? INK : "#666" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 40, letterSpacing: "-.04em", marginTop: 6 }}>{value}</div>
      <div className="font-mono" style={{ fontSize: 11, color: subMint ? MINT : bg === MINT ? INK : "#999", fontWeight: subMint ? 700 : 400 }}>{sub}</div>
    </div>
  );
}

function SettleBanner({ record, error, pending }: { record: SettlementRecord | null; error: string | null; pending: boolean }) {
  if (pending) return null;
  if (error) {
    return (
      <div className="font-mono" style={{ marginBottom: 20, border: "2px solid #c8772e", background: "#fdf4ec", color: "#a3611f", padding: "12px 16px", fontSize: 12, letterSpacing: ".04em" }}>
        ✕ Rejected — {error} <span style={{ color: "#666" }}>· nothing moved (all-or-nothing).</span>
      </div>
    );
  }
  if (record) {
    return (
      <div className="font-mono" style={{ marginBottom: 20, border: `2px solid ${INK}`, background: MINT, color: INK, padding: "12px 16px", fontSize: 12, letterSpacing: ".04em", fontWeight: 700 }}>
        ✓ Settled atomically · cash {money(record.cashLeg, { sign: true })} · position {money(record.positionLeg, { sign: true })} · {record.txRef}
      </div>
    );
  }
  return null;
}

/* ---------- Co-pilot rail ---------- */

function CopilotRail({ copilot, stageKey, onAuthorize, pending }: { copilot: CopilotProposal | undefined; stageKey: string; onAuthorize: () => void; pending: boolean }) {
  const tone = copilot?.tone ?? "watch";
  const tagColor = tone === "watch" ? "#a3611f" : tone === "propose" ? MINT : "#666";
  const showGate = stageKey === "interest";
  return (
    <div style={{ borderLeft: `2px solid ${INK}`, background: PANEL, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "20px 22px", borderBottom: `2px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "space-between", flex: "0 0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 11, height: 11, background: MINT }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-.01em" }}>Agent co-pilot</span>
        </div>
        <span className="font-mono" style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "#666", textAlign: "right" }}>
          {copilot?.source === "deepseek" ? "live · deepseek" : "constrained"}
          <br />by Daml
        </span>
      </div>
      <div style={{ padding: "20px 22px", overflow: "auto", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
        <div style={{ border: `2px solid ${INK}`, background: "#fff", padding: "16px 18px" }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700, color: tagColor }}>{copilot?.tag ?? "Reading…"}</div>
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: "#111" }}>{copilot?.body ?? "Reasoning over the borrower's private covenant data…"}</div>
          {copilot?.proposal && (
            <div className="font-mono" style={{ marginTop: 10, fontSize: 11, color: INK, fontWeight: 700, borderTop: "1px solid #e4e4e0", paddingTop: 8 }}>↳ {copilot.proposal}</div>
          )}
          <div className="font-mono" style={{ marginTop: 10, fontSize: 10, color: "#999", letterSpacing: ".04em" }}>Read scope: agent bank + borrower</div>
        </div>

        {showGate && (
          <div style={{ border: `2px solid ${MINT}`, background: MINT, padding: "16px 18px" }}>
            <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: INK, fontWeight: 700 }}>Daml authorization required</div>
            <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.45, color: INK }}>Agent proposes; the ledger executes only within signatory rights. Approve to authorize the batch.</div>
            <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
              <button onClick={onAuthorize} disabled={pending} className="font-mono" style={{ background: INK, color: "#fff", padding: "10px 18px", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", border: "none", cursor: pending ? "wait" : "pointer", opacity: pending ? 0.6 : 1 }}>Authorize</button>
              <button className="font-mono" style={{ background: MINT, border: `2px solid ${INK}`, color: INK, padding: "10px 18px", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>Decline</button>
            </div>
          </div>
        )}

        <div style={{ border: `2px solid ${INK}`, background: INK, color: PAPER, padding: 18 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#9a9a96" }}>Authority model</div>
          <div style={{ marginTop: 14 }}>
            <AuthRow color={MINT} label="Agent proposes" note="reads private borrower data" />
            <AuthRow color="#fff" label="Daml authorizes" note="signatory rights checked" />
            <AuthRow color={MINT} label="Ledger settles" note="" last />
          </div>
        </div>
      </div>
      <div className="font-mono" style={{ padding: "14px 22px", borderTop: `2px solid ${INK}`, flex: "0 0 auto", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "#666", letterSpacing: ".08em", textTransform: "uppercase" }}>7d · 14 proposed</span>
        <span style={{ fontSize: 10, color: MINT, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>11 authorized</span>
      </div>
    </div>
  );
}

function AuthRow({ color, label, note, last }: { color: string; label: string; note: string; last?: boolean }) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: note ? 10 : 0 }}>
        <span style={{ width: 10, height: 10, background: color, flex: "0 0 auto" }} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
      </div>
      {note && !last && <div style={{ borderLeft: "2px solid #2a2a2a", marginLeft: 4, padding: "0 0 10px 16px" }}><span className="font-mono" style={{ fontSize: 10, color: "#9a9a96" }}>{note}</span></div>}
    </>
  );
}

function Logo() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "8px 8px", gridTemplateRows: "8px 8px", gap: 2 }}>
      <div style={{ background: INK }} />
      <div style={{ background: MINT }} />
      <div style={{ background: INK }} />
      <div style={{ background: INK }} />
    </div>
  );
}
