"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCopilot,
  fetchFacility,
  qk,
  ROLES,
  settle,
  type CopilotProposal,
  type FacilityView,
  type Role,
  type SettleResult,
  type SettlementKind,
  type SettlementRecord,
} from "@/lib/api";
import { money, mult, pct } from "@/lib/format";
import { useIsMobile } from "@/lib/useIsMobile";

const INK = "#0a0a0a";
const MINT = "#16d97f";
const RED = "#c8372e";
const PAPER = "#f2f2f0";
const PANEL = "#fafaf8";

const NORMAL_DRAW = 4_000_000;
const STRESS_DRAW = 150_000_000;

const STAGE_META: Record<string, { title: string; note: string }> = {
  origination: { title: "The deal & the partition", note: "One facility, six lenders — each sees only its own slice." },
  drawdown: { title: "Fund a drawdown", note: "Borrower draws; lender cash moves atomically — unless a covenant blocks it." },
  interest: { title: "Distribute Q2 interest", note: "Cash in, accrual retired — one indivisible commit." },
  secondary: { title: "Trade on the secondary", note: "Lender-to-lender DvP; counterparty sealed." },
  repayment: { title: "Return principal", note: "Scheduled amortization to every holder." },
  maturity: { title: "Run to maturity", note: "Projected payoff and return on the slice." },
};

const isLenderRole = (r: Role) => r === "lenderA" || r === "lenderB" || r === "lenderC";

export default function DealSpine() {
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const [role, setRole] = useState<Role>("lenderA");
  const [active, setActive] = useState(0);
  const [drawAmount, setDrawAmount] = useState<number>(NORMAL_DRAW);
  const [inspector, setInspector] = useState(false);
  const [flash, setFlash] = useState<SettlementRecord | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: view, isError, refetch, isFetching } = useQuery({ queryKey: qk.facility(role), queryFn: () => fetchFacility(role) });
  const stageKey = view?.lifecycle[active]?.key ?? "origination";
  const copilotAmount = stageKey === "drawdown" ? drawAmount : undefined;

  const { data: copilot } = useQuery({
    queryKey: qk.copilot(stageKey, role, copilotAmount),
    queryFn: () => fetchCopilot(stageKey, role, copilotAmount),
    staleTime: 30_000,
  });

  // A settlement result belongs to the stage it was fired on — clear it when the user navigates away
  // so a banner never lingers on an unrelated stage.
  useEffect(() => {
    setFlash(null);
    setErr(null);
  }, [active]);

  const mutation = useMutation({
    mutationFn: (v: { kind: SettlementKind; args?: Record<string, number> }) => settle(v.kind, role, v.args),
    onMutate: () => {
      setErr(null);
      setFlash(null);
    },
    onSuccess: (r: SettleResult) => {
      setFlash(r.record);
      qc.invalidateQueries({ queryKey: ["facility"] });
      qc.invalidateQueries({ queryKey: ["copilot"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const doSettle = (kind: SettlementKind, args?: Record<string, number>) => mutation.mutate({ kind, args });

  const switchRole = (r: Role) => {
    setRole(r);
    setFlash(null);
    setErr(null);
  };

  if (!view) {
    if (isError) {
      return (
        <div className="font-mono" style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: RED, fontWeight: 700 }}>Ledger unavailable</div>
          <div style={{ fontSize: 13, color: "#666", maxWidth: 340, lineHeight: 1.6 }}>Couldn&apos;t load the facility. This is usually a cold start — retry in a moment.</div>
          <button onClick={() => refetch()} disabled={isFetching} className="font-mono" style={{ background: INK, color: "#fff", border: "none", padding: "12px 22px", fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", cursor: isFetching ? "wait" : "pointer" }}>
            {isFetching ? "Retrying…" : "Retry"}
          </button>
        </div>
      );
    }
    return (
      <div className="font-mono" style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", color: "#999" }}>
        Loading ledger…
      </div>
    );
  }

  const meta = STAGE_META[stageKey];
  const assessment = copilot?.assessment;
  const onAuthorize = () => {
    if (!assessment || assessment.choice === "none") return;
    if (assessment.choice === "secondary" && !isLenderRole(role)) return; // agent bank / borrower can't trade
    doSettle(assessment.choice as SettlementKind, assessment.args);
  };

  return (
    <div style={{ minHeight: "100vh", height: isMobile ? "auto" : "100vh", display: "flex", flexDirection: "column", color: INK, background: "#fff", overflow: isMobile ? "visible" : "hidden" }}>
      <TopBar view={view} role={role} onRole={switchRole} onInspect={() => setInspector((v) => !v)} inspecting={inspector} isMobile={isMobile} />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "312px 1fr 372px", overflow: isMobile ? "visible" : "hidden" }}>
        <Spine view={view} active={active} setActive={setActive} isMobile={isMobile} />

        <div style={{ overflow: isMobile ? "visible" : "auto", background: "#fff", minWidth: 0 }}>
          <div style={{ borderBottom: `2px solid ${INK}`, padding: isMobile ? "16px 18px" : "22px 30px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", position: isMobile ? "static" : "sticky", top: 0, background: "#fff", zIndex: 2 }}>
            <div>
              <div className="font-mono" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>
                {view.viewerLabel} · {view.lifecycle[active].label}
              </div>
              <div style={{ fontWeight: 700, fontSize: isMobile ? 24 : 30, letterSpacing: "-.035em", marginTop: 4 }}>{meta.title}</div>
            </div>
            <div className="font-mono" style={{ fontSize: 11, color: "#666", letterSpacing: ".06em", textAlign: isMobile ? "left" : "right", maxWidth: 240 }}>{meta.note}</div>
          </div>

          <div style={{ padding: isMobile ? 18 : 30 }}>
            {inspector && <PrivacyInspector role={role} onClose={() => setInspector(false)} />}
            {(flash || err) && <SettleBanner record={flash} error={err} pending={mutation.isPending} />}
            <Stage
              stageKey={stageKey}
              view={view}
              copilot={copilot}
              drawAmount={drawAmount}
              setDrawAmount={setDrawAmount}
              onSettle={doSettle}
              pending={mutation.isPending}
              isMobile={isMobile}
            />
          </div>
        </div>

        <CopilotRail copilot={copilot} view={view} onAuthorize={onAuthorize} pending={mutation.isPending} isMobile={isMobile} />
      </div>
    </div>
  );
}

/* ---------- Top bar + role switcher ---------- */

function TopBar({ view, role, onRole, onInspect, inspecting, isMobile }: { view: FacilityView; role: Role; onRole: (r: Role) => void; onInspect: () => void; inspecting: boolean; isMobile: boolean }) {
  return (
    <div style={{ minHeight: 60, borderBottom: `2px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "10px 14px" : "0 24px", flex: "0 0 auto", flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 20 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <Logo />
          <span style={{ fontWeight: 700, letterSpacing: "-.02em", fontSize: 17 }}>SYNDICATE</span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: `2px solid ${INK}`, padding: "7px 12px" }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{view.facility.name}</span>
          {!isMobile && <span className="font-mono" style={{ fontSize: 11, color: "#666" }}>· {view.facility.tranche}</span>}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", maxWidth: "100%" }}>
        {!isMobile && <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#999" }}>View as</span>}
        <div style={{ display: "flex", border: `2px solid ${INK}`, overflowX: "auto", maxWidth: "100%" }}>
          {ROLES.map((r) => {
            const on = r.key === role;
            return (
              <button
                key={r.key}
                onClick={() => onRole(r.key)}
                className="font-mono"
                style={{
                  padding: "8px 13px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  border: "none",
                  borderRight: r.key === "borrower" ? "none" : "2px solid " + INK,
                  cursor: "pointer",
                  background: on ? INK : "#fff",
                  color: on ? MINT : INK,
                  whiteSpace: "nowrap",
                  flex: "0 0 auto",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={onInspect}
          className="font-mono"
          style={{ display: "flex", alignItems: "center", gap: 8, border: `2px solid ${inspecting ? MINT : "#e4e4e0"}`, background: inspecting ? MINT : "#fff", padding: "8px 12px", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", cursor: "pointer", color: INK, whiteSpace: "nowrap" }}
        >
          What others see
        </button>
      </div>
    </div>
  );
}

/* ---------- Privacy inspector (the partition, as a matrix) ---------- */

type Cell = "yes" | "no" | "na";
const FACETS: { label: string; hint: string; cells: Record<Role, Cell> }[] = [
  { label: "Facility terms", hint: "coupon, maturity, seniority", cells: { borrower: "yes", agentBank: "yes", lenderA: "yes", lenderB: "yes", lenderC: "yes" } },
  { label: "Covenant ratios", hint: "DSCR, leverage, interest cover", cells: { borrower: "yes", agentBank: "yes", lenderA: "yes", lenderB: "yes", lenderC: "yes" } },
  { label: "Own position", hint: "your commitment & drawn", cells: { borrower: "na", agentBank: "yes", lenderA: "yes", lenderB: "yes", lenderC: "yes" } },
  { label: "Other lenders' positions", hint: "a competitor's slice", cells: { borrower: "no", agentBank: "yes", lenderA: "no", lenderB: "no", lenderC: "no" } },
  { label: "Full loan tape", hint: "every slice at once", cells: { borrower: "no", agentBank: "yes", lenderA: "no", lenderB: "no", lenderC: "no" } },
  { label: "Borrower private financials", hint: "revenue, EBITDA, debt", cells: { borrower: "yes", agentBank: "yes", lenderA: "no", lenderB: "no", lenderC: "no" } },
];

function PrivacyInspector({ role, onClose }: { role: Role; onClose: () => void }) {
  return (
    <div style={{ border: `2px solid ${INK}`, background: "#fff", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: INK, color: PAPER }}>
        <span className="font-mono" style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700 }}>What each party can see · the Daml partition</span>
        <button onClick={onClose} className="font-mono" style={{ background: "none", border: "none", color: MINT, fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: ".08em", textTransform: "uppercase" }}>Close ✕</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="font-mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 16px", borderBottom: `2px solid ${INK}`, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#666" }}>Data</th>
              {ROLES.map((r) => (
                <th key={r.key} style={{ padding: "10px 12px", borderBottom: `2px solid ${INK}`, borderLeft: "1px solid #e4e4e0", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", background: r.key === role ? MINT : "#fff", color: INK }}>
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FACETS.map((f, i) => (
              <tr key={f.label}>
                <td style={{ padding: "11px 16px", borderBottom: i < FACETS.length - 1 ? "1px solid #e4e4e0" : undefined }}>
                  <div style={{ fontWeight: 700 }}>{f.label}</div>
                  <div style={{ fontSize: 10, color: "#999" }}>{f.hint}</div>
                </td>
                {ROLES.map((r) => (
                  <td key={r.key} style={{ textAlign: "center", padding: "11px 12px", borderBottom: i < FACETS.length - 1 ? "1px solid #e4e4e0" : undefined, borderLeft: "1px solid #e4e4e0", background: r.key === role ? "rgba(22,217,127,.09)" : undefined }}>
                    <CellMark v={f.cells[r.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="font-mono" style={{ padding: "10px 16px", borderTop: `2px solid ${INK}`, fontSize: 10, color: "#666", letterSpacing: ".04em" }}>
        Every ✕ is a Daml signatory/observer boundary — the data never enters that party&apos;s view, not just its screen.
      </div>
    </div>
  );
}

function CellMark({ v }: { v: Cell }) {
  if (v === "yes") return <span style={{ color: MINT, fontWeight: 700, fontSize: 15 }}>✓</span>;
  if (v === "no") return <span style={{ color: RED, fontWeight: 700, fontSize: 15 }}>✕</span>;
  return <span style={{ color: "#bbb" }}>—</span>;
}

/* ---------- Spine ---------- */

function Spine({ view, active, setActive, isMobile }: { view: FacilityView; active: number; setActive: (i: number) => void; isMobile: boolean }) {
  const drawnPct = view.position.commitment > 0 ? (view.position.drawn / view.position.commitment) * 100 : 0;
  const sliceLabel = view.role === "agentBank" ? "Facility · all lenders" : view.role === "borrower" ? "Facility drawn" : "Your slice";
  return (
    <div style={{ borderRight: isMobile ? undefined : `2px solid ${INK}`, borderBottom: isMobile ? `2px solid ${INK}` : undefined, background: PANEL, padding: isMobile ? "20px 18px" : "28px 26px", position: "relative", overflow: isMobile ? "visible" : "hidden", display: "flex", flexDirection: "column" }}>
      <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#666" }}>Deal lifecycle</div>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#999", marginTop: 4, letterSpacing: ".02em" }}>navigate the deal, not features</div>
      <div style={{ position: "relative", marginTop: 22, display: "flex", flexDirection: isMobile ? "row" : "column", flexWrap: isMobile ? "wrap" : "nowrap", gap: isMobile ? 10 : 14, flex: isMobile ? "0 0 auto" : 1 }}>
        {view.lifecycle.map((n, i) => {
          const isActive = i === active;
          const dot = isActive
            ? { width: 24, height: 24, background: MINT, border: `3px solid ${INK}`, flex: "0 0 auto", marginLeft: isMobile ? 0 : -4 }
            : n.done
              ? { width: 16, height: 16, background: INK, flex: "0 0 auto" }
              : { width: 16, height: 16, border: "2px solid #999", background: "#fff", flex: "0 0 auto" };
          return (
            <div key={n.key} onClick={() => setActive(i)} style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, cursor: "pointer", padding: "5px 0", opacity: isActive ? 1 : n.done ? 0.85 : 0.5 }}>
              <div style={dot as React.CSSProperties} />
              <div>
                <div style={{ fontWeight: 700, fontSize: isActive ? 18 : 15, letterSpacing: isActive ? "-.01em" : undefined }}>{n.label}</div>
                {!isMobile && <div className="font-mono" style={{ fontSize: 11, color: isActive ? INK : "#999", fontWeight: isActive ? 700 : 400 }}>{n.sub}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: `2px solid ${INK}`, paddingTop: 16, marginTop: 16 }}>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#666" }}>{sliceLabel}</div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-.03em" }}>{money(view.position.drawn)}</span>
          <span className="font-mono" style={{ fontSize: 11, color: "#999" }}>{view.role === "borrower" ? "of " + money(view.position.commitment) : pct(view.position.holdPct) + " hold"}</span>
        </div>
        <div style={{ marginTop: 8, height: 8, background: "#fff", border: `2px solid ${INK}` }}>
          <div style={{ width: `${drawnPct}%`, height: "100%", background: MINT }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Stage bodies ---------- */

interface StageProps {
  stageKey: string;
  view: FacilityView;
  copilot: CopilotProposal | undefined;
  drawAmount: number;
  setDrawAmount: (n: number) => void;
  onSettle: (k: SettlementKind, a?: Record<string, number>) => void;
  pending: boolean;
  isMobile: boolean;
}

function Stage(props: StageProps) {
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

function OriginationStage({ view, isMobile }: StageProps) {
  const p = view.position;
  const f = view.facility;
  const drawnPct = p.commitment > 0 ? (p.drawn / p.commitment) * 100 : 0;
  const available = p.commitment - p.drawn;
  const headline = view.role === "agentBank" ? "Facility exposure" : view.role === "borrower" ? "Facility drawn" : "Your position";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.15fr 1fr", gap: 20 }}>
        <div style={{ border: `2px solid ${INK}`, background: MINT, padding: 24 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700 }}>{headline}</div>
          <div style={{ fontWeight: 700, fontSize: isMobile ? 38 : 52, letterSpacing: "-.04em", marginTop: 8 }}>{money(p.drawn)}</div>
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

      {view.role === "agentBank" && view.loanTape ? (
        <LoanTape view={view} />
      ) : (
        <SyndicateTiles view={view} isMobile={isMobile} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 20 }}>
        {view.covenants.map((c) => (
          <div key={c.key} style={{ border: `2px solid ${INK}`, background: "#fff", padding: "18px 20px" }}>
            <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#666" }}>{c.label}</div>
            <div style={{ fontWeight: 700, fontSize: 30, letterSpacing: "-.03em", marginTop: 4 }}>{mult(c.value)}</div>
            <div className="font-mono" style={{ fontSize: 10, color: c.ok ? MINT : RED, fontWeight: 700 }}>
              {c.kind === "floor" ? "FLOOR" : "CAP"} {mult(c.threshold)} · {c.ok ? "OK" : "BREACH"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoanTape({ view }: { view: FacilityView }) {
  const tape = view.loanTape ?? [];
  return (
    <div style={{ border: `2px solid ${INK}`, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", background: PAPER, borderBottom: `2px solid ${INK}`, gap: 10, flexWrap: "wrap" }}>
        <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, color: "#666" }}>Loan tape · {tape.length} lenders</span>
        <span className="font-mono" style={{ fontSize: 10, color: MINT, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700 }}>Agent-bank view · full visibility</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="font-mono" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
          <thead>
            <tr>
              {["Lender", "Hold", "Commitment", "Drawn", "Undrawn", "Accrued"].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? "left" : "right", padding: "10px 18px", borderBottom: "2px solid #e4e4e0", fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "#999" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tape.map((l, i) => (
              <tr key={l.lender}>
                <td style={{ textAlign: "left", padding: "12px 18px", borderBottom: i < tape.length - 1 ? "1px solid #f0f0ee" : undefined, fontWeight: 700 }}>{l.lender}</td>
                <td style={{ textAlign: "right", padding: "12px 18px", borderBottom: i < tape.length - 1 ? "1px solid #f0f0ee" : undefined }}>{pct(l.holdPct)}</td>
                <td style={{ textAlign: "right", padding: "12px 18px", borderBottom: i < tape.length - 1 ? "1px solid #f0f0ee" : undefined }}>{money(l.commitment)}</td>
                <td style={{ textAlign: "right", padding: "12px 18px", borderBottom: i < tape.length - 1 ? "1px solid #f0f0ee" : undefined, fontWeight: 700 }}>{money(l.drawn)}</td>
                <td style={{ textAlign: "right", padding: "12px 18px", borderBottom: i < tape.length - 1 ? "1px solid #f0f0ee" : undefined, color: "#666" }}>{money(l.commitment - l.drawn)}</td>
                <td style={{ textAlign: "right", padding: "12px 18px", borderBottom: i < tape.length - 1 ? "1px solid #f0f0ee" : undefined, color: MINT, fontWeight: 700 }}>{money(l.accruedInterest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SyndicateTiles({ view, isMobile }: { view: FacilityView; isMobile: boolean }) {
  const f = view.facility;
  const p = view.position;
  const isLender = view.role !== "borrower";
  const cols = isMobile ? 3 : f.lenderCount;
  return (
    <div style={{ border: `2px solid ${INK}`, background: "#fff", padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, color: "#666" }}>Syndicate · {f.lenderCount} lenders share this facility</div>
        <div className="font-mono" style={{ fontSize: 10, color: MINT, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700 }}>
          {view.role === "borrower" ? "Identities sealed to borrower" : "Others sealed by Daml"}
        </div>
      </div>
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 10 }}>
        {isLender && (
          <div style={{ border: `2px solid ${INK}`, background: MINT, padding: 14, height: 92, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <span className="font-mono" style={{ fontSize: 10, fontWeight: 700 }}>YOU</span>
            <span style={{ fontWeight: 700, fontSize: 20 }}>{pct(p.holdPct)}</span>
          </div>
        )}
        {view.sealedLenders.slice(0, isLender ? view.sealedLenders.length : f.lenderCount).map((s) => (
          <div key={s.index} style={{ border: `2px solid ${INK}`, background: INK, color: "#3a3a3a", padding: 14, height: 92, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".2em" }}>{"█".repeat(2 + ((s.index * 2) % 4))}</span>
            <span style={{ fontWeight: 700, fontSize: 20 }}>▓▓</span>
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

function LockedNote({ view }: { view: FacilityView }) {
  if (view.canSettle) return null;
  return (
    <div className="font-mono" style={{ border: "2px dashed #c9c9c4", background: PANEL, color: "#666", padding: "12px 16px", fontSize: 12, letterSpacing: ".03em" }}>
      Borrower view · you can request settlement, but the agent bank authorizes it on-ledger. Switch to Agent Bank or a Lender to settle.
    </div>
  );
}

function TwoLegCard({
  tag, both, leg1Label, leg1Value, leg2Label, leg2Value, cta, note, onClick, pending, locked, blocked, isMobile,
}: {
  tag: string; both: string; leg1Label: string; leg1Value: string; leg2Label: string; leg2Value: string;
  cta: string; note: string; onClick: () => void; pending: boolean; locked?: boolean; blocked?: boolean; isMobile: boolean;
}) {
  const disabled = pending || locked || blocked;
  return (
    <div style={{ border: `2px solid ${INK}`, background: INK, color: PAPER, padding: isMobile ? 18 : 26 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#9a9a96" }}>{tag}</div>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: blocked ? RED : MINT, fontWeight: 700 }}>{both}</div>
      </div>
      <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 56px 1fr", gap: isMobile ? 12 : 0, alignItems: "center" }}>
        <div style={{ border: `2px solid ${blocked ? RED : MINT}`, padding: 20 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: blocked ? RED : MINT, fontWeight: 700 }}>{leg1Label}</div>
          <div style={{ fontWeight: 700, fontSize: isMobile ? 26 : 34, letterSpacing: "-.03em", marginTop: 6 }}>{leg1Value}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 44, height: 44, border: `2px solid ${blocked ? RED : MINT}`, display: "inline-flex", alignItems: "center", justifyContent: "center", transform: isMobile ? "rotate(90deg)" : undefined }}>
            <div style={{ width: 15, height: 15, background: blocked ? RED : MINT }} />
          </div>
        </div>
        <div style={{ border: "2px solid #2a2a2a", padding: 20 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#9a9a96", fontWeight: 700 }}>{leg2Label}</div>
          <div style={{ fontWeight: 700, fontSize: isMobile ? 26 : 34, letterSpacing: "-.03em", marginTop: 6 }}>{leg2Value}</div>
        </div>
      </div>
      <div style={{ marginTop: 22, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={onClick} disabled={disabled} className="font-mono" style={{ background: blocked ? "#2a2a2a" : MINT, color: blocked ? "#9a9a96" : INK, padding: "15px 26px", fontWeight: 700, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase", border: blocked ? `2px solid ${RED}` : "none", cursor: disabled ? "not-allowed" : "pointer", opacity: pending ? 0.6 : 1 }}>
          {pending ? "Settling…" : blocked ? "Blocked by covenant guardrail" : locked ? "Requires agent bank" : cta}
        </button>
        <div className="font-mono" style={{ fontSize: 11, color: "#9a9a96", lineHeight: 1.5, flex: 1, minWidth: 180 }}>{note}</div>
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

function DrawdownStage({ view, copilot, drawAmount, setDrawAmount, onSettle, pending, isMobile }: StageProps) {
  const share = drawAmount * (view.position.holdPct / 100);
  const rows = view.history.filter((r) => r.kind === "drawdown");
  const impact = copilot?.assessment?.covenantImpact;
  const blocked = impact?.breaches ?? false;
  const isAgent = view.role === "agentBank";
  const funders = isAgent ? `all ${view.facility.lenderCount} lenders` : "your slice";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <LockedNote view={view} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#666" }}>Proposed facility draw</span>
        {[
          { amt: NORMAL_DRAW, label: "$4.0M · routine" },
          { amt: STRESS_DRAW, label: "$150M · capex III" },
        ].map((o) => {
          const on = drawAmount === o.amt;
          return (
            <button key={o.amt} onClick={() => setDrawAmount(o.amt)} className="font-mono" style={{ border: `2px solid ${INK}`, background: on ? INK : "#fff", color: on ? MINT : INK, padding: "8px 14px", fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", cursor: "pointer" }}>
              {o.label}
            </button>
          );
        })}
      </div>

      {impact && <CovenantImpactBar impact={impact} />}

      <TwoLegCard
        tag="Atomic transaction · 2 legs"
        both={blocked ? "Blocked · no legs move" : "Both or neither"}
        leg1Label="Leg 1 · Cash out" leg1Value={money(-share, { sign: true })}
        leg2Label="Leg 2 · Position up" leg2Value={money(share, { sign: true })}
        cta={isAgent ? "Authorize facility draw →" : "Authorize drawdown →"}
        note={blocked ? "The co-pilot caught a leverage-covenant breach on this draw — the ledger refuses to move either leg." : `Borrower requests $${(drawAmount / 1_000_000).toFixed(1)}M; ${funders} fund pro-rata in one indivisible commit.`}
        onClick={() => onSettle("drawdown", { amount: drawAmount })}
        pending={pending}
        locked={!view.canSettle}
        blocked={blocked}
        isMobile={isMobile}
      />
      <HistoryTable title={isAgent ? "Facility drawdown history" : "Drawdown history · your slice"} rows={rows} />
    </div>
  );
}

function CovenantImpactBar({ impact }: { impact: { key: string; projected: number; threshold: number; breaches: boolean } }) {
  const b = impact.breaches;
  return (
    <div style={{ border: `2px solid ${b ? RED : INK}`, background: b ? "#fbeae8" : "#fff", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: b ? RED : "#666", fontWeight: 700 }}>
        Projected net leverage
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-.03em", color: b ? RED : INK }}>{mult(impact.projected)}</span>
        <span className="font-mono" style={{ fontSize: 12, color: "#666" }}>vs {mult(impact.threshold)} cap</span>
        <span className="font-mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: b ? RED : MINT }}>{b ? "· BREACH" : "· within cap"}</span>
      </div>
    </div>
  );
}

function InterestStage({ view, onSettle, pending, isMobile }: StageProps) {
  const accrued = view.position.accruedInterest;
  const rows = view.history.filter((r) => r.kind === "interest");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <LockedNote view={view} />
      {accrued > 0 ? (
        <TwoLegCard
          tag={`Q2 interest distribution · atomic`} both={`${view.facility.lenderCount} holders · pro-rata`}
          leg1Label="Leg 1 · Cash in" leg1Value={money(accrued, { sign: true })}
          leg2Label="Leg 2 · Accrual" leg2Value="→ 0"
          cta="Settle atomically →"
          note="Co-pilot has proposed this sequence — authorize it here or in the rail. Daml checks signatory rights before commit."
          onClick={() => onSettle("interest")} pending={pending} locked={!view.canSettle} isMobile={isMobile}
        />
      ) : (
        <div style={{ border: `2px solid ${INK}`, background: INK, color: PAPER, padding: 26 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>Q2 distributed</div>
          <div style={{ marginTop: 10, fontSize: 18, lineHeight: 1.4 }}>Accrual retired to zero and cash delivered — both legs in one transaction.</div>
        </div>
      )}
      <HistoryTable title="Recent settlements" rows={rows} />
    </div>
  );
}

function SecondaryStage({ view, onSettle, pending }: StageProps) {
  const [notional, setNotional] = useState(8_000_000);
  const [price] = useState(99.25);
  const proceeds = notional * (price / 100);
  const maxNotional = Math.max(1_000_000, Math.round(view.position.drawn));
  const clamped = Math.min(notional, maxNotional);
  const book: [string, string, string][] = [
    ["BID", `99.25 · ${money(8_000_000)}`, MINT],
    ["BID", `99.10 · ${money(5_000_000)}`, MINT],
    ["OFFER", `99.60 · ${money(3_000_000)}`, "#a3611f"],
    ["OFFER", `99.80 · ${money(6_500_000)}`, "#a3611f"],
  ];
  const canTrade = view.role !== "borrower" && view.role !== "agentBank";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!canTrade && (
        <div className="font-mono" style={{ border: "2px dashed #c9c9c4", background: PANEL, color: "#666", padding: "12px 16px", fontSize: 12 }}>
          Secondary trades are executed by lenders. Switch to Lender A / B / C to run a DvP sell-down.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
        <div style={{ border: `2px solid ${INK}`, background: "#fff", padding: 24 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, color: "#666" }}>Sell ticket · DvP</div>
          <Field label="Notional to sell" value={money(clamped)} sub={`of ${money(view.position.drawn)}`} />
          <input type="range" min={1_000_000} max={maxNotional} step={500_000} value={clamped} onChange={(e) => setNotional(Number(e.target.value))} style={{ width: "100%", accentColor: MINT, marginTop: 10 }} />
          <Field label="Price" value={price.toFixed(2)} sub="/ par" />
          <Field label="Counterparty" value="Lender · ████ (sealed)" sub="" right={<span className="font-mono" style={{ fontSize: 11, color: MINT, fontWeight: 700 }}>MATCHED</span>} />
          <button onClick={() => onSettle("secondary", { notional: clamped, price })} disabled={pending || !canTrade} className="font-mono" style={{ marginTop: 20, width: "100%", background: canTrade ? MINT : "#e4e4e0", border: "none", textAlign: "center", padding: 15, fontWeight: 700, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase", cursor: pending || !canTrade ? "not-allowed" : "pointer", opacity: pending ? 0.6 : 1, color: INK }}>
            {pending ? "Executing…" : canTrade ? "Execute DvP →" : "Lenders only"}
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
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 19 }}>{money(-clamped, { sign: true })} slice</div>
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
    </div>
  );
}

function Field({ label, value, sub, right }: { label: string; value: string; sub: string; right?: React.ReactNode }) {
  return (
    <>
      <div className="font-mono" style={{ marginTop: 16, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: "#999" }}>{label}</div>
      <div style={{ marginTop: 6, border: `2px solid ${INK}`, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: right ? 15 : 30, letterSpacing: "-.03em" }}>{value}</span>
        {right ?? <span className="font-mono" style={{ fontSize: 11, color: "#999" }}>{sub}</span>}
      </div>
    </>
  );
}

function RepaymentStage({ view, onSettle, pending, isMobile }: StageProps) {
  const facilityAmort = 12_000_000;
  const share = facilityAmort * (view.position.holdPct / 100);
  const rows = view.history.filter((r) => r.kind === "repayment");
  const isAgent = view.role === "agentBank";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <LockedNote view={view} />
      <TwoLegCard
        tag="Scheduled amortization · atomic" both="Due 06-30"
        leg1Label="Leg 1 · Cash in" leg1Value={money(share, { sign: true })}
        leg2Label="Leg 2 · Position down" leg2Value={money(-share, { sign: true })}
        cta={isAgent ? "Authorize facility amort →" : "Authorize repayment →"}
        note={`Principal returns ${isAgent ? "to every holder" : "to you"} and the drawn balance amortizes in one indivisible commit.`}
        onClick={() => onSettle("repayment", { amount: facilityAmort })} pending={pending} locked={!view.canSettle} isMobile={isMobile}
      />
      {rows.length > 0 && <HistoryTable title="Settled amortizations" rows={rows} />}
    </div>
  );
}

function MaturityStage({ view, isMobile }: StageProps) {
  // Role-aware economics: lenders EARN a return; the borrower REPAYS; the agent bank arranges.
  const metrics =
    view.role === "borrower"
      ? [
          { bg: MINT, label: "Principal to repay", value: money(view.position.drawn), sub: "fully amortizes by maturity" },
          { bg: "#fff", label: "Facility size", value: money(view.facility.totalCommitment), sub: `${view.facility.lenderCount} lenders` },
          { bg: "#fff", label: "Final maturity", value: "2031", sub: "06-30 bullet" },
        ]
      : view.role === "agentBank"
        ? [
            { bg: MINT, label: "Facility payoff", value: money(view.facility.totalCommitment), sub: "all lenders repaid" },
            { bg: "#fff", label: "Blended coupon", value: view.facility.couponLabel, sub: "across the syndicate", subMint: true },
            { bg: "#fff", label: "Final maturity", value: "2031", sub: "06-30 bullet" },
          ]
        : [
            { bg: MINT, label: "Projected payoff", value: money(view.position.commitment), sub: "full principal returned" },
            { bg: "#fff", label: "Projected IRR", value: "11.8%", sub: "to your slice", subMint: true },
            { bg: "#fff", label: "Final maturity", value: "2031", sub: "06-30 bullet" },
          ];
  const closing =
    view.role === "borrower"
      ? "At current trajectory the facility retires fully at maturity — every draw and repayment along the way settled atomically."
      : view.role === "agentBank"
        ? "Every lender's slice retires at maturity — each leg settled atomically, each position private throughout."
        : "At current trajectory, this facility retires fully at maturity — every leg along the way settled atomically, your slice private throughout.";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 20 }}>
        {metrics.map((m) => (
          <Metric key={m.label} bg={m.bg} label={m.label} value={m.value} sub={m.sub} subMint={(m as { subMint?: boolean }).subMint} />
        ))}
      </div>
      <div style={{ border: `2px solid ${INK}`, background: INK, color: PAPER, padding: 26 }}>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>Lifecycle complete · projection</div>
        <div style={{ marginTop: 12, fontWeight: 700, fontSize: isMobile ? 24 : 32, letterSpacing: "-.03em", lineHeight: 1.1 }}>{closing}</div>
      </div>
    </div>
  );
}

function Metric({ bg, label, value, sub, subMint }: { bg: string; label: string; value: string; sub: string; subMint?: boolean }) {
  return (
    <div style={{ border: `2px solid ${INK}`, background: bg, padding: 22 }}>
      <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: bg === MINT ? 700 : 400, color: bg === MINT ? INK : "#666" }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 36, letterSpacing: "-.04em", marginTop: 6 }}>{value}</div>
      <div className="font-mono" style={{ fontSize: 11, color: subMint ? MINT : bg === MINT ? INK : "#999", fontWeight: subMint ? 700 : 400 }}>{sub}</div>
    </div>
  );
}

function SettleBanner({ record, error, pending }: { record: SettlementRecord | null; error: string | null; pending: boolean }) {
  if (pending) return null;
  if (error) {
    return (
      <div className="font-mono" style={{ marginBottom: 20, border: `2px solid ${RED}`, background: "#fbeae8", color: RED, padding: "12px 16px", fontSize: 12, letterSpacing: ".04em", fontWeight: 700 }}>
        ✕ Rejected — {error} <span style={{ color: "#666", fontWeight: 400 }}>· nothing moved (all-or-nothing).</span>
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

function CopilotRail({ copilot, view, onAuthorize, pending, isMobile }: { copilot: CopilotProposal | undefined; view: FacilityView; onAuthorize: () => void; pending: boolean; isMobile: boolean }) {
  const tone = copilot?.tone ?? "watch";
  const assessment = copilot?.assessment;
  const blocked = assessment?.decision === "block";
  const tagColor = tone === "block" ? RED : tone === "watch" ? "#a3611f" : tone === "propose" ? MINT : "#666";
  const isLender = isLenderRole(view.role);
  // Only show the gate for a choice this role can actually settle — a secondary proposal is not
  // authorizable by the agent bank/borrower, so don't surface a button the route would reject.
  const choiceOk = !!assessment && assessment.choice !== "none" && (assessment.choice !== "secondary" || isLender);
  const canAuthorize = view.canSettle && choiceOk && assessment!.decision === "allow";
  const showGate = choiceOk;

  const [gateAck, setGateAck] = useState<"escalated" | "declined" | null>(null);
  useEffect(() => setGateAck(null), [copilot?.tag, view.role]);

  return (
    <div style={{ borderLeft: isMobile ? undefined : `2px solid ${INK}`, borderTop: isMobile ? `2px solid ${INK}` : undefined, background: PANEL, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden" }}>
      <div style={{ padding: "20px 22px", borderBottom: `2px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "space-between", flex: "0 0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 11, height: 11, background: blocked ? RED : MINT }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-.01em" }}>Agent co-pilot</span>
        </div>
        <span className="font-mono" style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "#666", textAlign: "right" }}>
          {copilot?.source === "deepseek" ? "live · deepseek" : "constrained"}
          <br />by Daml
        </span>
      </div>
      <div style={{ padding: "20px 22px", overflow: isMobile ? "visible" : "auto", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
        <div style={{ border: `2px solid ${blocked ? RED : INK}`, background: "#fff", padding: "16px 18px" }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700, color: tagColor }}>{copilot?.tag ?? "Reading…"}</div>
          <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5, color: "#111" }}>{copilot?.body ?? "Reasoning over the borrower's private covenant data…"}</div>
          {assessment?.covenantImpact && (
            <div className="font-mono" style={{ marginTop: 10, fontSize: 11, fontWeight: 700, color: assessment.covenantImpact.breaches ? RED : MINT, borderTop: "1px solid #e4e4e0", paddingTop: 8 }}>
              leverage → {mult(assessment.covenantImpact.projected)} vs {mult(assessment.covenantImpact.threshold)} cap {assessment.covenantImpact.breaches ? "· BREACH" : "· OK"}
            </div>
          )}
          {copilot?.proposal && !assessment?.covenantImpact && (
            <div className="font-mono" style={{ marginTop: 10, fontSize: 11, color: INK, fontWeight: 700, borderTop: "1px solid #e4e4e0", paddingTop: 8 }}>↳ {copilot.proposal}</div>
          )}
          <div className="font-mono" style={{ marginTop: 10, fontSize: 10, color: "#999", letterSpacing: ".04em" }}>Read scope: agent bank + borrower{assessment?.overridden ? " · guardrail override" : ""}</div>
        </div>

        {showGate && (
          <div style={{ border: `2px solid ${blocked ? RED : MINT}`, background: blocked ? "#fbeae8" : MINT, padding: "16px 18px" }}>
            <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: blocked ? RED : INK, fontWeight: 700 }}>
              {blocked ? "Blocked — outside authorization" : "Daml authorization required"}
            </div>
            <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.45, color: INK }}>
              {blocked
                ? "The proposed choice breaches a covenant. The ledger will not execute it — the agent can only escalate."
                : "Agent proposes; the ledger executes only within signatory rights. Approve to authorize."}
            </div>
            {gateAck ? (
              <div className="font-mono" style={{ marginTop: 14, fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: INK, borderTop: `1px solid ${blocked ? "#e8c9c4" : "#12b869"}`, paddingTop: 12 }}>
                {gateAck === "escalated" ? "↑ Escalated to the agent-bank desk — awaiting covenant-waiver review." : "✕ Proposal declined — no action taken."}
              </div>
            ) : (
              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={onAuthorize} disabled={pending || !canAuthorize} className="font-mono" style={{ background: canAuthorize ? INK : "#c9c9c4", color: canAuthorize ? "#fff" : "#7a7a76", padding: "10px 18px", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", border: "none", cursor: pending || !canAuthorize ? "not-allowed" : "pointer", opacity: pending ? 0.6 : 1 }}>
                  {blocked ? "Cannot authorize" : "Authorize"}
                </button>
                <button onClick={() => setGateAck(blocked ? "escalated" : "declined")} className="font-mono" style={{ background: blocked ? "#fff" : MINT, border: `2px solid ${INK}`, color: INK, padding: "10px 18px", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", cursor: "pointer" }}>
                  {blocked ? "Escalate" : "Decline"}
                </button>
              </div>
            )}
          </div>
        )}

        <div style={{ border: `2px solid ${INK}`, background: INK, color: PAPER, padding: 18 }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "#9a9a96" }}>Authority model</div>
          <div style={{ marginTop: 14 }}>
            <AuthRow color={MINT} label="Agent proposes" note="reads private borrower data" />
            <AuthRow color="#fff" label="Guardrail validates" note="covenant + authorization" />
            <AuthRow color={MINT} label="Ledger settles" note="" last />
          </div>
        </div>
      </div>
      <div className="font-mono" style={{ padding: "14px 22px", borderTop: `2px solid ${INK}`, flex: "0 0 auto", textAlign: "center", fontSize: 10, color: "#666", letterSpacing: ".14em", textTransform: "uppercase" }}>
        Proposes · guardrail-checked · ledger-settled
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
