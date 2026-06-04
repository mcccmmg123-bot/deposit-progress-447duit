import { NextResponse } from "next/server";

const BACKEND_URL = "https://jkmykd99.u55y38.com/api/v1/index.php";
const TARGET_AMOUNT = 5000;
const MAX_PAGES = 100; // safety cap on pagination

/**
 * Username -> userId lookup (discovered from admin panel Network capture):
 *   module = /users/getAllUsers, lookup field = id (NUMERIC id).
 * The endpoint takes a numeric id and rejects a raw username with "Invalid ID.".
 */
const USER_LOOKUP_MODULE = process.env.USER_LOOKUP_MODULE || "/users/getAllUsers";
const USER_LOOKUP_USERNAME_FIELD =
  process.env.USER_LOOKUP_USERNAME_FIELD || "id";

export const dynamic = "force-dynamic";
// Pin this route handler to Singapore (closest Vercel region to the backend).
export const preferredRegion = "sin1";

// --- CORS (allow the embed to call this API from another domain) ---
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-secret",
  "Access-Control-Max-Age": "86400",
};

// JSON response helper that always attaches CORS headers.
function json(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init.headers || {}) },
  });
}

// Preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function baseAuthFields() {
  const f = new URLSearchParams();
  f.append("mamId", "10066");
  f.append("merchantId", "10066");
  f.append("accessId", process.env.BACKEND_ACCESS_ID || "");
  f.append("accessToken", process.env.BACKEND_ACCESS_TOKEN || "");
  return f;
}

async function postBackend(form) {
  const res = await fetch(BACKEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Cookie: `tk=${process.env.BACKEND_TK || ""}`,
    },
    body: form.toString(),
    cache: "no-store",
  });
  const rawText = await res.text();
  let json = null;
  try {
    json = JSON.parse(rawText);
  } catch {
    /* leave json null; caller handles */
  }
  return { res, json };
}

function toUserList(json) {
  const data = json?.data;
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.users)) return data.users;
  return [data];
}

const userIdOf = (u) => u?.id ?? u?.userId ?? u?.user_id ?? null;
const usernameOf = (u) =>
  u?.username ?? u?.userName ?? u?.loginName ?? u?.account ?? null;

/**
 * Derive a candidate NUMERIC id from a username ("4" is displayed as "A").
 * Only a candidate; verified against /users/getAllUsers. Returns null if the
 * result isn't purely numeric (e.g. "ABC123").
 */
function deriveCandidateId(username) {
  const candidate = String(username).replace(/a/gi, "4");
  return /^\d+$/.test(candidate) ? candidate : null;
}

// Malaysia is fixed UTC+8 (no DST).
const MY_OFFSET_MS = 8 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");
const fmt = (y, m0, d, hh, mm, ss) =>
  `${y}-${pad(m0 + 1)}-${pad(d)} ${pad(hh)}:${pad(mm)}:${pad(ss)}`;

/**
 * Period range in Malaysia local time. Returns the "YYYY-MM-DD HH:mm:ss"
 * strings (for the backend + response) AND the absolute epoch bounds
 * (for filtering transactions whose timestamps are in UTC).
 */
function periodRange(period) {
  const now = new Date(Date.now() + MY_OFFSET_MS); // UTC fields = MY wall-clock
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const DAY = 86400000;

  let sy, sm, sd, ey, em, ed;

  if (period === "today") {
    sy = ey = y;
    sm = em = m;
    sd = ed = d;
  } else if (period === "week") {
    const sinceMonday = (now.getUTCDay() + 6) % 7; // 0=Mon .. 6=Sun
    const monday = new Date(Date.UTC(y, m, d) - sinceMonday * DAY);
    const sunday = new Date(monday.getTime() + 6 * DAY);
    sy = monday.getUTCFullYear();
    sm = monday.getUTCMonth();
    sd = monday.getUTCDate();
    ey = sunday.getUTCFullYear();
    em = sunday.getUTCMonth();
    ed = sunday.getUTCDate();
  } else {
    // month
    sy = y;
    sm = m;
    sd = 1;
    ey = y;
    em = m;
    ed = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  }

  const sDate = fmt(sy, sm, sd, 0, 0, 0);
  const eDate = fmt(ey, em, ed, 23, 59, 59);
  // Malaysia wall-clock -> real UTC instant = wall - 8h.
  const sEpoch = Date.UTC(sy, sm, sd, 0, 0, 0) - MY_OFFSET_MS;
  const eEpoch = Date.UTC(ey, em, ed, 23, 59, 59, 999) - MY_OFFSET_MS;

  return { sDate, eDate, sEpoch, eEpoch };
}

function transactionsOf(data) {
  if (!data) return [];
  if (Array.isArray(data.transactions)) return data.transactions;
  if (Array.isArray(data.list)) return data.list;
  if (Array.isArray(data.rows)) return data.rows;
  return [];
}

function totalPageOf(data) {
  const n = Number(
    data?.totalPage ?? data?.totalPages ?? data?.pagination?.totalPage ?? 1
  );
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function txEpoch(t) {
  const s = t?.processedDateTime || t?.createdDateTime;
  const ms = s ? new Date(s).getTime() : NaN;
  return ms;
}

function fetchDepositPage(userId, pageIndex, sDate, eDate) {
  const form = baseAuthFields();
  form.append("userId", userId);
  form.append("pageIndex", String(pageIndex));
  form.append("type", "DEPOSIT");
  form.append("sDate", sDate);
  form.append("eDate", eDate);
  form.append("status", "COMPLETED");
  form.append("includeNetDeposit", "1");
  form.append("includeBankTx", "1");
  form.append("module", "/transactions/getAllTransactions");
  return postBackend(form);
}

export async function GET(request) {
  try {
    // --- Optional shared-secret gate (only enforced if env is set) ---
    const requiredSecret = process.env.PUBLIC_API_SECRET;
    if (requiredSecret) {
      const provided = request.headers.get("x-api-secret");
      if (provided !== requiredSecret) {
        return json({ success: false, message: "Unauthorized" }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const rawInput = searchParams.get("userId");

    const periodParam = (searchParams.get("period") || "month").toLowerCase();
    const period = ["today", "week", "month"].includes(periodParam)
      ? periodParam
      : "month";
    const { sDate, eDate, sEpoch, eEpoch } = periodRange(period);

    if (!rawInput || !rawInput.trim()) {
      return json(
        { success: false, message: "Invalid request" },
        { status: 400 }
      );
    }

    const input = rawInput.trim();
    const isNumeric = /^\d+$/.test(input);

    // --- Resolve userId (internal only; never returned) ---
    let userId;
    if (isNumeric) {
      userId = input;
    } else {
      const candidateId = deriveCandidateId(input);
      if (!candidateId) {
        return json(
          { success: false, message: "Invalid request" },
          { status: 422 }
        );
      }

      const lookupForm = baseAuthFields();
      lookupForm.append("module", USER_LOOKUP_MODULE);
      lookupForm.append(USER_LOOKUP_USERNAME_FIELD, candidateId);
      const lookup = await postBackend(lookupForm);

      if (!lookup.res.ok || !lookup.json || lookup.json.status !== "SUCCESS") {
        return json(
          { success: false, message: "Service temporarily unavailable" },
          { status: 502 }
        );
      }

      const user = toUserList(lookup.json).find(
        (u) => String(usernameOf(u) ?? "").toLowerCase() === input.toLowerCase()
      );
      const resolvedId = user && userIdOf(user);
      if (!resolvedId) {
        return json(
          { success: false, message: "Invalid request" },
          { status: 404 }
        );
      }
      userId = String(resolvedId);
    }

    // --- Fetch ALL transaction pages ---
    const first = await fetchDepositPage(userId, 0, sDate, eDate);
    if (!first.res.ok || !first.json || first.json.status !== "SUCCESS") {
      return json(
        { success: false, message: "Service temporarily unavailable" },
        { status: 502 }
      );
    }

    const allTx = [...transactionsOf(first.json.data)];
    const totalPage = totalPageOf(first.json.data);

    for (let p = 1; p < totalPage && p < MAX_PAGES; p++) {
      const page = await fetchDepositPage(userId, p, sDate, eDate);
      if (page.json?.status === "SUCCESS") {
        allTx.push(...transactionsOf(page.json.data));
      }
    }

    // --- Filter (type/status/date) and sum cash manually ---
    let sum = 0;
    for (const t of allTx) {
      if (String(t?.type).toUpperCase() !== "DEPOSIT") continue;
      if (String(t?.status).toUpperCase() !== "COMPLETED") continue;
      const ms = txEpoch(t);
      if (Number.isNaN(ms) || ms < sEpoch || ms > eEpoch) continue;
      sum += Number(t?.cash) || 0;
    }

    const currentAmount = Math.round(sum * 100) / 100;
    const targetAmount = TARGET_AMOUNT;
    const percent = Math.min(
      Math.round((currentAmount / targetAmount) * 100),
      100
    );

    return json({
      success: true,
      period,
      currentAmount,
      targetAmount,
      percent,
      sDate,
      eDate,
    });
  } catch (err) {
    return json(
      { success: false, message: "Service temporarily unavailable" },
      { status: 500 }
    );
  }
}
