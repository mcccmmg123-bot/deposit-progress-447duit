"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Compact, embeddable Weekly VIP Bonus progress bar.
 *
 * Reads the logged-in user from localStorage/sessionStorage (keys: USER, user,
 * member; fields: id, userId, username) — no manual input — then polls the
 * deployed API every 10s. Shows ONLY weekly deposit, next bonus, progress bar
 * and chests. Never shows userId / username / phone / bank.
 *
 * Usage:
 *   <FrontendWeeklyVipProgress
 *     apiBase="https://YOUR_VERCEL_DOMAIN"
 *     apiSecret="YOUR_PUBLIC_SECRET"
 *   />
 */

const REFRESH_MS = 10_000;
const MAX = 5000;
const MILESTONES = [
  { tier: 1, target: 1000, reward: 100 },
  { tier: 2, target: 2000, reward: 200 },
  { tier: 3, target: 3000, reward: 300 },
  { tier: 4, target: 4000, reward: 400 },
  { tier: 5, target: 5000, reward: 500 },
];

const rm = (n) =>
  "RM " +
  (Number(n) || 0).toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const rmShort = (n) => "RM " + (Number(n) || 0).toLocaleString("en-MY");
const clampPct = (v, max) =>
  Math.min(100, Math.round(((Number(v) || 0) / max) * 100));

function pickId(v) {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") {
    const s = String(v).trim();
    return s || null;
  }
  if (typeof v === "object") {
    return (
      v.id ||
      v.userId ||
      v.username ||
      (v.data && pickId(v.data)) ||
      (v.user && pickId(v.user)) ||
      null
    );
  }
  return null;
}

function readUser() {
  if (typeof window === "undefined") return null;
  const keys = ["USER", "user", "member"];
  const stores = [];
  try { stores.push(window.localStorage); } catch {}
  try { stores.push(window.sessionStorage); } catch {}
  for (const store of stores) {
    for (const k of keys) {
      let raw = null;
      try { raw = store.getItem(k); } catch {}
      if (!raw) continue;
      let val = raw;
      try { val = JSON.parse(raw); } catch { /* plain string id */ }
      const id = pickId(val);
      if (id) return String(id);
    }
  }
  return null;
}

export default function FrontendWeeklyVipProgress({
  apiBase = "https://YOUR_VERCEL_DOMAIN",
  apiSecret = "YOUR_PUBLIC_SECRET",
}) {
  const [userId, setUserId] = useState(null);
  const [week, setWeek] = useState(0);
  const [state, setState] = useState("loading"); // loading | ready | nouser | error

  useEffect(() => {
    setUserId(readUser());
  }, []);

  const load = useCallback(async () => {
    if (!userId) {
      setState("nouser");
      return;
    }
    try {
      const url =
        `${apiBase}/api/deposit-progress?userId=${encodeURIComponent(
          userId
        )}&period=week`;
      const res = await fetch(url, {
        headers: { "x-api-secret": apiSecret },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "failed");
      setWeek(Number(json.currentAmount) || 0);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [userId, apiBase, apiSecret]);

  useEffect(() => {
    if (userId === null) return; // wait until user read attempt finished
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [userId, load]);

  const view = useMemo(() => {
    const achieved =
      [...MILESTONES].reverse().find((m) => week >= m.target) || null;
    const next = MILESTONES.find((m) => week < m.target) || null;
    const nextTarget = next ? next.target : null;
    const fill = clampPct(week, MAX);

    let statusCls = "need";
    let statusTxt;
    if (achieved && !next) {
      statusCls = "secured";
      statusTxt = `🔒 Tier 5 secured — ${rmShort(achieved.reward)} this week`;
    } else if (achieved && next) {
      statusCls = "secured";
      statusTxt = `🔒 Tier ${achieved.tier} secured — ${rmShort(
        achieved.reward
      )} · ⚡ Need ${rm(next.target - week)} more for ${rmShort(next.reward)}`;
    } else {
      statusTxt = `⚡ Need ${rm(next.target - week)} more to secure ${rmShort(
        next.reward
      )}`;
    }
    return { achieved, next, nextTarget, fill, statusCls, statusTxt };
  }, [week]);

  const done = view.achieved && !view.next;
  const stops = [0, 1000, 2000, 3000, 4000, 5000];

  return (
    <div className="wvip-root">
      <style>{CSS}</style>

      {state === "loading" && (
        <div className="wvip-card">
          <div className="wvip-msg">Loading Weekly VIP Bonus…</div>
        </div>
      )}
      {state === "nouser" && (
        <div className="wvip-card">
          <div className="wvip-msg">
            Please log in to view your Weekly VIP Bonus.
          </div>
        </div>
      )}
      {state === "error" && (
        <div className="wvip-card">
          <div className="wvip-msg">Unable to load bonus progress right now.</div>
        </div>
      )}
      {state === "ready" && (
        <div className={`wvip-card ${done ? "done" : ""}`}>
          <div className="wvip-head">
            <div>
              <h3 className="wvip-title">👑 Weekly VIP Bonus</h3>
              <span className="wvip-tag">HIGHEST TIER ONLY</span>
            </div>
            <div className="wvip-dep">
              <div className="wvip-dep-label">THIS WEEK DEPOSIT</div>
              <div className="wvip-dep-amt">{rm(week)}</div>
            </div>
          </div>

          <div className={`wvip-status ${view.statusCls}`}>{view.statusTxt}</div>
          <div className="wvip-unlock">
            Bonus unlocks next Monday 12:00 AM · rewards are not cumulative
          </div>

          <div className="wvip-track">
            <div className="wvip-area">
              {MILESTONES.map((m) => {
                const left = (m.target / MAX) * 100;
                const unlocked = week >= m.target;
                const isNext = m.target === view.nextTarget;
                return (
                  <div
                    key={m.target}
                    className="wvip-node"
                    style={{ left: `${left}%` }}
                  >
                    <span
                      className={`wvip-pill ${
                        unlocked ? "lit" : isNext ? "next" : ""
                      }`}
                    >
                      {rmShort(m.reward)}
                    </span>
                    <div
                      className={`wvip-chest ${unlocked ? "open" : "lock"} ${
                        isNext ? "pulse" : ""
                      }`}
                    >
                      <div className="lid" />
                      <div className="body" />
                    </div>
                  </div>
                );
              })}

              <div className="wvip-rail">
                <div className="wvip-fill" style={{ width: `${view.fill}%` }} />
              </div>
              <div className="wvip-head-dot" style={{ left: `${view.fill}%` }} />

              {stops.map((s) => (
                <span
                  key={s}
                  className="wvip-scale"
                  style={{ left: `${(s / MAX) * 100}%` }}
                >
                  {s.toLocaleString("en-MY")}
                </span>
              ))}
            </div>
          </div>

          <div className="wvip-note">↻ Auto-refreshing every 10s</div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.wvip-root {
  --gold:#d4af37; --gold-l:#f5d77a; --gold-hi:#fff6cf; --line:#3a3320;
  max-width:560px; margin:0 auto; padding:4px;
  font-family:'Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif;
  color:#f3f3f3;
}
.wvip-root *{ box-sizing:border-box; }
.wvip-card{
  position:relative; border:1px solid var(--gold); border-radius:16px;
  padding:16px 18px; overflow:hidden;
  background:linear-gradient(160deg, rgba(20,18,10,0.95), rgba(10,10,10,0.97));
  box-shadow:0 0 22px rgba(212,175,55,0.14);
}
.wvip-card.done{ box-shadow:0 0 34px rgba(212,175,55,0.32); }
.wvip-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.wvip-title{ margin:0; font-size:16px; font-weight:900; color:var(--gold-l); letter-spacing:.5px; }
.wvip-tag{ display:inline-block; margin-top:4px; font-size:9px; letter-spacing:1px; font-weight:800;
  color:var(--gold); border:1px solid var(--gold); border-radius:6px; padding:2px 6px; background:rgba(212,175,55,0.08); }
.wvip-dep{ text-align:right; white-space:nowrap; }
.wvip-dep-label{ font-size:10px; letter-spacing:1px; color:var(--gold); font-weight:800; }
.wvip-dep-amt{ font-size:30px; font-weight:900; line-height:1.05;
  background:linear-gradient(180deg,#fff,var(--gold-l) 55%,var(--gold));
  -webkit-background-clip:text; background-clip:text; color:transparent;
  filter:drop-shadow(0 0 12px rgba(212,175,55,0.5)); }
.wvip-status{ margin:10px 0 6px; font-size:12.5px; font-weight:700; }
.wvip-status.secured{ color:var(--gold-l); }
.wvip-status.need{ color:#ffcf6b; }
.wvip-unlock{ font-size:11px; color:#9a9a9a; margin-bottom:6px; }

.wvip-track{ position:relative; height:90px; }
.wvip-area{ position:absolute; left:34px; right:34px; top:4px; bottom:0; }
.wvip-node{ position:absolute; top:0; width:62px; transform:translateX(-50%); text-align:center; }
.wvip-pill{ display:inline-block; font-size:10px; font-weight:800; padding:2px 6px; border-radius:6px;
  border:1px solid #444; background:#1a1a1a; color:#9a9a9a; white-space:nowrap; }
.wvip-pill.lit{ color:#1a1407; border-color:var(--gold-hi);
  background:linear-gradient(135deg,var(--gold-l),var(--gold)); box-shadow:0 0 12px rgba(212,175,55,0.6); }
.wvip-pill.next{ color:var(--gold-l); border-color:var(--gold); background:rgba(212,175,55,0.12); }

.wvip-chest{ width:34px; height:30px; position:relative; margin:5px auto 0; }
.wvip-chest .lid{ position:absolute; top:0; left:0; right:0; height:14px; border-radius:18px 18px 0 0;
  background:linear-gradient(#5a5a5a,#3a3a3a); border:2px solid #6a6a6a; border-bottom:none; }
.wvip-chest .body{ position:absolute; bottom:0; left:1px; right:1px; height:18px; border-radius:3px 3px 5px 5px;
  background:linear-gradient(#4a4a4a,#262626); border:2px solid #5b5b5b; }
.wvip-chest.open .lid{ background:linear-gradient(#ffe9a0,#d4af37); border-color:#fff6cf; }
.wvip-chest.open .body{ background:linear-gradient(#e7c252,#b8860b); border-color:#fff0bf; }
.wvip-chest.open{ filter:drop-shadow(0 0 10px rgba(212,175,55,0.85)); }
.wvip-chest.pulse{ animation:wvipPulse 1.6s ease-in-out infinite; }
@keyframes wvipPulse{ 0%,100%{transform:scale(1);} 50%{transform:scale(1.1);} }

.wvip-rail{ position:absolute; left:0; right:0; top:56px; height:10px; border-radius:999px;
  background:#241f10; border:1px solid var(--line); overflow:hidden; }
.wvip-fill{ height:100%; border-radius:999px;
  background:linear-gradient(90deg,var(--gold),var(--gold-l)); box-shadow:0 0 12px rgba(212,175,55,0.6); }
.wvip-head-dot{ position:absolute; top:52px; width:16px; height:16px; transform:translateX(-50%);
  border-radius:50%; background:radial-gradient(circle,var(--gold-hi),var(--gold));
  box-shadow:0 0 14px var(--gold-l); z-index:3; }
.wvip-scale{ position:absolute; top:72px; transform:translateX(-50%); font-size:10px; font-weight:700; color:#9a9a9a; }

.wvip-note{ font-size:10.5px; color:#8a8a8a; text-align:center; margin-top:8px; }
.wvip-msg{ text-align:center; color:#999; font-size:13px; padding:18px 8px; }

@media (max-width:480px){
  .wvip-area{ left:24px; right:24px; }
  .wvip-node{ width:48px; }
  .wvip-pill{ font-size:9px; padding:2px 4px; }
  .wvip-chest{ width:28px; height:26px; }
  .wvip-dep-amt{ font-size:24px; }
}
`;
