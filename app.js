const STORAGE_KEY = "coin-pocket-sources-v1";

function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const els = {
  jarAmount: document.getElementById("jar-amount"),
  jarFill: document.getElementById("jar-fill"),
  nextLine: document.getElementById("next-line"),
  sourceList: document.getElementById("source-list"),
  emptyState: document.getElementById("empty-state"),
  form: document.getElementById("source-form"),
  toggleForm: document.getElementById("toggle-form"),
  cancelForm: document.getElementById("cancel-form"),
  name: document.getElementById("source-name"),
  amount: document.getElementById("source-amount"),
  day: document.getElementById("source-day"),
  id: document.getElementById("source-id"),
  save: document.getElementById("save-source"),
};

function loadSources() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s.name === "string" && Number.isFinite(s.amount) && Number.isFinite(s.day))
      .map((s) => ({
        id: String(s.id || uuid()),
        name: s.name.trim(),
        amount: Number(s.amount),
        day: clampDay(Number(s.day)),
      }));
  } catch {
    return [];
  }
}

function saveSources(sources) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
}

function clampDay(day) {
  return Math.min(31, Math.max(1, Math.round(day)));
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function effectivePayday(year, monthIndex, day) {
  return Math.min(clampDay(day), daysInMonth(year, monthIndex));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function money(n) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function computeJar(sources, now = new Date()) {
  const today = now.getDate();
  const year = now.getFullYear();
  const month = now.getMonth();
  let total = 0;
  const paidIds = new Set();

  for (const source of sources) {
    const payday = effectivePayday(year, month, source.day);
    if (payday <= today) {
      total += source.amount;
      paidIds.add(source.id);
    }
  }

  return { total, paidIds };
}

function computeNext(sources, now = new Date()) {
  if (!sources.length) return null;

  const todayStart = startOfDay(now);
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();

  const upcoming = sources
    .map((source) => {
      const paydayThis = effectivePayday(year, month, source.day);
      let payDate;
      if (paydayThis >= today) {
        payDate = new Date(year, month, paydayThis);
      } else {
        const nextMonth = month + 1;
        const nextYear = nextMonth > 11 ? year + 1 : year;
        const nextMonthIndex = nextMonth % 12;
        const paydayNext = effectivePayday(nextYear, nextMonthIndex, source.day);
        payDate = new Date(nextYear, nextMonthIndex, paydayNext);
      }
      const daysUntil = Math.round((startOfDay(payDate) - todayStart) / 86400000);
      return { source, payDate, daysUntil };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil || a.source.day - b.source.day);

  return upcoming[0];
}

function setFormOpen(open, editing = null) {
  els.form.hidden = !open;
  els.toggleForm.textContent = open ? "Close" : "Add";
  if (!open) {
    els.form.reset();
    els.id.value = "";
    els.save.textContent = "Save";
    return;
  }
  if (editing) {
    els.id.value = editing.id;
    els.name.value = editing.name;
    els.amount.value = String(editing.amount);
    els.day.value = String(editing.day);
    els.save.textContent = "Update";
    els.name.focus();
  } else {
    els.id.value = "";
    els.save.textContent = "Save";
    els.name.focus();
  }
}

function render() {
  const sources = loadSources().sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
  const now = new Date();
  const { total, paidIds } = computeJar(sources, now);
  const next = computeNext(sources, now);
  const monthTotal = sources.reduce((sum, s) => sum + s.amount, 0);
  const fillPct = monthTotal > 0 ? Math.min(100, Math.round((total / monthTotal) * 100)) : 0;

  els.jarAmount.textContent = money(total);
  els.jarFill.style.height = `${fillPct}%`;
  els.jarAmount.classList.remove("bump");
  void els.jarAmount.offsetWidth;
  els.jarAmount.classList.add("bump");

  if (!next) {
    els.nextLine.textContent = "Add a money source to begin";
  } else if (next.daysUntil === 0) {
    els.nextLine.innerHTML = `Today: <strong>${escapeHtml(next.source.name)}</strong> · ${money(next.source.amount)}`;
  } else if (next.daysUntil === 1) {
    els.nextLine.innerHTML = `Next in <strong>1 day</strong> · ${escapeHtml(next.source.name)} · ${money(next.source.amount)}`;
  } else {
    els.nextLine.innerHTML = `Next in <strong>${next.daysUntil} days</strong> · ${escapeHtml(next.source.name)} · ${money(next.source.amount)}`;
  }

  els.emptyState.hidden = sources.length > 0;
  els.sourceList.innerHTML = sources
    .map((source) => {
      const paid = paidIds.has(source.id);
      return `
        <li class="source-item${paid ? " paid" : ""}" data-id="${source.id}">
          <div class="source-name">${escapeHtml(source.name)}</div>
          <div class="source-amount">${money(source.amount)}</div>
          <div class="source-meta">Day ${ordinal(source.day)}${paid ? "" : " · upcoming"}</div>
          <div class="source-actions">
            <button type="button" class="btn-icon edit" data-action="edit" aria-label="Edit ${escapeHtml(source.name)}">Edit</button>
            <button type="button" class="btn-icon delete" data-action="delete" aria-label="Delete ${escapeHtml(source.name)}">Del</button>
          </div>
        </li>
      `;
    })
    .join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

els.toggleForm.addEventListener("click", () => {
  setFormOpen(els.form.hidden);
});

els.cancelForm.addEventListener("click", () => {
  setFormOpen(false);
});

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = els.name.value.trim();
  const amount = Number(els.amount.value);
  const day = clampDay(Number(els.day.value));
  if (!name || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(day)) return;

  const sources = loadSources();
  const editingId = els.id.value;
  if (editingId) {
    const idx = sources.findIndex((s) => s.id === editingId);
    if (idx >= 0) {
      sources[idx] = { ...sources[idx], name, amount, day };
    }
  } else {
    sources.push({
      id: uuid(),
      name,
      amount,
      day,
    });
  }
  saveSources(sources);
  setFormOpen(false);
  render();
});

els.sourceList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const item = button.closest(".source-item");
  if (!item) return;
  const id = item.dataset.id;
  const sources = loadSources();
  const source = sources.find((s) => s.id === id);
  if (!source) return;

  if (button.dataset.action === "edit") {
    setFormOpen(true, source);
    return;
  }

  if (button.dataset.action === "delete") {
    saveSources(sources.filter((s) => s.id !== id));
    if (els.id.value === id) setFormOpen(false);
    render();
  }
});

render();

const installHint = document.getElementById("install-hint");

function setHint(text, ok = false) {
  if (!installHint) return;
  installHint.hidden = !text;
  installHint.textContent = text;
  installHint.classList.toggle("ok", ok);
}

async function setupOffline() {
  if (!window.isSecureContext) {
    return;
  }
  if (!("serviceWorker" in navigator)) {
    setHint("This browser cannot cache the app for offline use.");
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    if (reg.active || navigator.serviceWorker.controller) {
      setHint("Ready offline — you can close the server.", true);
    } else {
      setHint("Caching… reopen the app once after install.", true);
    }
  } catch {
    setHint("Could not enable offline mode. Try reloading over HTTPS.");
  }
}

setupOffline();
