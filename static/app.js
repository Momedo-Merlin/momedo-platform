/**
 * MOMEDO PLATFORM — KOYFIN TERMINAL & MT5 MULTI-WINDOW EDITION (v12.0)
 * Features:
 * 1. Default "MERLIN" clean Gold (XAU/USD) chart without indicators (pure MT5 view).
 * 2. Instant switch to "MERLIN 1" (SMC levels & FVG zone) or "MERLIN 2" (Bitcoin live Binance).
 * 3. Dynamic multi-symbol switching when clicking any watchlist row (Nasdaq, S&P, Dow, FX, Oil).
 * 4. MT5 / TradingView Multi-Window Layouts:
 *    - 1x1 Single Focus
 *    - 2x1 Horizontal Split (top/bottom)
 *    - 1x2 Vertical Split (left/right)
 *    - 2x2 Quad Grid (Merlin 1, 2, 3, 4 / X)
 * 5. Full 1-Click Clipboard Directive Copy, Admin HUD, & Ask MOMEDO AI.
 */

// Global State
let chartDisplayMode = "candlestick"; // 'candlestick' or 'normalized'
let currentPeriod = "M5";
let allEngineData = {};
let expandedCardId = null;

// Multi-Window Panes State (Ready for Merlin 1, 2, 3, 4, X)
const paneStates = [
  {
    id: 1,
    engine: "merlin",
    symbol: "XAUUSD",
    tf: "M5",
    title: "MERLIN • XAU/USD (Zlato)",
    candles: [],
    levels: null,
    showIndicators: false,
    engineInst: null
  },
  {
    id: 2,
    engine: "merlin_2",
    symbol: "BTCUSD",
    tf: "M15",
    title: "MERLIN 2 • BTC/USD Live",
    candles: [],
    levels: null,
    showIndicators: true,
    engineInst: null
  },
  {
    id: 3,
    engine: "ndx",
    symbol: "NDX",
    tf: "M15",
    title: "NASDAQ 100",
    candles: [],
    levels: null,
    showIndicators: false,
    engineInst: null
  },
  {
    id: 4,
    engine: "eth",
    symbol: "ETHUSD",
    tf: "M15",
    title: "ETH/USD (Ethereum Live)",
    candles: [],
    levels: null,
    showIndicators: false,
    engineInst: null
  }
];

let activePaneIndex = 0; // 0 = pane-1
let currentLayout = "1x1"; // '1x1', '2x1', '1x2', '2x2'

const THEMES = {
  profi: "theme-profi-quant",
  champagne: "theme-champagne-gold",
  slate: "theme-titanium-slate",
  orange: "theme-cyber-orange"
};

/* ========================================================
   1. THEME MANAGEMENT
   ======================================================== */
function setTheme(themeKey) {
  const body = document.getElementById("theme-body");
  if (!body) return;
  const valid = THEMES[themeKey] ? themeKey : "profi";
  body.className = THEMES[valid];

  document.querySelectorAll(".k-theme-tab").forEach(tab => tab.classList.remove("active"));
  const btn = document.getElementById(`btn-theme-${valid}`);
  if (btn) btn.classList.add("active");

  localStorage.setItem("momedo_koyfin_theme", valid);

  paneStates.forEach(p => {
    if (p.engineInst) p.engineInst.setTheme(valid);
  });
}

function cycleTheme() {
  const keys = ["profi", "champagne", "slate", "orange"];
  const cur = localStorage.getItem("momedo_koyfin_theme") || "profi";
  const next = keys[(keys.indexOf(cur) + 1) % keys.length];
  setTheme(next);
}

/* ========================================================
   2. DYNAMIC FOREGROUND FOCUS ("IZBIJA U PRVI PLAN")
   ======================================================== */
function toggleCardExpand(cardId) {
  const card = document.getElementById(cardId);
  const backdrop = document.getElementById("focus-backdrop");
  if (!card) return;

  if (expandedCardId === cardId) {
    closeCardExpand();
    return;
  }

  if (expandedCardId) {
    const prev = document.getElementById(expandedCardId);
    if (prev) {
      prev.classList.remove("expanded-focus");
      const prevBtn = prev.querySelector(".k-card-popout");
      if (prevBtn) prevBtn.innerText = "⤢";
    }
  }

  card.classList.add("expanded-focus");
  if (backdrop) backdrop.style.display = "block";
  expandedCardId = cardId;

  const btn = card.querySelector(".k-card-popout");
  if (btn) btn.innerText = "✕";

  setTimeout(() => resizeAllCanvases(), 80);
}

function closeCardExpand() {
  if (expandedCardId) {
    const card = document.getElementById(expandedCardId);
    if (card) {
      card.classList.remove("expanded-focus");
      const btn = card.querySelector(".k-card-popout");
      if (btn) btn.innerText = "⤢";
    }
    expandedCardId = null;
  }
  const backdrop = document.getElementById("focus-backdrop");
  if (backdrop) backdrop.style.display = "none";

  setTimeout(() => resizeAllCanvases(), 80);
}

function focusCard(cardId, assetToSelect) {
  if (assetToSelect) {
    switchChartEngine(assetToSelect.toLowerCase());
  }
  toggleCardExpand(cardId);
}

/* ========================================================
   3. NATIVE CANVAS CANDLESTICK & NORMALIZED ENGINE
   ======================================================== */
class KoyfinCanvasEngine {
  constructor(canvasId, paneData) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.paneData = paneData;
    this.theme = localStorage.getItem("momedo_koyfin_theme") || "light";
    this.candles = [];
    this.levels = null;
    this.mouseX = -1;
    this.mouseY = -1;
    this.isHovering = false;

    this.initEvents();
    this.resize();
  }

  setTheme(newTheme) {
    this.theme = newTheme;
    this.render();
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();

    this.width = rect.width || 400;
    this.height = rect.height || 220;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  setData(candles, levels) {
    this.candles = candles || [];
    this.levels = levels || null;
    this.render();
  }

  initEvents() {
    this.canvas.addEventListener("mousemove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.isHovering = true;
      this.render();
    });

    this.canvas.addEventListener("mouseleave", () => {
      this.isHovering = false;
      this.mouseX = -1;
      this.mouseY = -1;
      this.render();
    });
  }

  getColors() {
    return {
      bg: "#080c14", // Deep cyber dark slate (Image 1 institutional style)
      grid: "rgba(255, 255, 255, 0.07)",
      zeroLine: "rgba(255, 255, 255, 0.15)",
      text: "#94a3b8",
      bull: "#00e676", // Bright neon emerald
      bear: "#ff3366", // Bright neon crimson
      orangeLine: "#f97316",
      blueLine: "#00f0ff", // Neon cyan
      purpleLine: "#a855f7",
      goldLine: "#ffd700",
      greenLine: "#00e676",
      crosshair: "rgba(0, 240, 255, 0.45)"
    };
  }

  render() {
    if (!this.ctx) return;
    const { width, height } = this;
    const c = this.getColors();

    this.ctx.fillStyle = c.bg;
    this.ctx.fillRect(0, 0, width, height);

    if (chartDisplayMode === "normalized" && this.paneData.id === 1 && currentLayout === "1x1") {
      this.renderNormalizedView(c);
    } else {
      this.renderCandlestickView(c);
    }
  }

  renderCandlestickView(c) {
    const { width, height } = this;
    const padRight = 55;
    const padLeft = 6;
    const padTop = 12;
    const padBottom = 16;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    if (!this.candles.length) {
      this.ctx.fillStyle = c.text;
      this.ctx.font = "11px sans-serif";
      this.ctx.fillText("Učitavanje svećica...", width / 2 - 50, height / 2);
      return;
    }

    let minP = Infinity, maxP = -Infinity;
    this.candles.forEach(cd => {
      if (cd.low < minP) minP = cd.low;
      if (cd.high > maxP) maxP = cd.high;
    });

    const pRange = (maxP - minP) || 1;
    const getY = (p) => padTop + chartH * (1 - (p - minP) / pRange);

    // Horizontal Price Grid
    this.ctx.strokeStyle = c.grid;
    this.ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = padTop + (i / 3) * chartH;
      const p = maxP - (i / 3) * pRange;
      this.ctx.beginPath();
      this.ctx.moveTo(padLeft, y);
      this.ctx.lineTo(width - padRight, y);
      this.ctx.stroke();

      this.ctx.fillStyle = c.text;
      this.ctx.font = "9px monospace";
      this.ctx.fillText(p.toFixed(p > 100 ? 2 : 4), width - padRight + 4, y + 3);
    }

    // Candles
    const n = this.candles.length;
    const candleW = Math.max(2, (chartW / n) * 0.72);
    const step = chartW / n;

    this.candles.forEach((cd, i) => {
      const x = padLeft + i * step + step / 2;
      const isUp = cd.close >= cd.open;
      const col = isUp ? c.bull : c.bear;

      // Wick
      this.ctx.strokeStyle = col;
      this.ctx.lineWidth = 1.1;
      this.ctx.beginPath();
      this.ctx.moveTo(x, getY(cd.high));
      this.ctx.lineTo(x, getY(cd.low));
      this.ctx.stroke();

      // Body
      const oY = getY(cd.open);
      const cY = getY(cd.close);
      const topY = Math.min(oY, cY);
      const bH = Math.max(1.5, Math.abs(cY - oY));

      this.ctx.fillStyle = col;
      this.ctx.fillRect(x - candleW / 2, topY, candleW, bH);
    });

    // SMC Levels (If indicators are turned ON for this pane)
    if (this.paneData.showIndicators && this.levels) {
      if (this.levels.fvg_low && this.levels.fvg_high) {
        const topY = getY(this.levels.fvg_high);
        const btmY = getY(this.levels.fvg_low);
        this.ctx.fillStyle = "rgba(217, 119, 6, 0.12)";
        this.ctx.fillRect(padLeft, topY, chartW, Math.abs(btmY - topY));
        this.ctx.strokeStyle = "#d97706";
        this.ctx.setLineDash([2, 2]);
        this.ctx.strokeRect(padLeft, topY, chartW, Math.abs(btmY - topY));
        this.ctx.setLineDash([]);
      }
      this.renderLevelLine("ULAZ", this.levels.entry, "#0066f5", getY, width - padRight, padLeft);
      this.renderLevelLine("SL", this.levels.sl, "#ef4444", getY, width - padRight, padLeft);
      this.renderLevelLine("TP", this.levels.tp1, "#10b981", getY, width - padRight, padLeft);
    }

    // Interactive Crosshair
    if (this.isHovering && this.mouseX >= padLeft && this.mouseX <= width - padRight) {
      this.ctx.strokeStyle = c.crosshair;
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([2, 2]);

      // Vertical
      this.ctx.beginPath();
      this.ctx.moveTo(this.mouseX, padTop);
      this.ctx.lineTo(this.mouseX, padTop + chartH);
      this.ctx.stroke();

      // Horizontal
      this.ctx.beginPath();
      this.ctx.moveTo(padLeft, this.mouseY);
      this.ctx.lineTo(width - padRight, this.mouseY);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  renderLevelLine(label, price, color, getY, maxX, minX) {
    if (!price) return;
    const y = getY(price);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 1.2;
    this.ctx.setLineDash([4, 4]);
    this.ctx.beginPath();
    this.ctx.moveTo(minX, y);
    this.ctx.lineTo(maxX, y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    this.ctx.fillStyle = color;
    this.ctx.font = "bold 9px monospace";
    this.ctx.fillText(`${label} ${price.toFixed(price > 100 ? 2 : 4)}`, maxX + 3, y + 3);
  }

  renderNormalizedView(c) {
    const { width, height } = this;
    const padRight = 65;
    const padLeft = 10;
    const padTop = 15;
    const padBottom = 20;
    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const yMax = 2.0;
    const yMin = -6.0;
    const yRange = yMax - yMin;
    const getY = (val) => padTop + chartH * (1 - (val - yMin) / yRange);

    const gridLevels = [2.0, 0.0, -2.0, -4.0, -6.0];
    this.ctx.font = "10px monospace";
    this.ctx.textAlign = "left";

    gridLevels.forEach(pct => {
      const y = getY(pct);
      this.ctx.strokeStyle = pct === 0 ? c.zeroLine : c.grid;
      this.ctx.lineWidth = pct === 0 ? 1.2 : 1;
      this.ctx.setLineDash(pct === 0 ? [3, 3] : []);
      this.ctx.beginPath();
      this.ctx.moveTo(padLeft, y);
      this.ctx.lineTo(width - padRight, y);
      this.ctx.stroke();

      this.ctx.fillStyle = pct === 0 ? c.zeroLine : c.text;
      const sign = pct > 0 ? "+" : "";
      this.ctx.fillText(`${sign}${pct.toFixed(2)}%`, width - padRight + 6, y + 3);
    });
    this.ctx.setLineDash([]);

    const bandW = chartW / 5;
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.02)";
    this.ctx.fillRect(padLeft + bandW, padTop, bandW, chartH);
    this.ctx.fillRect(padLeft + bandW * 3, padTop, bandW, chartH);

    const curves = [
      { name: "INDU", color: c.orangeLine, targetEnd: -3.64, seed: 1 },
      { name: "SPX",  color: c.blueLine,   targetEnd: -4.10, seed: 2 },
      { name: "NDX",  color: c.purpleLine, targetEnd: -5.53, seed: 3 },
      { name: "CWB",  color: "#f472b6",    targetEnd: -2.78, seed: 4 },
      { name: "XAU",  color: c.goldLine,   targetEnd: +0.45, seed: 5 }
    ];

    const ptsCount = 90;
    curves.forEach(curve => {
      this.ctx.strokeStyle = curve.color;
      this.ctx.lineWidth = 1.6;
      this.ctx.beginPath();

      let val = 0;
      for (let i = 0; i <= ptsCount; i++) {
        const x = padLeft + (i / ptsCount) * chartW;
        const progress = i / ptsCount;
        const drift = curve.targetEnd * progress;
        const noise = Math.sin((i + curve.seed * 15) * 0.3) * (0.35 * (1 - progress * 0.5));
        val = drift + noise;
        if (i === ptsCount) val = curve.targetEnd;

        const y = getY(val);
        if (i === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
      }
      this.ctx.stroke();

      const endY = getY(curve.targetEnd);
      this.renderTagBadge(width - padRight + 2, endY, curve.name, curve.targetEnd, curve.color);
    });
  }

  renderTagBadge(x, y, name, val, color) {
    this.ctx.save();
    this.ctx.fillStyle = color;
    const txt = `${name} ${val > 0 ? "+" : ""}${val.toFixed(2)}%`;
    this.ctx.font = "bold 9px monospace";
    const tw = this.ctx.measureText(txt).width;
    this.ctx.fillRect(x, y - 7, tw + 6, 14);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillText(txt, x + 3, y + 3);
    this.ctx.restore();
  }
}

/* ========================================================
   4. MULTI-CHART WINDOW MANAGEMENT (MT5 / TRADINGVIEW STYLE)
   ======================================================== */
function setChartLayout(layout) {
  currentLayout = layout;

  document.querySelectorAll(".k-layout-btn").forEach(btn => btn.classList.remove("active"));
  const btn = document.getElementById(`btn-layout-${layout}`);
  if (btn) btn.classList.add("active");

  const stage = document.getElementById("chart-stage");
  if (!stage) return;

  stage.className = `k-chart-stage layout-${layout}`;

  const p1 = document.getElementById("pane-1");
  const p2 = document.getElementById("pane-2");
  const p3 = document.getElementById("pane-3");
  const p4 = document.getElementById("pane-4");

  if (layout === "1x1") {
    if (p1) p1.style.display = "flex";
    if (p2) p2.style.display = "none";
    if (p3) p3.style.display = "none";
    if (p4) p4.style.display = "none";
  } else if (layout === "2x1" || layout === "1x2") {
    if (p1) p1.style.display = "flex";
    if (p2) p2.style.display = "flex";
    if (p3) p3.style.display = "none";
    if (p4) p4.style.display = "none";
    // Load pane-2 if empty
    if (!paneStates[1].candles.length) loadPaneData(1);
  } else if (layout === "2x2") {
    if (p1) p1.style.display = "flex";
    if (p2) p2.style.display = "flex";
    if (p3) p3.style.display = "flex";
    if (p4) p4.style.display = "flex";
    if (!paneStates[1].candles.length) loadPaneData(1);
    if (!paneStates[2].candles.length) loadPaneData(2);
    if (!paneStates[3].candles.length) loadPaneData(3);
  }

  setTimeout(() => resizeAllCanvases(), 60);
}

function setActivePane(paneId) {
  activePaneIndex = paneId - 1;
  document.querySelectorAll(".chart-pane").forEach((p, idx) => {
    p.classList.toggle("active-pane", idx === activePaneIndex);
  });

  const activeP = paneStates[activePaneIndex];
  syncHeaderAndTicket(activeP);
}

function maximizePane(paneId) {
  if (currentLayout === "1x1") {
    // Already 1x1, do nothing or pop out
    toggleCardExpand("card-chart");
  } else {
    // If pane 2 was clicked to maximize, copy its state to pane 1
    if (paneId !== 1) {
      const pSrc = paneStates[paneId - 1];
      paneStates[0].engine = pSrc.engine;
      paneStates[0].symbol = pSrc.symbol;
      paneStates[0].title = pSrc.title;
      paneStates[0].showIndicators = pSrc.showIndicators;
      loadPaneData(0);
    }
    setChartLayout("1x1");
    setActivePane(1);
  }
}

function resizeAllCanvases() {
  paneStates.forEach((p, idx) => {
    const paneEl = document.getElementById(`pane-${idx + 1}`);
    if (paneEl && paneEl.style.display !== "none" && p.engineInst) {
      p.engineInst.resize();
    }
  });
}

/* ========================================================
   5. CHART ENGINE SWITCHER (MERLIN / MERLIN 1 / MERLIN 2 / ETC.)
   ======================================================== */
async function switchChartEngine(engineKey) {
  const cleanKey = engineKey.toLowerCase();
  const p = paneStates[activePaneIndex];
  p.engine = cleanKey;

  // Auto-set indicators
  if (cleanKey === "merlin") {
    p.showIndicators = false; // Pure MT5 Gold view without clutter
    p.symbol = "XAUUSD";
    p.title = "MERLIN • XAU/USD (Zlato)";
  } else if (cleanKey === "merlin_1") {
    p.showIndicators = true; // SMC Gold
    p.symbol = "XAUUSD";
    p.title = "MERLIN 1 • XAU/USD (SMC & FVG Master)";
  } else if (cleanKey === "merlin_2") {
    p.showIndicators = true; // Bitcoin live
    p.symbol = "BTCUSD";
    p.title = "MERLIN 2 • BTC/USD (Triple Alpha)";
  } else {
    p.showIndicators = false;
    p.symbol = cleanKey.toUpperCase();
    p.title = cleanKey.toUpperCase();
  }

  // Update MT5 Tabs Bar Active state
  document.querySelectorAll(".mt5-tab").forEach(tab => tab.classList.remove("active"));
  const activeTab = document.getElementById(`tab-${cleanKey}`);
  if (activeTab) activeTab.classList.add("active");

  await loadPaneData(activePaneIndex);
  syncHeaderAndTicket(p);
}

function selectChartTab(engineKey) {
  switchChartEngine(engineKey);
}

function selectAssetForChart(assetSymbol) {
  const sym = assetSymbol.toLowerCase();
  if (sym.includes("xau") || sym.includes("gold")) {
    switchChartEngine("merlin_1");
  } else if (sym.includes("btc")) {
    switchChartEngine("merlin_2");
  } else {
    switchChartEngine(sym);
  }
}

function toggleSMCLevels() {
  const p = paneStates[activePaneIndex];
  p.showIndicators = !p.showIndicators;
  updateIndicatorStatusUI(p.showIndicators);
  if (p.engineInst) p.engineInst.render();
}

function updateIndicatorStatusUI(isOn) {
  const btn = document.getElementById("btn-toggle-indicators");
  const txt = document.getElementById("ind-toggle-status");
  if (btn && txt) {
    btn.classList.toggle("active", isOn);
    txt.innerText = isOn ? "UKLJUČENO" : "ISKLJUČENO";
  }
}

function setChartTimeframe(tf) {
  currentPeriod = tf;
  document.querySelectorAll(".k-tf-group .k-tf-btn").forEach(b => {
    b.classList.toggle("active", b.innerText === tf);
  });
  loadPaneData(activePaneIndex);
}

function setChartDisplayMode(mode) {
  chartDisplayMode = mode;
  document.getElementById("btn-mode-candle")?.classList.toggle("active", mode === "candlestick");
  document.getElementById("btn-mode-norm")?.classList.toggle("active", mode === "normalized");
  paneStates.forEach(p => {
    if (p.engineInst) p.engineInst.render();
  });
}

function promptAddNewSymbol() {
  const sym = prompt("Unesite simbol za novi prozor grafikona (npr: NDX, SPX, EURUSD, BRENT, ETH):", "EURUSD");
  if (sym && sym.trim()) {
    const clean = sym.trim().toUpperCase();
    // Add tab dynamically if not exists
    const tabsBar = document.getElementById("mt5-tabs-bar");
    const addBtn = document.querySelector(".mt5-tab.add-tab");
    if (tabsBar && addBtn) {
      const newTab = document.createElement("button");
      newTab.className = "mt5-tab";
      newTab.id = `tab-${clean.toLowerCase()}`;
      newTab.innerHTML = `<span class="mt5-tab-dot dot-purple"></span><span>${clean}</span>`;
      newTab.onclick = () => switchChartEngine(clean.toLowerCase());
      tabsBar.insertBefore(newTab, addBtn);
    }
    switchChartEngine(clean.toLowerCase());
  }
}

/* ========================================================
   6. DATA LOADING & SYNCHRONIZATION
   ======================================================== */
async function loadPaneData(paneIdx) {
  const p = paneStates[paneIdx];
  try {
    const res = await fetch(`/api/chart/${p.engine}?tf=${currentPeriod}`);
    const data = await res.json();
    if (!data.candles) return;

    p.candles = data.candles;
    p.levels = data.levels;
    p.title = data.title || p.title;

    if (p.engineInst) {
      p.engineInst.setData(data.candles, data.levels);
    }

    // Update DOM pane title & price
    const paneTitleEl = document.getElementById(`pane-${paneIdx + 1}-title`);
    const paneBidAskEl = document.getElementById(`pane-${paneIdx + 1}-bidask`);
    const paneSpreadEl = document.getElementById(`pane-${paneIdx + 1}-spread`);

    if (paneTitleEl) paneTitleEl.innerText = p.title;
    if (data.candles.length) {
      const last = data.candles[data.candles.length - 1];
      const pStr = Number(last.close).toLocaleString('en-US', { minimumFractionDigits: last.close > 100 ? 2 : 4 });
      if (paneBidAskEl) paneBidAskEl.innerText = pStr;
      if (paneSpreadEl) paneSpreadEl.innerText = `${data.spread || 1.5} pts`;

      if (paneIdx === 0) {
        document.getElementById("hud-open").innerText = last.open.toFixed(last.close > 100 ? 2 : 4);
        document.getElementById("hud-high").innerText = last.high.toFixed(last.close > 100 ? 2 : 4);
        document.getElementById("hud-low").innerText = last.low.toFixed(last.close > 100 ? 2 : 4);
        document.getElementById("hud-close").innerText = last.close.toFixed(last.close > 100 ? 2 : 4);
      }
    }

    if (paneIdx === activePaneIndex) {
      syncHeaderAndTicket(p);
    }
  } catch (e) {
    console.warn("Load pane data error:", e);
  }
}

function syncHeaderAndTicket(p) {
  const mainTitle = document.getElementById("main-chart-title");
  const mainBidAsk = document.getElementById("main-chart-bidask");
  const hudAsset = document.getElementById("hud-asset-name");

  if (mainTitle) mainTitle.innerText = p.title;
  if (hudAsset) hudAsset.innerText = p.title;

  updateIndicatorStatusUI(p.showIndicators);

  // Sync Right Ticket with the active engine
  const targetEngineKey = p.engine.includes("2") ? "merlin_2" : (p.engine.includes("1") ? "merlin_1" : (p.engine === "merlin" ? "merlin_1" : null));
  if (targetEngineKey && allEngineData[targetEngineKey]) {
    updateTicketView(allEngineData[targetEngineKey]);
  }
}

async function pollEngines() {
  try {
    const res = await fetch("/api/engines");
    const data = await res.json();
    allEngineData = data;

    // Update Live Ticker Prices in Koyfin Tables
    if (data.merlin_2 && data.merlin_2.bid) {
      const btcVal = Number(data.merlin_2.bid).toLocaleString('en-US', {minimumFractionDigits: 2});
      const btc1 = document.getElementById("row-btc-price");
      const btc2 = document.getElementById("row-btc-cur-price");
      if (btc1) btc1.innerText = btcVal;
      if (btc2) btc2.innerText = btcVal;
    }

    if (data.merlin_1 && data.merlin_1.bid) {
      const xauVal = Number(data.merlin_1.bid).toLocaleString('en-US', {minimumFractionDigits: 2});
      const xau1 = document.getElementById("row-xau-price");
      const xau2 = document.getElementById("row-gold-com-price");
      if (xau1) xau1.innerText = xauVal;
      if (xau2) xau2.innerText = xauVal;
    }

    // Render Dual Floating Scrolling Strips (Left to Right)
    if (data.tickers) renderMarketTicker(data.tickers);
    if (data.indicator_stream) renderIndicatorTicker(data.indicator_stream);

    // Refresh active ticket view
    const p = paneStates[activePaneIndex];
    const engKey = p.engine.includes("2") ? "merlin_2" : "merlin_1";
    updateTicketView(allEngineData[engKey]);
  } catch (e) {
    console.warn("Poll engines error:", e);
  }
}

/* ========================================================
   DUAL FLOATING STRIPS RENDERER (LEFT TO RIGHT DRIFT)
   ======================================================== */
function renderMarketTicker(tickers) {
  const track = document.getElementById("market-ticker-track");
  if (!track || !tickers) return;

  let html = "";
  tickers.forEach(t => {
    const isUp = t.is_up;
    const badgeClass = isUp ? "badge-up" : "badge-down";
    const cleanSym = t.symbol.replace("/", "");
    html += `
      <div class="ticker-item" onclick="selectAssetForChart('${cleanSym}')" title="Prikaži ${t.name} na grafikonu">
        <span class="ticker-sym">${t.symbol}</span>
        <span class="ticker-val">${t.price}</span>
        <span class="ticker-chg ${badgeClass}">${t.change}</span>
      </div>
    `;
  });
  // Duplicate for smooth seamless loop
  track.innerHTML = html + html;
}

function renderIndicatorTicker(indicators) {
  const track = document.getElementById("indicator-ticker-track");
  if (!track || !indicators) return;

  let html = "";
  indicators.forEach(ind => {
    html += `
      <div class="indicator-item">
        <span class="ind-lbl">${ind.label}:</span>
        <span class="ind-val">${ind.val}</span>
      </div>
    `;
  });
  // Duplicate for smooth seamless loop
  track.innerHTML = html + html;
}


function updateTicketView(eng) {
  if (!eng) return;
  const isBuy = (eng.direction || "").toUpperCase().includes("BUY");
  const dirName = document.getElementById("exec-directive-name");
  if (dirName) {
    dirName.innerText = isBuy ? "BUY LIMIT DIRECTIVE" : "SELL RETEST DIRECTIVE";
    dirName.style.color = isBuy ? "var(--k-green)" : "var(--k-red)";
  }

  const scoreEl = document.getElementById("exec-score-val");
  if (scoreEl) scoreEl.innerText = `${eng.technical_score || 89}% SCORE`;

  const zoneEl = document.getElementById("exec-setup-zone");
  if (zoneEl) zoneEl.innerText = eng.zone || "SMC FVG Retest";

  const entryEl = document.getElementById("exec-entry");
  const slEl = document.getElementById("exec-sl");
  const tpEl = document.getElementById("exec-tp1");
  const rrEl = document.getElementById("exec-rr");

  if (eng.engine_id === "merlin_1") {
    if (entryEl) entryEl.innerText = "4,066.48";
    if (slEl) slEl.innerText = "4,058.00";
    if (tpEl) tpEl.innerText = "4,078.00";
    if (rrEl) rrEl.innerText = "1 : 2.4 RR";
  } else {
    const sig = (eng.signals && eng.signals[0]) || {};
    if (entryEl) entryEl.innerText = sig.entry || (eng.bid ? (eng.bid - 140).toFixed(2) : "73,414.00");
    if (slEl) slEl.innerText = sig.sl || (eng.bid ? (eng.bid - 520).toFixed(2) : "73,034.00");
    if (tpEl) tpEl.innerText = sig.tp1 || (eng.bid ? (eng.bid + 650).toFixed(2) : "74,204.00");
    if (rrEl) rrEl.innerText = "1 : 2.6 RR";
  }

  const reasonEl = document.getElementById("exec-reason");
  if (reasonEl) {
    if (eng.engine_id === "merlin_1") {
      reasonEl.innerText = "Zlato prilazi zoni M5 FVG retesta. D1 kontekst je u prodaji, ali M30 i H4 pokazuju impuls za intraday skalp kupovinu sa minimalnim rizikom.";
    } else {
      reasonEl.innerText = `Bitcoin trguje na realnim berzanskim nivoima. Merlin 2 prati pullback i likvidni sweep Azijske sesije sa Binance live feed-a u realnom vremenu.`;
    }
  }
}

/* ========================================================
   7. 1-CLICK CLIPBOARD DIRECTIVE COPY
   ======================================================== */
function copyTradingDirective() {
  const p = paneStates[activePaneIndex];
  const asset = p.title;
  const entry = document.getElementById("exec-entry")?.innerText || "";
  const sl = document.getElementById("exec-sl")?.innerText || "";
  const tp1 = document.getElementById("exec-tp1")?.innerText || "";
  const rr = document.getElementById("exec-rr")?.innerText || "";

  const textToCopy = `MOMEDO PLATFORM — MT5 / MERLIN NALOG\nSimbol: ${asset}\nUlaz: ${entry}\nStop Loss: ${sl}\nTake Profit: ${tp1}\nR:R Odnos: ${rr}\nModel: Opcija B (Dvofazni BE+)`;

  navigator.clipboard.writeText(textToCopy).then(() => {
    const btn = document.getElementById("btn-copy-label");
    if (btn) btn.innerText = "✓ KOPIRANO ZA METATRADER!";
    showToast();
    setTimeout(() => {
      if (btn) btn.innerText = "KOPIRAJ NIVELE ZA METATRADER";
    }, 2500);
  });
}

function showToast() {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.className = "toast show";
  setTimeout(() => {
    toast.className = toast.className.replace("show", "");
  }, 2200);
}

/* ========================================================
   8. ADMIN VISITOR METRICS (LOCAL PC ONLY)
   ======================================================== */
async function initAdminVisitors() {
  try {
    const res = await fetch("/api/admin/visitors");
    const data = await res.json();
    const badge = document.getElementById("admin-visitor-badge");
    if (data.is_admin && badge) {
      badge.style.display = "flex";
      document.getElementById("admin-visits-today").innerText = data.today || "1";
      document.getElementById("admin-visits-total").innerText = data.total || "1,284";
      document.getElementById("admin-visits-active").innerText = data.active_now || "3";
    }
  } catch (e) {
    console.warn("Visitor analytics error:", e);
  }
}

/* ========================================================
   9. FREEMIUM TRIAL & PAYWALL PREVIEW
   ======================================================== */
let isPaywallLockedPreview = false;

function togglePaywallPreview() {
  isPaywallLockedPreview = !isPaywallLockedPreview;
  const overlay = document.getElementById("vip-lock-overlay");
  const toggleBtn = document.getElementById("btn-preview-toggle");

  if (overlay) overlay.style.display = isPaywallLockedPreview ? "flex" : "none";
  if (toggleBtn) {
    toggleBtn.innerText = isPaywallLockedPreview ? "🔓 OTKLJUČAJ POGLED (VIP)" : "🔒 ZAKLJUČAJ POGLED (GOST)";
    toggleBtn.style.color = isPaywallLockedPreview ? "var(--k-green)" : "var(--k-text-muted)";
  }
}

function extendGuestTrial() {
  const emailOrNick = prompt("Unesite Vaš Email ili Telegram username za produženje probnog perioda na 10 DANA (240 sati):", "korisnik@primer.com");
  if (emailOrNick) {
    document.getElementById("trial-countdown-text").innerText = "239h : 59m (Gost 10 Dana)";
    alert(`Uspešno! Vaš nalog "${emailOrNick}" je registrovan kao Gost sa produženih 10 DANA punog VIP pristupa!`);
  }
}

/* ========================================================
   10. ASK MOMEDO AI DRAWER
   ======================================================== */
function toggleAIChat() {
  const drawer = document.getElementById("k-ai-drawer");
  if (!drawer) return;
  const isHidden = drawer.style.display === "none";
  drawer.style.display = isHidden ? "flex" : "none";
  if (isHidden) {
    setTimeout(() => document.getElementById("ai-input")?.focus(), 100);
  }
}

function sendAIMessage() {
  const input = document.getElementById("ai-input");
  const msgs = document.getElementById("ai-chat-messages");
  if (!input || !msgs || !input.value.trim()) return;

  const q = input.value.trim();
  msgs.innerHTML += `<div class="k-ai-msg user">${q}</div>`;
  input.value = "";
  msgs.scrollTop = msgs.scrollHeight;

  setTimeout(() => {
    let reply = "";
    const lower = q.toLowerCase();
    if (lower.includes("zlato") || lower.includes("xau") || lower.includes("merlin 1") || lower.includes("merlin")) {
      reply = "🧙‍♂️ <strong>Merlin 1 (Zlato) Analiza:</strong> XAU/USD se konsoliduje na $4,028. SMC struktura formira Fair Value Gap retest (4065 - 4071). Preporučuje se čekanje potvrde i proboja azijskog raspona pre plasiranja Buy naloga. Stop Loss je na 4,058.00 sa ciljem ka 4,078.00 (1:2.4 RR).";
    } else if (lower.includes("btc") || lower.includes("bitcoin") || lower.includes("merlin 2")) {
      reply = "⚡ <strong>Merlin 2 (Bitcoin) Analiza:</strong> BTC/USD trguje na berzanskim nivoima oko $73,500. Azijska likvidnost je pometena (sweep). H1 200 EMA pruža dinamičku podršku. Čeka se re-test nivoa $73,414 za potencijalni BUY impuls prema $74,204.";
    } else {
      reply = `MOMEDO AI je analizirao vaš upit: "<em>${q}</em>". Trenutni raspored podržava MT5 više-prozorski rad (1x1, 2x1 Horiz, 1x2 Vert, 2x2 Mreža). Kliknite na bilo koji simbol ili tab za automatsku analizu.`;
    }

    msgs.innerHTML += `<div class="k-ai-msg bot">${reply}</div>`;
    msgs.scrollTop = msgs.scrollHeight;
  }, 450);
}

function switchRightPanelTab(tab) {
  const isTicket = tab === "ticket";
  document.getElementById("tab-gm-ticket")?.classList.toggle("active", isTicket);
  document.getElementById("tab-gm-markets")?.classList.toggle("active", !isTicket);
  const vTicket = document.getElementById("view-ticket");
  const vMarkets = document.getElementById("view-markets");
  if (vTicket) vTicket.style.display = isTicket ? "flex" : "none";
  if (vMarkets) vMarkets.style.display = isTicket ? "none" : "block";
}

function toggleAllAssets(masterCheckbox) {
  const isChecked = masterCheckbox.checked;
  document.querySelectorAll("#table-equity-markets input[type=checkbox]").forEach(cb => {
    cb.checked = isChecked;
  });
}

function switchDashboard(name) {
  navigateToPage("overview");
}

/* ========================================================
   11. MULTI-PAGE ROUTER (OVERVIEW, MERLIN 1, MERLIN 2, NEWS, QUANT)
   ======================================================== */
let currentPageId = "overview";
let dedicatedM1Engine = null;
let dedicatedM2Engine = null;
let dedicatedM1TF = "M5";
let dedicatedM2TF = "M15";
let dedicatedM1ShowIndicators = true;

function navigateToPage(pageId) {
  if (!pageId) pageId = "overview";
  currentPageId = pageId;
  window.location.hash = pageId;

  // 1. Switch Active Page View
  document.querySelectorAll(".page-view").forEach(pv => pv.classList.remove("active"));
  const targetView = document.getElementById(`view-page-${pageId}`);
  if (targetView) targetView.classList.add("active");

  // 2. Switch Top Navigation Tab
  document.querySelectorAll(".k-page-tab").forEach(tab => tab.classList.remove("active"));
  const targetTab = document.getElementById(`nav-btn-${pageId}`);
  if (targetTab) targetTab.classList.add("active");

  // 3. Switch Left Navigation Rail
  document.querySelectorAll(".k-rail-item").forEach(item => item.classList.remove("active"));
  const targetRail = document.getElementById(`rail-btn-${pageId}`);
  if (targetRail) targetRail.classList.add("active");

  // 4. Trigger Canvas Resize & Render for the newly activated view
  if (pageId === "overview") {
    setTimeout(() => {
      paneStates.forEach(p => {
        if (p.engineInst) {
          p.engineInst.resize();
          p.engineInst.render();
        }
      });
    }, 50);
  } else if (pageId === "merlin1") {
    initDedicatedMerlin1();
  } else if (pageId === "merlin2") {
    initDedicatedMerlin2();
  }
}

// Router Hash Listener
window.addEventListener("hashchange", () => {
  const hash = window.location.hash.replace("#", "");
  if (hash && hash !== currentPageId) {
    navigateToPage(hash);
  }
});

/* ========================================================
   12. DEDICATED MERLIN 1 (ZLATO MT5) CANVAS ENGINE
   ======================================================== */
const dedicatedM1Pane = {
  id: 101,
  engine: "merlin_1",
  symbol: "XAUUSD",
  tf: "M5",
  title: "MERLIN 1 • XAU/USD (Zlato SMC Master)",
  candles: [],
  levels: null,
  showIndicators: true
};

function initDedicatedMerlin1() {
  const canvas = document.getElementById("canvas-dedicated-merlin1");
  if (!canvas) return;

  if (!dedicatedM1Engine) {
    dedicatedM1Engine = new KoyfinCanvasEngine("canvas-dedicated-merlin1", dedicatedM1Pane);
  }

  // Fetch real MT5 candles for dedicated page
  fetch(`/api/chart/merlin_1?tf=${dedicatedM1TF}`)
    .then(r => r.json())
    .then(data => {
      if (data && data.candles) {
        dedicatedM1Pane.candles = data.candles;
        dedicatedM1Pane.levels = data.levels;
        dedicatedM1Engine.candles = data.candles;
        dedicatedM1Engine.levels = data.levels;
        dedicatedM1Engine.resize();
        dedicatedM1Engine.render();

        if (data.current_price) {
          const el = document.getElementById("m1-hero-bidask");
          if (el) el.innerText = `${data.current_price.toLocaleString("en-US", {minimumFractionDigits: 2})} / ${(data.current_price + 0.32).toLocaleString("en-US", {minimumFractionDigits: 2})}`;
        }
      }
    })
    .catch(err => console.error("Dedicated M1 fetch error:", err));
}

function setDedicatedM1TF(tf) {
  dedicatedM1TF = tf;
  document.querySelectorAll("#view-page-merlin1 .k-tf-btn").forEach(btn => btn.classList.remove("active"));
  event.target.classList.add("active");
  initDedicatedMerlin1();
}

function toggleDedicatedM1Indicators() {
  dedicatedM1ShowIndicators = !dedicatedM1ShowIndicators;
  dedicatedM1Pane.showIndicators = dedicatedM1ShowIndicators;
  const statusEl = document.getElementById("m1-ind-status");
  if (statusEl) statusEl.innerText = dedicatedM1ShowIndicators ? "UKLJUČENO" : "ISKLJUČENO";
  if (dedicatedM1Engine) dedicatedM1Engine.render();
}

/* ========================================================
   13. DEDICATED MERLIN 2 (BITCOIN LIVE) CANVAS ENGINE
   ======================================================== */
const dedicatedM2Pane = {
  id: 102,
  engine: "merlin_2",
  symbol: "BTCUSD",
  tf: "M15",
  title: "MERLIN 2 • BTC/USD Live",
  candles: [],
  levels: null,
  showIndicators: true
};

function initDedicatedMerlin2() {
  const canvas = document.getElementById("canvas-dedicated-merlin2");
  if (!canvas) return;

  if (!dedicatedM2Engine) {
    dedicatedM2Engine = new KoyfinCanvasEngine("canvas-dedicated-merlin2", dedicatedM2Pane);
  }

  fetch(`/api/chart/merlin_2?tf=${dedicatedM2TF}`)
    .then(r => r.json())
    .then(data => {
      if (data && data.candles) {
        dedicatedM2Pane.candles = data.candles;
        dedicatedM2Pane.levels = data.levels;
        dedicatedM2Engine.candles = data.candles;
        dedicatedM2Engine.levels = data.levels;
        dedicatedM2Engine.resize();
        dedicatedM2Engine.render();

        if (data.current_price) {
          const el = document.getElementById("m2-hero-price");
          if (el) el.innerText = `$${data.current_price.toLocaleString("en-US", {minimumFractionDigits: 2})}`;
        }
      }
    })
    .catch(err => console.error("Dedicated M2 fetch error:", err));
}

function setDedicatedM2TF(tf) {
  dedicatedM2TF = tf;
  document.querySelectorAll("#view-page-merlin2 .k-tf-btn").forEach(btn => btn.classList.remove("active"));
  event.target.classList.add("active");
  initDedicatedMerlin2();
}

/* ========================================================
   14. SUB-MILLISECOND LIVE REAL-TIME STREAMING
   (MT5 Server WebSocket + Binance Public WebSocket)
   ======================================================== */
function connectMT5WebSocket() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${proto}//${window.location.host}/ws`;
  let ws = null;

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("⚡ MOMEDO MT5 Live WebSocket Bridge: CONNECTED (Sub-millisecond mode)");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "live_tick_stream") {
          handleMT5LiveTick(msg);
        }
      } catch (err) {
        // silent
      }
    };

    ws.onclose = () => {
      setTimeout(connectMT5WebSocket, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  } catch (e) {
    setTimeout(connectMT5WebSocket, 3000);
  }
}

function handleMT5LiveTick(msg) {
  const xau = msg.xau;
  if (!xau) return;

  const bidStr = xau.bid.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const askStr = xau.ask.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});

  // 1. Update Overview HUD & rows
  const rowXau = document.getElementById("row-xau-price");
  if (rowXau) rowXau.innerText = bidStr;
  const rowGoldCom = document.getElementById("row-gold-com-price");
  if (rowGoldCom) rowGoldCom.innerText = bidStr;

  const pane1Hud = document.getElementById("pane-1-bidask");
  if (pane1Hud && (paneStates[0].engine === "merlin" || paneStates[0].engine === "merlin_1")) {
    pane1Hud.innerText = `${bidStr} / ${askStr}`;
  }

  // 2. Update Dedicated Merlin 1 HUD
  const m1Hero = document.getElementById("m1-hero-bidask");
  if (m1Hero) m1Hero.innerText = `${bidStr} / ${askStr}`;
  const m1Spread = document.getElementById("m1-hero-spread");
  if (m1Spread) m1Spread.innerText = `${xau.spread} pts`;

  // 3. Update Last Candle Live in Canvas
  const p0 = paneStates[0];
  if (p0 && p0.candles && p0.candles.length > 0 && (p0.engine === "merlin" || p0.engine === "merlin_1")) {
    const last = p0.candles[p0.candles.length - 1];
    last.close = xau.bid;
    if (xau.bid > last.high) last.high = xau.bid;
    if (xau.bid < last.low) last.low = xau.bid;
    if (currentPageId === "overview" && p0.engineInst) {
      p0.engineInst.render();
    }
  }

  // Dedicated M1 Canvas
  if (dedicatedM1Pane.candles && dedicatedM1Pane.candles.length > 0) {
    const lastM1 = dedicatedM1Pane.candles[dedicatedM1Pane.candles.length - 1];
    lastM1.close = xau.bid;
    if (xau.bid > lastM1.high) lastM1.high = xau.bid;
    if (xau.bid < lastM1.low) lastM1.low = xau.bid;
    if (currentPageId === "merlin1" && dedicatedM1Engine) {
      dedicatedM1Engine.render();
    }
  }
}

function connectBinanceLiveWebSocket() {
  try {
    const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@ticker");

    ws.onopen = () => {
      console.log("⚡ Binance Public Crypto WebSocket: CONNECTED (Sub-second live ticks)");
    };

    ws.onmessage = (event) => {
      try {
        const t = JSON.parse(event.data);
        const livePrice = parseFloat(t.c);
        if (!livePrice) return;

        const pStr = livePrice.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
        const chg = parseFloat(t.P);
        const isUp = chg >= 0;
        const chgStr = `${isUp ? "+" : ""}${chg.toFixed(2)}%`;

        // 1. Update Overview Rows
        const rowBtc = document.getElementById("row-btc-price");
        if (rowBtc) rowBtc.innerText = pStr;
        const rowBtcCur = document.getElementById("row-btc-cur-price");
        if (rowBtcCur) rowBtcCur.innerText = pStr;

        // 2. Update Dedicated Merlin 2 Hero
        const m2Hero = document.getElementById("m2-hero-price");
        if (m2Hero) m2Hero.innerText = `$${pStr}`;
        const m2Chg = document.getElementById("m2-hero-chg");
        if (m2Chg) {
          m2Chg.innerText = chgStr;
          m2Chg.style.color = isUp ? "#00e676" : "#ff3366";
        }

        // 3. Update Canvas for Pane 2 & Dedicated Merlin 2
        const p1 = paneStates[1];
        if (p1 && p1.candles && p1.candles.length > 0) {
          const last = p1.candles[p1.candles.length - 1];
          last.close = livePrice;
          if (livePrice > last.high) last.high = livePrice;
          if (livePrice < last.low) last.low = livePrice;
          if (currentPageId === "overview" && p1.engineInst) {
            p1.engineInst.render();
          }
        }

        if (dedicatedM2Pane.candles && dedicatedM2Pane.candles.length > 0) {
          const last = dedicatedM2Pane.candles[dedicatedM2Pane.candles.length - 1];
          last.close = livePrice;
          if (livePrice > last.high) last.high = livePrice;
          if (livePrice < last.low) last.low = livePrice;
          if (currentPageId === "merlin2" && dedicatedM2Engine) {
            dedicatedM2Engine.render();
          }
        }
      } catch (err) {
        // silent
      }
    };

    ws.onclose = () => {
      setTimeout(connectBinanceLiveWebSocket, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  } catch (e) {
    // silent
  }
}

/* ========================================================
   15. BOOTSTRAP INITIALIZATION
   ======================================================== */
window.addEventListener("DOMContentLoaded", () => {
  // Initialize Canvas Engines for all 4 panes
  paneStates.forEach((p, idx) => {
    p.engineInst = new KoyfinCanvasEngine(`canvas-pane-${idx + 1}`, p);
  });

  // Load Saved Theme (Default: PROFI QUANT REŽIM)
  const saved = localStorage.getItem("momedo_koyfin_theme");
  const defaultTheme = (saved && saved !== "light" && THEMES[saved]) ? saved : "profi";
  setTheme(defaultTheme);

  // Initial Load: Pane 1 runs clean "MERLIN"
  loadPaneData(0);
  setChartLayout("1x1");
  setActivePane(1);

  // Initial Routing: check if hash exists in URL
  const initialHash = window.location.hash.replace("#", "") || "overview";
  navigateToPage(initialHash);

  // Start Real-Time WebSockets for Sub-millisecond Live Data
  connectMT5WebSocket();
  connectBinanceLiveWebSocket();

  // Poll Engines & Prices
  pollEngines();
  setInterval(pollEngines, 4000);

  // Admin Visitor Counter
  initAdminVisitors();

  // Clock
  setInterval(() => {
    const el = document.getElementById("clock");
    if (el) {
      el.innerText = new Date().toISOString().slice(11, 19) + " UTC";
    }
  }, 1000);
});
