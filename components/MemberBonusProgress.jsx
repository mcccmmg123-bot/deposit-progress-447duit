"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Compact Bonus Mission widget for the member center.
 *
 * - Single source of identity: localStorage.USER (uses USER.id).
 * - No manual input. If USER is missing/invalid -> "Please login first".
 * - Fetches period=today (Daily Rescue) and period=week (Weekly VIP) every 10s.
 * - Displays ONLY progress bars + reward milestones. Never shows id / username /
 *   name / mobile, and never shows raw backend data.
 *
 * Usage (same-origin, inside this Next app):
 *   <MemberBonusProgress />
 *
 * Usage (embedded on another site / different domain):
 *   <MemberBonusProgress apiBase="https://YOUR_VERCEL_DOMAIN" apiSecret="YOUR_PUBLIC_SECRET" />
 */

const REFRESH_MS = 10_000;

const DAILY = { target: 500, reward: 50 };
const DAILY_MILESTONES = [{ target: 500, reward: 50 }];

const WEEKLY_MAX = 5000;
const WEEKLY_MILESTONES = [
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

// Read the logged-in member's id from localStorage.USER ONLY.
function readUserId() {
  if (typeof window === "undefined") return null;
  let raw = null;
  try {
    raw = window.localStorage.getItem("USER");
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    const id = user && user.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

/* ---------- CSS chest ---------- */
function Chest({ unlocked, pulse }) {
  return (
    <div className={`mbp-chest ${unlocked ? "open" : ""} ${pulse ? "pulse" : ""}`}>
      <div className="lid" />
      <div className="body" />
    </div>
  );
}

/* ---------- Horizontal milestone track ---------- */
function Track({ value, max, milestones }) {
  const fill = clampPct(value, max);
  const nextTarget = (milestones.find((m) => value < m.target) || {}).target;
  const stops = [0, ...milestones.map((m) => m.target)];

  return (
    <div className="mbp-track">
      <div className="mbp-area">
        {milestones.map((m) => {
          const left = (m.target / max) * 100;
          const unlocked = value >= m.target;
          const isNext = m.target === nextTarget;
          return (
            <div key={m.target} className="mbp-node" style={{ left: `${left}%` }}>
              <span
                className={`mbp-pill ${unlocked ? "lit" : isNext ? "next" : ""}`}
              >
                {rmShort(m.reward)}
              </span>
              <Chest unlocked={unlocked} pulse={isNext} />
            </div>
          );
        })}
        <div className="mbp-rail">
          <div className="mbp-fill" style={{ width: `${fill}%` }} />
        </div>
        <div className="mbp-head-dot" style={{ left: `${fill}%` }} />
        {stops.map((s) => (
          <span
            key={s}
            className="mbp-scale"
            style={{ left: `${(s / max) * 100}%` }}
          >
            {s.toLocaleString("en-MY")}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function MemberBonusProgress({
  apiBase = "",
  apiSecret = "",
}) {
  const [userId, setUserId] = useState(null);
  const [resolved, setResolved] = useState(false); // finished reading storage
  const [today, setToday] = useState(0);
  const [week, setWeek] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    setUserId(readUserId());
    setResolved(true);
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const headers = apiSecret ? { "x-api-secret": apiSecret } : undefined;
    const call = async (period) => {
      const res = await fetch(
        `${apiBase}/api/deposit-progress?userId=${encodeURIComponent(
          userId
        )}&period=${period}`,
        { headers, cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || "failed");
      return Number(json.currentAmount) || 0;
    };
    try {
      const [t, w] = await Promise.all([call("today"), call("week")]);
      setToday(t);
      setWeek(w);
      setError("");
    } catch {
      setError("Unable to load bonus progress right now.");
    }
  }, [userId, apiBase, apiSecret]);

  useEffect(() => {
    if (!userId) return;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [userId, load]);

  // --- Daily derived ---
  const dailyComplete = today >= DAILY.target;
  const dailyNeed = Math.max(0, DAILY.target - today);
  const dailyStatus = dailyComplete
    ? { cls: "secured", text: `🔒 ${rmShort(DAILY.reward)} Rescue Bonus unlocked` }
    : {
        cls: "need",
        text: `⚡ Need ${rm(dailyNeed)} more to unlock ${rmShort(DAILY.reward)}`,
      };

  // --- Weekly derived (highest-tier-only) ---
  const weekly = useMemo(() => {
    const achieved =
      [...WEEKLY_MILESTONES].reverse().find((m) => week >= m.target) || null;
    const next = WEEKLY_MILESTONES.find((m) => week < m.target) || null;
    let cls = "need";
    let text;
    if (achieved && !next) {
      cls = "secured";
      text = `🔒 Tier 5 secured — ${rmShort(achieved.reward)} this week`;
    } else if (achieved && next) {
      cls = "secured";
      text = `🔒 Tier ${achieved.tier} secured — ${rmShort(
        achieved.reward
      )} · ⚡ Need ${rm(next.target - week)} more for ${rmShort(next.reward)}`;
    } else {
      text = `⚡ Need ${rm(next.target - week)} more to secure ${rmShort(
        next.reward
      )}`;
    }
    return { achieved, next, cls, text };
  }, [week]);

  const weeklyDone = weekly.achieved && !weekly.next;

  // --- Not logged in ---
  if (resolved && !userId) {
    return (
      <div className="mbp-root">
        <style>{CSS}</style>
        <div className="mbp-card">
          <div className="mbp-login">Please login first</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mbp-root">
      <style>{CSS}</style>

      {/* Daily Rescue Bonus */}
      <div className={`mbp-card ${dailyComplete ? "done" : ""}`}>
        <div className="mbp-head">
          <div>
            <h3 className="mbp-title">🛡️ Daily Rescue Bonus</h3>
            <span className="mbp-tag">DAILY MISSION</span>
          </div>
          <div className="mbp-dep">
            <div className="mbp-dep-label">TODAY DEPOSIT</div>
            <div className="mbp-dep-amt">{rm(today)}</div>
          </div>
        </div>
        <div className={`mbp-status ${dailyStatus.cls}`}>{dailyStatus.text}</div>
        <Track value={today} max={DAILY.target} milestones={DAILY_MILESTONES} />
      </div>

      {/* Weekly VIP Bonus */}
      <div className={`mbp-card ${weeklyDone ? "done" : ""}`}>
        <div className="mbp-head">
          <div>
            <h3 className="mbp-title">👑 Weekly VIP Bonus</h3>
            <span className="mbp-tag">HIGHEST TIER ONLY</span>
          </div>
          <div className="mbp-dep">
            <div className="mbp-dep-label">THIS WEEK DEPOSIT</div>
            <div className="mbp-dep-amt">{rm(week)}</div>
          </div>
        </div>
        <div className={`mbp-status ${weekly.cls}`}>{weekly.text}</div>
        <div className="mbp-unlock">
          Unlocks next Monday 12:00 AM · rewards are not cumulative
        </div>
        <Track value={week} max={WEEKLY_MAX} milestones={WEEKLY_MILESTONES} />
      </div>

      {error && <div className="mbp-err">{error}</div>}
      <div className="mbp-note">↻ Auto-refreshing every 10s</div>
    </div>
  );
}

const CSS = `
.mbp-root {
  --gold:#d4af37; --gold-l:#f5d77a; --gold-hi:#fff6cf; --line:#3a3320;
  max-width:560px; margin:0 auto;
  font-family:'Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif;
  color:#f3f3f3;
}
.mbp-root *{ box-sizing:border-box; }
.mbp-card{
  position:relative; border:1px solid var(--gold); border-radius:16px;
  padding:14px 16px; margin-bottom:14px; overflow:hidden;
  background:linear-gradient(160deg, rgba(20,18,10,0.95), rgba(10,10,10,0.97));
  box-shadow:0 0 20px rgba(212,175,55,0.12);
}
.mbp-card.done{ box-shadow:0 0 30px rgba(212,175,55,0.3); }
.mbp-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
.mbp-title{ margin:0; font-size:15px; font-weight:900; color:var(--gold-l); letter-spacing:.4px; }
.mbp-tag{ display:inline-block; margin-top:4px; font-size:9px; letter-spacing:1px; font-weight:800;
  color:var(--gold); border:1px solid var(--gold); border-radius:6px; padding:2px 6px; background:rgba(212,175,55,0.08); }
.mbp-dep{ text-align:right; white-space:nowrap; }
.mbp-dep-label{ font-size:10px; letter-spacing:1px; color:var(--gold); font-weight:800; }
.mbp-dep-amt{ font-size:26px; font-weight:900; line-height:1.05;
  background:linear-gradient(180deg,#fff,var(--gold-l) 55%,var(--gold));
  -webkit-background-clip:text; background-clip:text; color:transparent;
  filter:drop-shadow(0 0 12px rgba(212,175,55,0.5)); }
.mbp-status{ margin:8px 0 4px; font-size:12px; font-weight:700; }
.mbp-status.secured{ color:var(--gold-l); }
.mbp-status.need{ color:#ffcf6b; }
.mbp-unlock{ font-size:10.5px; color:#9a9a9a; margin-bottom:4px; }

.mbp-track{ position:relative; height:86px; }
.mbp-area{ position:absolute; left:32px; right:32px; top:4px; bottom:0; }
.mbp-node{ position:absolute; top:0; width:60px; transform:translateX(-50%); text-align:center; }
.mbp-pill{ display:inline-block; font-size:10px; font-weight:800; padding:2px 6px; border-radius:6px;
  border:1px solid #444; background:#1a1a1a; color:#9a9a9a; white-space:nowrap; }
.mbp-pill.lit{ color:#1a1407; border-color:var(--gold-hi);
  background:linear-gradient(135deg,var(--gold-l),var(--gold)); box-shadow:0 0 12px rgba(212,175,55,0.6); }
.mbp-pill.next{ color:var(--gold-l); border-color:var(--gold); background:rgba(212,175,55,0.12); }

.mbp-chest{ width:32px; height:28px; position:relative; margin:5px auto 0; }
.mbp-chest .lid{ position:absolute; top:0; left:0; right:0; height:13px; border-radius:16px 16px 0 0;
  background:linear-gradient(#5a5a5a,#3a3a3a); border:2px solid #6a6a6a; border-bottom:none; }
.mbp-chest .body{ position:absolute; bottom:0; left:1px; right:1px; height:17px; border-radius:3px 3px 5px 5px;
  background:linear-gradient(#4a4a4a,#262626); border:2px solid #5b5b5b; }
.mbp-chest.open .lid{ background:linear-gradient(#ffe9a0,#d4af37); border-color:#fff6cf; }
.mbp-chest.open .body{ background:linear-gradient(#e7c252,#b8860b); border-color:#fff0bf; }
.mbp-chest.open{ filter:drop-shadow(0 0 10px rgba(212,175,55,0.85)); }
.mbp-chest.pulse{ animation:mbpPulse 1.6s ease-in-out infinite; }
@keyframes mbpPulse{ 0%,100%{transform:scale(1);} 50%{transform:scale(1.1);} }

.mbp-rail{ position:absolute; left:0; right:0; top:54px; height:9px; border-radius:999px;
  background:#241f10; border:1px solid var(--line); overflow:hidden; }
.mbp-fill{ height:100%; border-radius:999px;
  background:linear-gradient(90deg,var(--gold),var(--gold-l)); box-shadow:0 0 12px rgba(212,175,55,0.6); }
.mbp-head-dot{ position:absolute; top:50px; width:15px; height:15px; transform:translateX(-50%);
  border-radius:50%; background:radial-gradient(circle,var(--gold-hi),var(--gold));
  box-shadow:0 0 14px var(--gold-l); z-index:3; }
.mbp-scale{ position:absolute; top:70px; transform:translateX(-50%); font-size:10px; font-weight:700; color:#9a9a9a; }

.mbp-login{ text-align:center; color:var(--gold-l); font-size:15px; font-weight:800; padding:22px 8px; }
.mbp-err{ text-align:center; color:#ff9a9a; font-size:12px; margin-bottom:8px; }
.mbp-note{ text-align:center; color:#8a8a8a; font-size:10.5px; }

@media (max-width:480px){
  .mbp-area{ left:24px; right:24px; }
  .mbp-node{ width:46px; }
  .mbp-pill{ font-size:9px; padding:2px 4px; }
  .mbp-chest{ width:26px; height:24px; }
  .mbp-dep-amt{ font-size:21px; }
}
`;
