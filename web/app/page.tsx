"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DevNetBanner } from "@/components/DevNetBanner";
import { useIsMobile } from "@/lib/useIsMobile";

const INK = "#0a0a0a";
const MINT = "#16d97f";
const PAPER = "#f2f2f0";

const TICKER =
  "ATOMIC DvP SETTLEMENT  /  SUB-TRANSACTION PRIVACY  /  DAML AUTHORIZATION  /  SECONDARY LENDER TRADES  /  COVENANT MONITORING  /  NEED-TO-KNOW FINANCIALS  /  ";
const MARQ = "ONE FACILITY · YOUR SLICE ONLY · ATOMIC SETTLEMENT · ";

export default function Landing() {
  const isMobile = useIsMobile();
  const [progress, setProgress] = useState("4%");
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const p = max > 0 ? Math.min(1, h.scrollTop / max) : 0;
      setProgress((4 + p * 96).toFixed(1) + "%");
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const railW = isMobile ? 44 : 58;

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflowX: "hidden" }}>
      {/* TOP TICKER */}
      <div
        style={{
          position: "relative",
          zIndex: 5,
          height: 34,
          background: INK,
          color: PAPER,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          borderBottom: `2px solid ${INK}`,
        }}
      >
        <div
          className="font-mono"
          style={{
            display: "flex",
            whiteSpace: "nowrap",
            animation: "sc-marq 38s linear infinite",
            fontSize: 11,
            letterSpacing: ".08em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ display: "inline-flex" }}>{TICKER}</span>
          <span style={{ display: "inline-flex" }}>{TICKER}</span>
        </div>
      </div>

      {/* LEFT RAIL */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: railW,
          height: "100vh",
          background: "#fff",
          borderRight: `2px solid ${INK}`,
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 0",
        }}
      >
        <Logo />
        <div
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontWeight: 700,
            letterSpacing: ".42em",
            fontSize: isMobile ? 11 : 13,
          }}
        >
          SYNDICATE
        </div>
        <div style={{ flex: 1, width: 2, background: PAPER, margin: "22px 0", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, width: 2, background: MINT, height: progress }} />
        </div>
        <div className="font-mono" style={{ writingMode: "vertical-rl", fontSize: 9, letterSpacing: ".18em", color: "#666" }}>
          / CANTON
        </div>
      </div>

      {/* MAIN */}
      <div style={{ marginLeft: railW }}>
        <DevNetBanner />
        <Hero isMobile={isMobile} />
        <Marquee />
        <PrivacySlice isMobile={isMobile} />
        <AtomicFilm isMobile={isMobile} />
        <WhyCanton isMobile={isMobile} />
        <DealSpinePreview isMobile={isMobile} />
        <AgentCopilot isMobile={isMobile} />
        <CTA isMobile={isMobile} />
        <Footer />
      </div>
    </div>
  );
}

function Logo({ light = false }: { light?: boolean }) {
  const a = light ? PAPER : INK;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "8px 8px", gridTemplateRows: "8px 8px", gap: 2 }}>
      <div style={{ background: a }} />
      <div style={{ background: MINT }} />
      <div style={{ background: a }} />
      <div style={{ background: a }} />
    </div>
  );
}

function Hero({ isMobile }: { isMobile: boolean }) {
  return (
    <section style={{ position: "relative", borderBottom: `2px solid ${INK}`, overflow: "hidden" }}>
      <div
        className="font-mono"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          padding: isMobile ? "14px 20px" : "18px 40px",
          borderBottom: "1px solid #e4e4e0",
          fontSize: 11,
          letterSpacing: ".14em",
          textTransform: "uppercase",
        }}
      >
        <div style={{ display: "flex", gap: isMobile ? 12 : 26, flexWrap: "wrap" }}>
          <span>Facility OS</span>
          <span style={{ color: "#999" }}>·</span>
          <span>Confidential by design</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: MINT, display: "inline-block", animation: "sc-blink 1.8s infinite" }} />
          Ledger live
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.35fr .9fr", minHeight: isMobile ? "auto" : 560 }}>
        <div style={{ padding: isMobile ? "36px 20px 40px" : "54px 40px 48px", display: "flex", flexDirection: "column", justifyContent: "center", borderRight: isMobile ? undefined : `2px solid ${INK}` }}>
          <div className="font-mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 22 }}>
            Syndicated lending · on Canton
          </div>
          <h1 style={{ margin: 0, fontWeight: 700, fontSize: "clamp(44px, 13vw, 118px)", lineHeight: 0.84, letterSpacing: "-.05em", textTransform: "uppercase" }}>
            Settle<br />
            <span style={{ display: "inline-block", color: MINT }}>atomic&#8203;</span>
            <br />
            <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 18 }}>
              ally.
              {!isMobile && <span style={{ width: 120, height: 14, background: INK, display: "inline-block", marginBottom: 18 }} />}
            </span>
          </h1>
          <p style={{ margin: "34px 0 0", maxWidth: 430, fontSize: 17, lineHeight: 1.5, color: "#333" }}>
            Multiple competing lenders. One shared facility. Each sees only its own slice — and every cash-vs-position move
            clears in a single, indivisible transaction.
          </p>
          <div style={{ marginTop: 34, display: "flex", border: `2px solid ${INK}`, width: "max-content", maxWidth: "100%", flexWrap: "wrap" }}>
            <Link href="/app" style={{ padding: "15px 26px", background: INK, color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase" }}>
              Enter the product
            </Link>
            <a href="#flow" style={{ padding: "15px 26px", background: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase", borderLeft: `2px solid ${INK}` }}>
              See the flow
            </a>
          </div>
        </div>

        {!isMobile && <FacilityCube />}
      </div>
    </section>
  );
}

function FacilityCube() {
  return (
    <div style={{ position: "relative", background: PAPER, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", minHeight: 360 }}>
      <div className="font-mono" style={{ position: "absolute", top: 18, left: 18, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#666" }}>
        Facility · $480M
      </div>
      <div className="font-mono" style={{ position: "absolute", bottom: 18, right: 18, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#666" }}>
        6 lenders
      </div>
      <div style={{ perspective: 1400, width: 340, height: 340, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ transformStyle: "preserve-3d", animation: "sc-rot 26s linear infinite", width: 200, height: 240, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, transform: "translateZ(40px)", background: "#fff", border: `2px solid ${INK}`, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, borderBottom: `2px solid ${INK}` }} />
            <div style={{ flex: 1, borderBottom: `2px solid ${INK}` }} />
            <div style={{ flex: 1, background: MINT, borderBottom: `2px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span className="font-mono" style={{ fontWeight: 700, fontSize: 11, letterSpacing: ".1em" }}>YOUR SLICE</span>
            </div>
            <div style={{ flex: 1, borderBottom: `2px solid ${INK}` }} />
            <div style={{ flex: 1, borderBottom: `2px solid ${INK}` }} />
            <div style={{ flex: 1 }} />
          </div>
          <div style={{ position: "absolute", inset: 0, transform: "translateZ(-40px)", background: INK }} />
          <div style={{ position: "absolute", top: 0, right: 0, width: 80, height: 240, background: INK, transform: "rotateY(90deg)", transformOrigin: "right center" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: 80, height: 240, background: "#1c1c1c", transform: "rotateY(-90deg)", transformOrigin: "left center" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: 200, height: 80, background: "#2a2a2a", transform: "rotateX(90deg)", transformOrigin: "top center" }} />
          <div style={{ position: "absolute", bottom: 0, left: 0, width: 200, height: 80, background: INK, transform: "rotateX(-90deg)", transformOrigin: "bottom center" }} />
        </div>
      </div>
    </div>
  );
}

function Marquee() {
  return (
    <section style={{ background: MINT, borderBottom: `2px solid ${INK}`, overflow: "hidden", height: 64, display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", whiteSpace: "nowrap", animation: "sc-marq 24s linear infinite", fontWeight: 700, fontSize: 30, letterSpacing: "-.02em", textTransform: "uppercase" }}>
        <span style={{ display: "inline-flex" }}>{MARQ.repeat(4)}</span>
        <span style={{ display: "inline-flex" }}>{MARQ.repeat(4)}</span>
      </div>
    </section>
  );
}

function PrivacySlice({ isMobile }: { isMobile: boolean }) {
  const sealed = ["█████", "███", "████", "██████", "██"];
  return (
    <section style={{ borderBottom: `2px solid ${INK}`, display: "grid", gridTemplateColumns: isMobile ? "1fr" : ".9fr 1.1fr" }}>
      <div style={{ padding: isMobile ? "40px 20px" : "54px 40px", borderRight: isMobile ? undefined : `2px solid ${INK}`, borderBottom: isMobile ? `2px solid ${INK}` : undefined }}>
        <div className="font-mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#666" }}>01 / Privacy</div>
        <h2 style={{ margin: "18px 0 0", fontWeight: 700, fontSize: "clamp(38px, 9vw, 54px)", lineHeight: 0.92, letterSpacing: "-.035em", textTransform: "uppercase" }}>
          You see<br />only your<br />slice.
        </h2>
        <p style={{ margin: "26px 0 0", maxWidth: 380, fontSize: 16, lineHeight: 1.55, color: "#333" }}>
          Each lender&apos;s position is a Daml contract only it and the agent bank can observe. Co-investors in the same
          facility are mathematically blind to one another — no bolt-on ZK, no shared-state leakage.
        </p>
        <div className="font-mono" style={{ marginTop: 30, fontSize: 12, lineHeight: 1.9, color: INK }}>
          <div>→ Sub-transaction privacy at the ledger</div>
          <div>→ Signatory / observer enforced</div>
          <div>→ Borrower financials stay need-to-know</div>
        </div>
      </div>
      <div style={{ padding: isMobile ? "32px 20px" : 40, background: PAPER, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 460 }}>
          <div className="font-mono" style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "#666", marginBottom: 14 }}>
            <span>Meridian Logistics · Tranche B</span>
            <span>6 participants</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            <div style={{ background: MINT, border: `2px solid ${INK}`, aspectRatio: "1", padding: 14, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em" }}>YOU</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-.03em" }}>$48M</div>
                <span className="font-mono" style={{ fontSize: 10 }}>10.0% hold</span>
              </div>
            </div>
            {sealed.map((s, i) => (
              <div key={i} style={{ background: INK, color: "#3a3a3a", border: `2px solid ${INK}`, aspectRatio: "1", padding: 14, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <span className="font-mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".3em" }}>{s}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 26 }}>▓▓▓</div>
                  <span className="font-mono" style={{ fontSize: 10 }}>redacted</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AtomicFilm({ isMobile }: { isMobile: boolean }) {
  return (
    <section id="flow" style={{ background: INK, color: PAPER, borderBottom: `2px solid ${INK}`, padding: isMobile ? "40px 20px" : "54px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 20 }}>
        <div>
          <div className="font-mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: MINT }}>02 / Atomicity</div>
          <h2 style={{ margin: "16px 0 0", fontWeight: 700, fontSize: "clamp(34px, 8vw, 54px)", lineHeight: 0.92, letterSpacing: "-.035em", textTransform: "uppercase" }}>
            Cash and position,<br />one transaction.
          </h2>
        </div>
        <p style={{ margin: 0, maxWidth: 360, fontSize: 15, lineHeight: 1.55, color: "#9a9a96" }}>
          Both legs move together or neither moves. No settlement risk, no failed legs, no weeks of reconciliation between
          parties who don&apos;t share a database.
        </p>
      </div>

      <div style={{ marginTop: 46, position: "relative", height: 200, border: "2px solid #2a2a2a", background: "#111", overflow: "hidden", animation: "sc-flash 6s ease-in-out infinite" }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "#2a2a2a" }} />
        <div className="font-mono" style={{ position: "absolute", top: 14, left: 18, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#666" }}>Lender A</div>
        <div className="font-mono" style={{ position: "absolute", top: 14, right: 18, fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#666" }}>Facility escrow</div>
        <div className="font-mono" style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", animation: "sc-cash 6s ease-in-out infinite" }}>
          <div style={{ background: MINT, color: INK, border: `2px solid ${MINT}`, padding: "10px 16px", fontWeight: 700, fontSize: 14, letterSpacing: ".04em", textTransform: "uppercase" }}>Cash $4.0M →</div>
        </div>
        <div className="font-mono" style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", animation: "sc-pos 6s ease-in-out infinite" }}>
          <div style={{ background: "#fff", color: INK, border: "2px solid #fff", padding: "10px 16px", fontWeight: 700, fontSize: 14, letterSpacing: ".04em", textTransform: "uppercase" }}>← Position +0.83%</div>
        </div>
        <div style={{ position: "absolute", left: "50%", top: "50%", animation: "sc-lock 6s ease-in-out infinite" }}>
          <div style={{ width: 56, height: 56, border: `3px solid ${MINT}`, display: "flex", alignItems: "center", justifyContent: "center", background: INK }}>
            <div style={{ width: 18, height: 18, background: MINT }} />
          </div>
        </div>
        <div className="font-mono" style={{ position: "absolute", left: "50%", bottom: 18, transform: "translateX(-50%)", animation: "sc-stamp 6s ease-in-out infinite", fontWeight: 700, fontSize: 13, letterSpacing: ".22em", textTransform: "uppercase", color: MINT }}>
          ✓ Settled atomically
        </div>
      </div>

      <div style={{ marginTop: 30, display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", border: "2px solid #2a2a2a" }}>
        {[
          ["Drawdowns", "Borrower draws, lender cash debits — atomic.", MINT],
          ["Interest", "Accrual + distribution by pro-rata slice.", PAPER],
          ["Repay", "Principal returns flow to each holder.", PAPER],
          ["Trades", "Secondary lender-to-lender, DvP.", MINT],
        ].map(([t, d, c], i) => (
          <div key={i} style={{ padding: 22, borderRight: !isMobile && i < 3 ? "2px solid #2a2a2a" : undefined, borderBottom: isMobile && i < 2 ? "2px solid #2a2a2a" : undefined }}>
            <div style={{ fontWeight: 700, fontSize: 30, letterSpacing: "-.03em", color: c as string }}>{t}</div>
            <div className="font-mono" style={{ marginTop: 8, fontSize: 11, color: "#9a9a96", lineHeight: 1.5 }}>{d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhyCanton({ isMobile }: { isMobile: boolean }) {
  const stats: [string, string, boolean][] = [
    ["$2.1T", "Private credit reached ~$2.1 trillion in 2023 (IMF) — still run on spreadsheets, email and manual agent banks.", false],
    ["0", "Settlement breaks. Both legs commit together or the transaction never happened.", true],
    ["T+0", "Reconciliation collapses from the T+7–T+20 loan-market standard to a single indivisible ledger move.", false],
  ];
  return (
    <section style={{ borderBottom: `2px solid ${INK}` }}>
      <div style={{ padding: isMobile ? "32px 20px" : 40, borderBottom: `2px solid ${INK}`, display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 16 }}>
        <h2 style={{ margin: 0, fontWeight: 700, fontSize: "clamp(32px, 7vw, 46px)", letterSpacing: "-.035em", textTransform: "uppercase" }}>
          Why it can only<br />be built on Canton
        </h2>
        <div className="font-mono" style={{ fontSize: 12, letterSpacing: ".1em", textTransform: "uppercase", color: "#666", maxWidth: 300, textAlign: isMobile ? "left" : "right" }}>
          Privacy and atomicity pull against each other on every other infrastructure.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)" }}>
        {stats.map(([n, d, accent], i) => (
          <div key={i} style={{ padding: isMobile ? "28px 20px" : 40, borderRight: !isMobile && i < 2 ? `2px solid ${INK}` : undefined, borderBottom: isMobile && i < 2 ? `2px solid ${INK}` : undefined }}>
            <div style={{ fontWeight: 700, fontSize: "clamp(52px, 13vw, 72px)", letterSpacing: "-.05em", lineHeight: 1, color: accent ? MINT : INK }}>{n}</div>
            <div className="font-mono" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55, color: "#333" }}>{d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DealSpinePreview({ isMobile }: { isMobile: boolean }) {
  return (
    <section style={{ background: PAPER, borderBottom: `2px solid ${INK}`, padding: isMobile ? "40px 20px" : "54px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 20, marginBottom: 34 }}>
        <div>
          <div className="font-mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#666" }}>Inside the OS</div>
          <h2 style={{ margin: "16px 0 0", fontWeight: 700, fontSize: "clamp(34px, 8vw, 54px)", lineHeight: 0.92, letterSpacing: "-.035em", textTransform: "uppercase" }}>
            Navigate the deal,<br />not a dashboard.
          </h2>
        </div>
        <p style={{ margin: 0, maxWidth: 360, fontSize: 15, lineHeight: 1.55, color: "#333" }}>
          No feature tabs. You move along the loan&apos;s own lifecycle — and the agent co-pilot annotates whichever stage
          you&apos;re in.
        </p>
      </div>

      <div style={{ border: `2px solid ${INK}`, background: "#fff", boxShadow: "0 8px 40px rgba(0,0,0,.16)", overflow: "hidden" }}>
        <div style={{ minHeight: 54, borderBottom: `2px solid ${INK}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Logo />
              <span style={{ fontWeight: 700, letterSpacing: "-.02em", fontSize: 15 }}>SYNDICATE</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, border: `2px solid ${INK}`, padding: "6px 12px" }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>Meridian Logistics</span>
              <span className="font-mono" style={{ fontSize: 10, color: "#666" }}>· Tranche B</span>
              <span style={{ fontSize: 10, color: "#666" }}>▾</span>
            </div>
          </div>
          <div className="font-mono" style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: MINT, animation: "sc-blink 1.8s infinite" }} />
            Ledger live
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "248px 1fr 286px" }}>
          <div style={{ borderRight: isMobile ? undefined : `2px solid ${INK}`, borderBottom: isMobile ? `2px solid ${INK}` : undefined, background: "#fafaf8", padding: "24px 22px" }}>
            <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "#666" }}>Deal lifecycle</div>
            <div style={{ marginTop: 22, display: "flex", flexDirection: isMobile ? "row" : "column", flexWrap: "wrap", gap: 15 }}>
              {[
                ["Origination", false, true],
                ["Drawdown", false, true],
                ["Interest", true, false],
                ["Secondary", false, false],
                ["Repayment", false, false],
                ["Maturity", false, false],
              ].map(([l, active, done], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, opacity: active ? 1 : done ? 0.85 : 0.5 }}>
                  <div
                    style={
                      active
                        ? { width: 24, height: 24, background: MINT, border: `3px solid ${INK}`, flex: "0 0 auto", marginLeft: isMobile ? 0 : -4 }
                        : done
                          ? { width: 16, height: 16, background: INK, flex: "0 0 auto" }
                          : { width: 16, height: 16, border: "2px solid #999", background: "#fff", flex: "0 0 auto" }
                    }
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: active ? 18 : 14, letterSpacing: active ? "-.01em" : undefined }}>{l}</div>
                    {active && !isMobile && <div className="font-mono" style={{ fontSize: 10, color: INK, fontWeight: 700 }}>Q2 accrual · ready</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: "22px 26px" }}>
            <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>You are here · Interest</div>
            <div style={{ fontWeight: 700, fontSize: 28, letterSpacing: "-.035em", marginTop: 4, marginBottom: 18 }}>Distribute Q2 interest.</div>
            <div style={{ border: `2px solid ${INK}`, background: INK, color: PAPER, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#9a9a96" }}>Atomic · 2 legs</div>
                <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>Both or neither</div>
              </div>
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 44px 1fr", alignItems: "center" }}>
                <div style={{ border: `2px solid ${MINT}`, padding: 14 }}>
                  <div className="font-mono" style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>Cash in</div>
                  <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-.03em", marginTop: 4 }}>+$0.402M</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 34, height: 34, border: `2px solid ${MINT}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 12, height: 12, background: MINT }} />
                  </div>
                </div>
                <div style={{ border: "2px solid #2a2a2a", padding: 14 }}>
                  <div className="font-mono" style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "#9a9a96", fontWeight: 700 }}>Accrual</div>
                  <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-.03em", marginTop: 4 }}>→ 0</div>
                </div>
              </div>
              <div className="font-mono" style={{ marginTop: 16, background: MINT, color: INK, textAlign: "center", padding: 12, fontWeight: 700, fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase" }}>Settle atomically →</div>
            </div>
          </div>
          <div style={{ borderLeft: isMobile ? undefined : `2px solid ${INK}`, borderTop: isMobile ? `2px solid ${INK}` : undefined, background: "#fafaf8", padding: "22px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 10, height: 10, background: MINT }} />
              <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: "-.01em" }}>Agent co-pilot</span>
            </div>
            <div style={{ border: `2px solid ${INK}`, background: "#fff", padding: "13px 15px" }}>
              <div className="font-mono" style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700, color: MINT }}>↳ Proposed sequence</div>
              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45 }}>Run Q2 accrual → pro-rata distribute to 6 holders, one atomic batch. To your slice: +$0.402M.</div>
            </div>
            <div style={{ border: `2px solid ${MINT}`, background: MINT, padding: "13px 15px" }}>
              <div className="font-mono" style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: INK, fontWeight: 700 }}>Daml authorization</div>
              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.4, color: INK }}>Agent proposes; the ledger executes only within signatory rights.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AgentCopilot({ isMobile }: { isMobile: boolean }) {
  return (
    <section style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.05fr .95fr", borderBottom: `2px solid ${INK}` }}>
      <div style={{ padding: isMobile ? "40px 20px" : "54px 40px", borderRight: isMobile ? undefined : `2px solid ${INK}`, borderBottom: isMobile ? `2px solid ${INK}` : undefined }}>
        <div className="font-mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#666" }}>03 / Intelligence</div>
        <h2 style={{ margin: "18px 0 0", fontWeight: 700, fontSize: "clamp(38px, 9vw, 54px)", lineHeight: 0.92, letterSpacing: "-.035em", textTransform: "uppercase" }}>
          Agent-bank<br />co-pilot.
        </h2>
        <p style={{ margin: "26px 0 0", maxWidth: 400, fontSize: 16, lineHeight: 1.55, color: "#333" }}>
          An LLM monitors covenants against private borrower data and sequences settlement — constrained at all times by
          on-ledger Daml authorization. It can propose. The ledger decides what it&apos;s allowed to do.
        </p>
        <div style={{ marginTop: 30, display: "inline-flex", border: `2px solid ${INK}`, flexWrap: "wrap", maxWidth: "100%" }}>
          {[
            ["Proposes", INK, "#fff"],
            ["Daml authorizes", "#fff", INK],
            ["Ledger settles", MINT, INK],
          ].map(([t, bg, col], i) => (
            <div key={i} className="font-mono" style={{ padding: "12px 18px", background: bg as string, color: col as string }}>
              <span style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", fontWeight: 700 }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: PAPER, padding: isMobile ? "28px 20px" : "30px 34px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
        <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "#666", marginBottom: 4 }}>Co-pilot log · facility #MER-2031</div>
        <div style={{ background: "#fff", border: `2px solid ${INK}`, padding: "14px 16px" }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: MINT, fontWeight: 700 }}>⚠ Covenant watch</div>
          <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.45 }}>Borrower DSCR trending toward 1.15× floor next quarter. Recommend pre-emptive notice to holders.</div>
        </div>
        <div style={{ background: "#fff", border: `2px solid ${INK}`, padding: "14px 16px" }}>
          <div className="font-mono" style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: "#666", fontWeight: 700 }}>↳ Sequence proposed</div>
          <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.45 }}>Interest accrual → pro-rata distribution to 6 holders, single atomic batch.</div>
        </div>
        <div style={{ background: INK, color: PAPER, border: `2px solid ${INK}`, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Authorized on-ledger</div>
          <div className="font-mono" style={{ fontSize: 11, color: MINT, letterSpacing: ".1em" }}>✓ COMMIT</div>
        </div>
      </div>
    </section>
  );
}

function CTA({ isMobile }: { isMobile: boolean }) {
  return (
    <section style={{ background: MINT, borderBottom: `2px solid ${INK}`, padding: isMobile ? "52px 20px" : "74px 40px", textAlign: "center" }}>
      <h2 style={{ margin: 0, fontWeight: 700, fontSize: "clamp(40px, 11vw, 88px)", lineHeight: 0.86, letterSpacing: "-.05em", textTransform: "uppercase" }}>
        Take private<br />credit on-chain.
      </h2>
      <div style={{ marginTop: 38, display: "inline-flex", border: `2px solid ${INK}`, flexWrap: "wrap", maxWidth: "100%" }}>
        <Link href="/app" style={{ padding: "18px 32px", background: INK, color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: ".04em", textTransform: "uppercase" }}>
          Enter the product
        </Link>
        <a href="#flow" style={{ padding: "18px 32px", background: MINT, fontWeight: 700, fontSize: 14, letterSpacing: ".04em", textTransform: "uppercase", borderLeft: `2px solid ${INK}` }}>
          See the flow
        </a>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer style={{ background: INK, color: "#9a9a96", padding: "34px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Logo light />
        <span style={{ color: PAPER, fontWeight: 700, letterSpacing: "-.02em", fontSize: 16 }}>SYNDICATE</span>
      </div>
      <div className="font-mono" style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>
        Confidential syndicated-lending OS · Built on Canton Network
      </div>
    </footer>
  );
}
