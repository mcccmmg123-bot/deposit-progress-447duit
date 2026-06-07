import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "";
const MERCHANT_ID = process.env.BACKEND_MERCHANT_ID || "";
const TARGET_AMOUNT = 5000;
const MAX_PAGES = 100;

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

function corsFor() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-secret",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsFor() });
}

function reply(body, status = 200) {
  return NextResponse.json(body, { status, headers: corsFor() });
}

function baseAuthFields() {
  const f = new URLSearchParams();
  f.append("mamId", MERCHANT_ID);
  f.append("merchantId", MERCHANT_ID);
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
  } catch {}

  return { res, json };
}

const MY_OFFSET_MS = 8 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, "0");

function fmt(y, m0, d, hh, mm, ss) {
  return `${y}-${pad(m0 + 1)}-${pad(d)} ${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

function periodRange(period) {
  const now = new Date(Date.now() + MY_OFFSET_MS);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  let sy = y, sm = m, sd = d;
  let ey = y, em = m, ed = d;

  if (period === "week") {
    const DAY = 86400000;
    const sinceMonday = (now.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(y, m, d) - sinceMonday * DAY);
    const sunday = new Date(monday.getTime() + 6 * DAY);

    sy = monday.getUTCFullYear();
    sm = monday.getUTCMonth();
    sd = monday.getUTCDate();

    ey = sunday.getUTCFullYear();
    em = sunday.getUTCMonth();
    ed = sunday.getUTCDate();
  }

  if (period === "month") {
    sy = y;
    sm = m;
    sd = 1;
    ey = y;
    em = m;
    ed = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  }

  const sDate = fmt(sy, sm, sd, 0, 0, 0);
  const eDate = fmt(ey, em, ed, 23, 59, 59);

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
  const n = Number(data?.totalPage ?? data?.totalPages ?? 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function txEpoch(t) {
  const s = t?.processedDateTime || t?.createdDateTime;
  return s ? new Date(s).getTime() : NaN;
}

async function fetchDepositPage(userId, pageIndex, sDate, eDate) {
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
    const requiredSecret = process.env.PUBLIC_API_SECRET || "";
    const providedSecret = request.headers.get("x-api-secret") || "";

    if (requiredSecret && providedSecret !== requiredSecret) {
      return reply({ success: false, message: "Unauthorized" }, 401);
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const periodParam = (searchParams.get("period") || "today").toLowerCase();
    const period = ["today", "week", "month"].includes(periodParam)
      ? periodParam
      : "today";

    if (!userId) {
      return reply({ success: false, message: "Invalid request" }, 400);
    }

    const { sDate, eDate, sEpoch, eEpoch } = periodRange(period);

    const first = await fetchDepositPage(userId, 0, sDate, eDate);

    if (!first.res.ok || !first.json || first.json.status !== "SUCCESS") {
      return reply(
        { success: false, message: "Service temporarily unavailable" },
        502
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

    let sum = 0;

    for (const t of allTx) {
      if (String(t?.type).toUpperCase() !== "DEPOSIT") continue;
      if (String(t?.status).toUpperCase() !== "COMPLETED") continue;

      const ms = txEpoch(t);
      if (Number.isNaN(ms) || ms < sEpoch || ms > eEpoch) continue;

      sum += Number(t?.cash) || 0;
    }

    const currentAmount = Math.round(sum * 100) / 100;
    const percent = Math.min(
      Math.round((currentAmount / TARGET_AMOUNT) * 100),
      100
    );

    return reply({
      success: true,
      period,
      currentAmount,
      targetAmount: TARGET_AMOUNT,
      percent,
      sDate,
      eDate,
    });
  } catch (err) {
    return reply(
      { success: false, message: "Service temporarily unavailable" },
      500
    );
  }
}