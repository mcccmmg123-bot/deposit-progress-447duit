"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const REFRESH_MS = 10_000;

const API_SECRET = "447duit123";

// Daily Rescue Bonus
const DAILY = { target: 500, reward: 50 };
const DAILY_MILESTONES = [{ target: 500, reward: 50 }];

// Weekly VIP Bonus (highest-tier-only, NOT cumulative)
const WEEKLY_MAX = 5000;
const WEEKLY_MILESTONES = [
  { tier: 1, target: 1000, reward: 100 },
  { tier: 2, target: 2000, reward: 200 },
  { tier: 3, target: 3000, reward: 300 },
  { tier: 4, target: 4000, reward: 400 },
  { tier: 5, target: 5000, reward: 500 },
];

function formatRM(value) {
  const n = Number(value) || 0;
  return (
    "RM " +
    n.toLocaleString("en-MY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

const rmShort = (n) => "RM " + (Number(n) || 0).toLocaleString("en-MY");

const pct = (amount, target) =>
  Math.min(100, Math.round(((Number(amount) || 0) / target) * 100));

/* ---------- CSS chest (locked / unlocked) ---------- */
function Chest({ unlocked, pulse }) {
  return (
    <div
      className={`chest ${unlocked ? "open" : "lock"} ${pulse ? "pulse" : ""}`}
    >
      <div className="chest-lid" />
      <div className="chest-body" />
      <div className="chest-lock" />
    </div>
  );
}

/* ---------- Horizontal milestone track ---------- */
function Track({ value, max, milestones }) {
  const fill = pct(value, max);
  const nextTarget = (milestones.find((m) => value < m.target) || {}).target;
  const stops = [0, ...milestones.map((m) => m.target)];

  return (
    <div className="track">
      <div className="rail-area">
        {milestones.map((m) => {
          const left = (m.target / max) * 100;
          const unlocked = value >= m.target;
          const isNext = m.target === nextTarget;
          return (
            <div key={m.target} className="node" style={{ left: `${left}%` }}>
              <span
                className={`node-pill ${
                  unlocked ? "lit" : isNext ? "next" : ""
                }`}
              >
                {rmShort(m.reward)}
              </span>
              <Chest unlocked={unlocked} pulse={isNext} />
            </div>
          );
        })}

        <div className="rail">
          <div className="rail-fill" style={{ width: `${fill}%` }} />
        </div>
        <div className="rail-head" style={{ left: `${fill}%` }} />

        {stops.map((s) => (
          <span
            key={s}
            className="scale-num"
            style={{ left: `${(s / max) * 100}%` }}
          >
            {s.toLocaleString("en-MY")}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [inputId, setInputId] = useState("");
  const [activeId, setActiveId] = useState("");
  const [today, setToday] = useState(0);
  const [week, setWeek] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const intervalRef = useRef(null);

  const fetchMissions = useCallback(async (userId, { silent } = {}) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const call = async (period) => {
        const res = await fetch(
  `/api/deposit-progress?userId=${encodeURIComponent(
    userId
  )}&period=${period}`,
  {
    cache: "no-store",
    headers: {
      "x-api-secret": API_SECRET,
    },
  }
);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(
            json.message || json.error || `Request failed (${res.status})`
          );
        }
        return Number(json.currentAmount) || 0;
      };

      const [todayAmt, weekAmt] = await Promise.all([
        call("today"),
        call("week"),
      ]);
      setToday(todayAmt);
      setWeek(weekAmt);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeId) return;
    fetchMissions(activeId);
    intervalRef.current = setInterval(() => {
      fetchMissions(activeId, { silent: true });
    }, REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeId, fetchMissions]);

  const handleLoad = (e) => {
  e.preventDefault();

  const trimmed = inputId
    .trim()
    .replace(/A/gi, "4");

  if (!trimmed) {
    setError("Please enter a userId");
    return;
  }

  setToday(0);
  setWeek(0);
  setActiveId(trimmed);
};

  // --- Daily status ---
  const dailyComplete = today >= DAILY.target;
  const dailyNeed = Math.max(0, DAILY.target - today);
  const dailyStatus = dailyComplete
    ? { type: "secured", text: `${rmShort(DAILY.reward)} Rescue Bonus unlocked` }
    : {
        type: "need",
        text: `Need ${formatRM(dailyNeed)} more to unlock ${rmShort(
          DAILY.reward
        )}`,
      };

  // --- Weekly status (highest-tier-only, unlocks next Monday) ---
  const achievedTier =
    [...WEEKLY_MILESTONES].reverse().find((m) => week >= m.target) || null;
  const nextTier = WEEKLY_MILESTONES.find((m) => week < m.target) || null;

  const weeklyStatus = [];
  if (achievedTier) {
    weeklyStatus.push({
      type: "secured",
      text: `Tier ${achievedTier.tier} secured — ${rmShort(
        achievedTier.reward
      )} unlocks next Monday 12:00 AM`,
    });
  }
  if (nextTier) {
    weeklyStatus.push({
      type: "need",
      text: `Need ${formatRM(nextTier.target - week)} more to secure ${rmShort(
        nextTier.reward
      )} bonus`,
    });
  }

  const showMissions = activeId && !loading && !error;

  return (
    <div className="wrap">
      <style>{CSS}</style>

      <h1 className="title">
        <span className="laurel">🌿</span>{" "}
        <span className="gold">BONUS MISSION</span>{" "}
        <span className="silver">PROGRESS</span>{" "}
        <span className="laurel">🌿</span>
      </h1>

      <form onSubmit={handleLoad} className="form">
        <input
          className="input"
          value={inputId}
          onChange={(e) => setInputId(e.target.value)}
          placeholder="Enter userId (e.g. 19319AA28)"
        />
        <button type="submit" className="btn">
          Load
        </button>
      </form>

      {!activeId && !loading && !error && (
        <p className="muted">Enter a userId and press Load to begin missions.</p>
      )}
      {loading && <p className="muted">Loading missions…</p>}
      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {showMissions && (
        <>
          {/* ============ Daily Rescue Bonus ============ */}
          <section className={`card ${dailyComplete ? "done" : ""}`}>
            <div className="card-head">
              <div className="ch-left">
                <span className="ch-icon">🛡️</span>
                <div>
                  <div className="ch-title-row">
                    <h2 className="card-title">Daily Rescue Bonus</h2>
                    <span className="tag">DAILY MISSION</span>
                  </div>
                  <div className="card-sub">
                    Target: Deposit {formatRM(DAILY.target)} today
                  </div>
                </div>
              </div>
              <div className="ch-right">
                <div className="dep-label">TODAY DEPOSIT</div>
                <div className="dep-big">{formatRM(today)}</div>
              </div>
            </div>

            <div className="status-line">
              <span className={`status-item ${dailyStatus.type}`}>
                {dailyStatus.type === "secured" ? "✓ " : "⚡ "}
                {dailyStatus.text}
              </span>
            </div>

            <Track
              value={today}
              max={DAILY.target}
              milestones={DAILY_MILESTONES}
            />
          </section>

          {/* ============ Weekly VIP Bonus ============ */}
          <section className={`card ${achievedTier && !nextTier ? "done" : ""}`}>
            <div className="card-head">
              <div className="ch-left">
                <span className="ch-icon">👑</span>
                <div>
                  <div className="ch-title-row">
                    <h2 className="card-title">Weekly VIP Bonus</h2>
                    <span className="tag">HIGHEST TIER ONLY</span>
                  </div>
                  <div className="card-sub">
                    Deposit this week to unlock your Weekly VIP Bonus next Monday
                    at 12:00 AM.
                  </div>
                  <div className="card-sub gold-sub">
                    Highest tier only — rewards are not cumulative.
                  </div>
                </div>
              </div>
              <div className="ch-right">
                <div className="dep-label">THIS WEEK DEPOSIT</div>
                <div className="dep-big">{formatRM(week)}</div>
              </div>
            </div>

            <div className="status-line">
              {weeklyStatus.map((s, i) => (
                <span key={i} className={`status-item ${s.type}`}>
                  {s.type === "secured" ? "🔒 " : "⚡ "}
                  {s.text}
                </span>
              ))}
            </div>

            <Track value={week} max={WEEKLY_MAX} milestones={WEEKLY_MILESTONES} />
          </section>

          {/* ============ Rule + Example ============ */}
          <div className="rule-row">
            <div className="rule-card">
              <span className="rule-badge">HIGHEST TIER ONLY</span>
              <p>
                Rewards are <b>not cumulative</b>. You will only receive the
                bonus from the highest tier achieved.
              </p>
            </div>
            <div className="rule-card">
              <span className="rule-badge dark">EXAMPLE</span>
              <p>
                If you reach <b>RM 5,000</b> weekly deposit, you will receive{" "}
                <b>RM 500.00</b> only. Lower tier rewards are not added together.
              </p>
            </div>
          </div>
        </>
      )}

      {activeId && <p className="footer">↻ Auto-refreshing every 10s</p>}
    </div>
  );
}

const CSS = `
:root {
  --gold: #d4af37;
  --gold-l: #f5d77a;
  --gold-hi: #fff6cf;
  --panel: rgba(20,18,10,0.92);
  --line: #3a3320;
}
* { box-sizing: border-box; }
.wrap {
  min-height: 100vh; margin: 0 auto; max-width: 1080px; padding: 26px 18px 60px;
  color: #f3f3f3;
  font-family: 'Segoe UI', system-ui, -apple-system, Helvetica, Arial, sans-serif;
  background:
    radial-gradient(1200px 500px at 50% -10%, #1c1608 0%, rgba(10,10,10,0) 60%),
    radial-gradient(circle at top, #15110a 0%, #0a0a0a 55%, #000 100%);
}
.title {
  text-align: center; font-size: 34px; font-weight: 900; letter-spacing: 1px;
  font-style: italic; margin: 4px 0 20px;
}
.title .gold {
  background: linear-gradient(180deg, var(--gold-hi), var(--gold-l) 55%, var(--gold));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 16px rgba(212,175,55,0.5));
}
.title .silver {
  background: linear-gradient(180deg, #ffffff, #c9c9c9 60%, #8f8f8f);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.title .laurel { -webkit-text-fill-color: initial; filter: drop-shadow(0 0 8px rgba(212,175,55,0.4)); }
@media (max-width: 560px) { .title { font-size: 24px; } }

.form { display: flex; gap: 10px; max-width: 520px; margin: 0 auto 22px; }
.input {
  flex: 1; padding: 13px 16px; border-radius: 12px;
  border: 1px solid var(--line); background: #141414; color: #fff;
  font-size: 15px; outline: none;
}
.input:focus { border-color: var(--gold); }
.btn {
  padding: 13px 26px; border-radius: 12px; border: none; cursor: pointer;
  background: linear-gradient(135deg, var(--gold-l), var(--gold));
  color: #1a1407; font-weight: 800; font-size: 15px;
  box-shadow: 0 4px 18px rgba(212,175,55,0.3);
}
.btn:hover { filter: brightness(1.06); }

.muted { text-align:center; color:#999; font-size:14px; }
.error {
  max-width: 520px; margin: 0 auto;
  background: rgba(180,40,40,0.15); border: 1px solid #b42828;
  color: #ff9a9a; padding: 12px 14px; border-radius: 10px; font-size: 14px;
}

/* ===== Cards ===== */
.card {
  position: relative; border: 1px solid var(--gold); border-radius: 20px;
  padding: 22px 24px; margin-bottom: 18px; overflow: hidden;
  background: linear-gradient(160deg, var(--panel), rgba(10,10,10,0.96));
  box-shadow: 0 0 26px rgba(212,175,55,0.12);
}
.card.done { box-shadow: 0 0 40px rgba(212,175,55,0.3); animation: glow 2.6s ease-in-out infinite; }
@keyframes glow {
  0%,100% { box-shadow: 0 0 26px rgba(212,175,55,0.18); }
  50%     { box-shadow: 0 0 46px rgba(212,175,55,0.42); }
}

.card-head {
  display:flex; justify-content:space-between; align-items:flex-start;
  gap:16px; margin-bottom: 14px; flex-wrap: wrap;
}
.ch-left { display:flex; gap:12px; align-items:flex-start; min-width: 0; }
.ch-icon { font-size: 30px; line-height: 1; filter: drop-shadow(0 0 8px rgba(212,175,55,0.5)); }
.ch-title-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.card-title { margin: 0; font-size: 22px; font-weight: 900; color: var(--gold-l); letter-spacing: 0.5px; }
.tag {
  font-size: 10px; letter-spacing: 1px; font-weight: 800; color: var(--gold);
  border: 1px solid var(--gold); border-radius: 8px; padding: 3px 8px;
  background: rgba(212,175,55,0.08);
}
.card-sub { margin-top: 5px; font-size: 13px; color: #b9b9b9; max-width: 420px; }
.gold-sub { color: var(--gold-l); font-weight: 600; }

/* Big deposit display (focal point) */
.ch-right { text-align: right; margin-left: auto; }
.dep-label { font-size: 12px; letter-spacing: 1.5px; color: var(--gold); font-weight: 800; }
.dep-big {
  font-size: 50px; font-weight: 900; line-height: 1.02; margin-top: 2px;
  background: linear-gradient(180deg, #ffffff, var(--gold-l) 55%, var(--gold));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 18px rgba(212,175,55,0.55));
  white-space: nowrap;
}
@media (max-width: 640px) {
  .ch-right { text-align: left; margin-left: 42px; }
  .dep-big { font-size: 32px; }
}

/* Status wording */
.status-line { display: flex; flex-direction: column; gap: 5px; margin: 4px 0 16px; }
.status-item { font-size: 14px; font-weight: 700; }
.status-item.secured { color: var(--gold-l); }
.status-item.need { color: #ffcf6b; }

/* ===== Track ===== */
.track { position: relative; height: 144px; }
.rail-area { position: absolute; left: 44px; right: 44px; top: 8px; bottom: 0; }

.node { position: absolute; top: 0; width: 88px; transform: translateX(-50%); text-align: center; }
.node-pill {
  display: inline-block; font-size: 12px; font-weight: 800; padding: 3px 9px;
  border-radius: 8px; border: 1px solid #444; background: #1a1a1a; color: #9a9a9a;
  white-space: nowrap;
}
.node-pill.lit {
  color: #1a1407; border-color: var(--gold-hi);
  background: linear-gradient(135deg, var(--gold-l), var(--gold));
  box-shadow: 0 0 16px rgba(212,175,55,0.6);
}
.node-pill.next { color: var(--gold-l); border-color: var(--gold); background: rgba(212,175,55,0.12); }

/* CSS chest */
.chest { width: 54px; height: 46px; position: relative; margin: 8px auto 0; }
.chest-body {
  position: absolute; bottom: 0; left: 2px; right: 2px; height: 27px;
  border-radius: 4px 4px 7px 7px;
  background: linear-gradient(#4a4a4a, #262626); border: 2px solid #5b5b5b;
}
.chest-lid {
  position: absolute; top: 0; left: 0; right: 0; height: 22px;
  border-radius: 26px 26px 0 0;
  background: linear-gradient(#5a5a5a, #3a3a3a); border: 2px solid #6a6a6a; border-bottom: none;
}
.chest-lock {
  position: absolute; top: 15px; left: 50%; transform: translateX(-50%);
  width: 9px; height: 11px; border-radius: 2px; background: #8a8a8a; z-index: 3;
  box-shadow: 0 0 0 2px #2a2a2a;
}
.chest.open .chest-body { background: linear-gradient(#e7c252, #b8860b); border-color: #fff0bf; }
.chest.open .chest-lid { background: linear-gradient(#ffe9a0, #d4af37); border-color: #fff6cf; }
.chest.open .chest-lock { background: #fff2c0; box-shadow: 0 0 0 2px #7a5a00, 0 0 10px #ffe9a0; }
.chest.open { filter: drop-shadow(0 0 13px rgba(212,175,55,0.85)); }
.chest.pulse { animation: chestPulse 1.6s ease-in-out infinite; }
@keyframes chestPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.09); } }

/* rail */
.rail {
  position: absolute; left: 0; right: 0; top: 90px; height: 14px;
  border-radius: 999px; background: #241f10; border: 1px solid var(--line); overflow: hidden;
}
.rail-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--gold), var(--gold-l));
  box-shadow: 0 0 16px rgba(212,175,55,0.6);
}
.rail-head {
  position: absolute; top: 85px; width: 22px; height: 22px; transform: translateX(-50%);
  border-radius: 50%; background: radial-gradient(circle, var(--gold-hi), var(--gold));
  box-shadow: 0 0 18px var(--gold-l); z-index: 4;
}
.scale-num {
  position: absolute; top: 112px; transform: translateX(-50%);
  font-size: 13px; font-weight: 700; color: #bbb;
}

@media (max-width: 560px) {
  .rail-area { left: 30px; right: 30px; }
  .node { width: 64px; }
  .node-pill { font-size: 10px; padding: 2px 6px; }
  .chest { width: 42px; height: 38px; }
  .chest-lid { height: 18px; }
  .chest-body { height: 22px; }
  .chest-lock { top: 12px; }
  .scale-num { font-size: 11px; }
}

/* ===== Rule row ===== */
.rule-row { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
@media (max-width: 860px) { .rule-row { grid-template-columns: 1fr; } }
.rule-card {
  border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px;
  background: linear-gradient(160deg, var(--panel), rgba(10,10,10,0.96));
}
.rule-badge {
  display: inline-block; margin-bottom: 8px; padding: 4px 12px; border-radius: 8px;
  font-size: 11px; letter-spacing: 1px; font-weight: 900; color: #1a1407;
  background: linear-gradient(135deg, var(--gold-l), var(--gold));
}
.rule-badge.dark { color: var(--gold-l); background: #1a1a1a; border: 1px solid var(--gold); }
.rule-card p { margin: 0; font-size: 13px; line-height: 1.6; color: #c7c7c7; }
.rule-card b { color: #fff; }

.footer { text-align: center; color: #7a7a7a; font-size: 12px; margin-top: 20px; }
`;
