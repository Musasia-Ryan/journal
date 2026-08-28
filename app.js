const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let trades = [];

// --- Ticker: reference rates for your four tracked pairs ---
// Source: Frankfurter (ECB reference rates, no key required).
// Updates once per trading day (~16:00 CET) — not intraday tick data.
// To upgrade to true real-time (60s) ticks later, swap this fetch for a
// paid provider (e.g. Twelve Data, ExchangeRate-API Pro) that requires an API key.
const TICKER_PAIRS = ["EURUSD", "USDJPY", "USDCHF", "AUDUSD"];

async function loadTicker() {
  const el = document.getElementById("ticker");
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,JPY,CHF,AUD");
    const data = await res.json();
    const r = data.rates;

    const values = {
      EURUSD: 1 / r.EUR,
      USDJPY: r.JPY,
      USDCHF: r.CHF,
      AUDUSD: 1 / r.AUD,
    };

    el.innerHTML = TICKER_PAIRS.map((pair) => {
      const val = values[pair];
      const decimals = pair === "USDJPY" ? 3 : 5;
      return `
        <div class="ticker-item">
          <span class="ticker-pair">${pair.slice(0, 3)}/${pair.slice(3)}</span>
          <span class="ticker-value">${val.toFixed(decimals)}</span>
        </div>`;
    }).join("");
  } catch (e) {
    console.error("Ticker load error:", e);
    el.innerHTML = '<p class="ticker-loading">Could not load rates right now.</p>';
  }
}

loadTicker();

function fmt(n) {
  return Number(n).toLocaleString("en-KE", { maximumFractionDigits: 2 });
}

async function loadTrades() {
  const { data, error } = await sb
    .from("trades")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading trades:", error);
    document.getElementById("history").innerHTML =
      '<p class="empty-state">Could not load trades. Check your config.js credentials and Supabase table setup.</p>';
    return;
  }
  trades = data || [];
  render();
}

async function addTrade(trade) {
  const { error } = await sb.from("trades").insert([trade]);
  if (error) {
    console.error("Error adding trade:", error);
    return false;
  }
  return true;
}

function renderStats() {
  const closed = trades.filter(
    (t) => t.outcome === "win" || t.outcome === "loss" || t.outcome === "breakeven"
  );
  const wins = closed.filter((t) => t.outcome === "win").length;
  const winRate = closed.length ? Math.round((wins / closed.length) * 100) : 0;

  let netKes = 0;
  closed.forEach((t) => {
    const risk = Number(t.risk) || 0;
    if (t.outcome === "win") {
      const entry = Number(t.entry),
        stop = Number(t.stop),
        target = Number(t.target);
      const rr =
        entry && stop && target && Math.abs(entry - stop) > 0
          ? Math.abs(target - entry) / Math.abs(entry - stop)
          : 2;
      netKes += risk * rr;
    } else if (t.outcome === "loss") {
      netKes -= risk;
    }
  });

  const stats = [
    { label: "Total trades", value: trades.length },
    { label: "Closed trades", value: closed.length },
    { label: "Win rate", value: winRate + "%" },
    { label: "Net KES", value: (netKes >= 0 ? "+" : "") + fmt(netKes.toFixed(0)) },
  ];

  document.getElementById("stats").innerHTML = stats
    .map(
      (s) =>
        `<div class="stat-card"><p class="label">${s.label}</p><p class="value">${s.value}</p></div>`
    )
    .join("");
}

function outcomeBadge(outcome) {
  const map = {
    win: ["Win", "badge-win"],
    loss: ["Loss", "badge-loss"],
    breakeven: ["Breakeven", "badge-breakeven"],
    open: ["Open", "badge-open"],
  };
  const [label, cls] = map[outcome] || map.open;
  return `<span class="badge ${cls}">${label}</span>`;
}

function renderHistory() {
  const el = document.getElementById("history");
  if (!trades.length) {
    el.innerHTML =
      '<p class="empty-state">No trades logged yet. Add your first one above.</p>';
    return;
  }
  el.innerHTML = trades
    .map((t) => {
      const date = new Date(t.created_at);
      const dateStr =
        date.toLocaleDateString("en-KE", { month: "short", day: "numeric" }) +
        " " +
        date.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
      return `
        <div class="trade-card">
          <div class="trade-top">
            <div><span class="trade-pair">${t.pair}</span><span class="trade-dir">${t.direction}</span></div>
            ${outcomeBadge(t.outcome)}
          </div>
          <div class="trade-details">
            <div>Entry<span class="v">${t.entry || "-"}</span></div>
            <div>Stop<span class="v">${t.stop || "-"}</span></div>
            <div>Target<span class="v">${t.target || "-"}</span></div>
            <div>Risk<span class="v">${fmt(t.risk || 0)} KES</span></div>
          </div>
          ${t.notes ? `<p class="trade-notes">${t.notes}</p>` : ""}
          <p class="trade-meta">${dateStr} &middot; checklist ${t.checklist === "yes" ? "met" : "not fully met"}</p>
        </div>`;
    })
    .join("");
}

function render() {
  renderStats();
  renderHistory();
}

document.getElementById("trade-form").addEventListener("submit", async function (e) {
  e.preventDefault();
  const pair = document.getElementById("f-pair").value;
  const direction = document.getElementById("f-dir").value;
  const entry = document.getElementById("f-entry").value.trim();
  const stop = document.getElementById("f-stop").value.trim();
  const target = document.getElementById("f-target").value.trim();
  const risk = document.getElementById("f-risk").value.trim();
  const outcome = document.getElementById("f-outcome").value;
  const checklist = document.getElementById("f-checklist").value;
  const notes = document.getElementById("f-notes").value.trim();
  const errEl = document.getElementById("f-error");

  if (!entry || !risk) {
    errEl.textContent = "Enter at least an entry price and KES risked.";
    errEl.style.display = "block";
    return;
  }
  errEl.style.display = "none";

  const submitBtn = document.getElementById("f-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving...";

  const ok = await addTrade({
    pair,
    direction,
    entry,
    stop,
    target,
    risk,
    outcome,
    checklist,
    notes,
  });

  submitBtn.disabled = false;
  submitBtn.textContent = "Add trade";

  if (ok) {
    document.getElementById("trade-form").reset();
    await loadTrades();
  } else {
    errEl.textContent = "Could not save trade. Check your Supabase connection.";
    errEl.style.display = "block";
  }
});

loadTrades();