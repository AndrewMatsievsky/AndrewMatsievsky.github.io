const STORAGE_KEY = "coin-pocket-sources-v1";

const MONTHS_UK = [
  "січень",
  "лютий",
  "березень",
  "квітень",
  "травень",
  "червень",
  "липень",
  "серпень",
  "вересень",
  "жовтень",
  "листопад",
  "грудень",
];

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
  todayLine: document.getElementById("today-line"),
  monthLine: document.getElementById("month-line"),
  drops: document.getElementById("drops"),
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

function workingDaysInMonth(year, monthIndex) {
  const total = daysInMonth(year, monthIndex);
  let count = 0;
  for (let day = 1; day <= total; day += 1) {
    const weekday = new Date(year, monthIndex, day).getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return Math.max(1, count);
}

function effectivePayday(year, monthIndex, day) {
  return Math.min(clampDay(day), daysInMonth(year, monthIndex));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function money(n) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(n % 1) < 1e-9 ? 0 : 2,
  }).format(n);
}

function daysWord(n) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return "днів";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дні";
  return "днів";
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

function computeTodayEarned(sources, now = new Date()) {
  const workDays = workingDaysInMonth(now.getFullYear(), now.getMonth());
  return sources.reduce((sum, source) => sum + source.amount / workDays, 0);
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
  els.toggleForm.textContent = open ? "Закрити" : "Додати";
  if (!open) {
    els.form.reset();
    els.id.value = "";
    els.save.textContent = "Зберегти";
    return;
  }
  if (editing) {
    els.id.value = editing.id;
    els.name.value = editing.name;
    els.amount.value = String(editing.amount);
    els.day.value = String(editing.day);
    els.save.textContent = "Оновити";
    els.name.focus();
  } else {
    els.id.value = "";
    els.save.textContent = "Зберегти";
    els.name.focus();
  }
}

function spawnDrop() {
  if (!els.drops) return;
  const drop = document.createElement("span");
  drop.className = "coin-drop";
  drop.style.left = `${18 + Math.random() * 64}%`;
  drop.style.animationDuration = `${0.85 + Math.random() * 0.45}s`;
  els.drops.appendChild(drop);
  drop.addEventListener("animationend", () => drop.remove());
}

function render() {
  const sources = loadSources().sort((a, b) => a.day - b.day || a.name.localeCompare(b.name, "uk"));
  const now = new Date();
  const { total, paidIds } = computeJar(sources, now);
  const next = computeNext(sources, now);
  const todayEarned = computeTodayEarned(sources, now);
  const workDays = workingDaysInMonth(now.getFullYear(), now.getMonth());
  const monthTotal = sources.reduce((sum, s) => sum + s.amount, 0);
  const fillPct = monthTotal > 0 ? Math.min(100, Math.round((total / monthTotal) * 100)) : 0;

  if (els.monthLine) {
    const name = MONTHS_UK[now.getMonth()];
    els.monthLine.textContent = `${name.charAt(0).toUpperCase()}${name.slice(1)} ${now.getFullYear()}`;
  }

  els.jarAmount.textContent = money(total);
  els.jarFill.style.height = `${fillPct}%`;
  els.jarAmount.classList.remove("bump");
  void els.jarAmount.offsetWidth;
  els.jarAmount.classList.add("bump");

  if (els.todayLine) {
    els.todayLine.textContent =
      sources.length === 0
        ? "За сьогодні: $0"
        : `За сьогодні: ${money(todayEarned)} · ${workDays} роб. дн.`;
  }

  if (!next) {
    els.nextLine.textContent = "Додайте джерело доходу";
  } else if (next.daysUntil === 0) {
    els.nextLine.innerHTML = `Сьогодні: <strong>${escapeHtml(next.source.name)}</strong> · ${money(next.source.amount)}`;
  } else {
    els.nextLine.innerHTML = `Наступна через <strong>${next.daysUntil} ${daysWord(next.daysUntil)}</strong> · ${escapeHtml(next.source.name)} · ${money(next.source.amount)}`;
  }

  els.emptyState.hidden = sources.length > 0;
  els.sourceList.innerHTML = sources
    .map((source) => {
      const paid = paidIds.has(source.id);
      const daily = source.amount / workDays;
      return `
        <li class="source-item${paid ? " paid" : ""}" data-id="${source.id}">
          <div class="source-name">${escapeHtml(source.name)}</div>
          <div class="source-amount">${money(source.amount)}</div>
          <div class="source-meta">${source.day} число${paid ? " · у кишені" : " · очікується"} · ${money(daily)}/день</div>
          <div class="source-actions">
            <button type="button" class="btn-icon edit" data-action="edit" aria-label="Редагувати ${escapeHtml(source.name)}">Редагувати</button>
            <button type="button" class="btn-icon delete" data-action="delete" aria-label="Видалити ${escapeHtml(source.name)}">Видалити</button>
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
setInterval(spawnDrop, 1000);
spawnDrop();

const installHint = document.getElementById("install-hint");

function setHint(text, ok = false) {
  if (!installHint) return;
  installHint.hidden = !text;
  installHint.textContent = text;
  installHint.classList.toggle("ok", ok);
}

async function setupOffline() {
  if (!window.isSecureContext) return;
  if (!("serviceWorker" in navigator)) {
    setHint("Цей браузер не кешує застосунок офлайн.");
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register("./sw.js");
    await navigator.serviceWorker.ready;
    if (reg.active || navigator.serviceWorker.controller) {
      setHint("Готово офлайн — сервер можна вимкнути.", true);
    } else {
      setHint("Кешування… відкрийте ще раз після встановлення.", true);
    }
  } catch {
    setHint("Не вдалося увімкнути офлайн. Спробуйте через HTTPS.");
  }
}

setupOffline();
