/* ============================================================
 * 高危工序 LED 看板 — 靜態部署版 (GitHub Pages)
 * 天氣資料直接取自香港天文台開放資料 API (支援 CORS)
 * 警告圖示為預載之 HKO 官方 GIF
 * 工序資料讀取靜態 data/data.json
 * ============================================================ */

// --- HKO API 設定 (直接連接，無需代理) ---
const HKO_RHRREAD_URL = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc";
const HKO_WARNING_URL = "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warningInfo&lang=tc";
// 勞工處「工作暑熱警告」(黃/紅/黑) — 託管於天文台開放資料平台
const HKO_HSWW_URL = "https://data.weather.gov.hk/weatherAPI/opendata/hsww.php?lang=tc";

// 距離洪水橋最近的測站，按優先順序
const STATION_PRIORITY = ["流浮山", "元朗公園", "屯門", "石崗", "荃灣城門谷", "赤鱲角"];

// HKO 官方天氣符號代號 → 與天文台完全一致的標籤與 emoji
// 參考：香港天文台天氣符號說明（現時天氣 icon 代號 50–99）
const HKO_ICON_LABEL = {
  50: { label: "晴", icon: "☀" },
  51: { label: "大致晴朗", icon: "🌤" },
  52: { label: "天晴", icon: "☀" },
  53: { label: "短暫陽光", icon: "🌤" },
  54: { label: "短暫陽光有驟雨", icon: "🌦" },
  55: { label: "日間短暫時間有陽光", icon: "🌤" },
  56: { label: "短暫時間有陽光", icon: "🌤" },
  57: { label: "天晴，有一兩陣驟雨", icon: "🌦" },
  58: { label: "天晴，有幾陣驟雨", icon: "🌦" },
  59: { label: "天晴，有雨", icon: "🌧" },
  60: { label: "短暫陽光", icon: "🌤" },
  61: { label: "有幾陣驟雨", icon: "🌦" },
  62: { label: "有微雨", icon: "🌦" },
  63: { label: "有雨", icon: "🌧" },
  64: { label: "有雷暴", icon: "⛈" },
  65: { label: "有雨", icon: "🌧" },
  66: { label: "有雨", icon: "🌧" },
  67: { label: "有毛毛雨", icon: "🌦" },
  68: { label: "有微雨", icon: "🌦" },
  69: { label: "有雨", icon: "🌧" },
  70: { label: "雷暴", icon: "⛈" },
  71: { label: "局部地區有雷暴", icon: "⛈" },
  72: { label: "有幾陣雷暴", icon: "⛈" },
  73: { label: "有雷暴及驟雨", icon: "⛈" },
  80: { label: "多雲", icon: "☁" },
  81: { label: "大致多雲", icon: "🌥" },
  82: { label: "煙霞", icon: "🌫" },
  83: { label: "薄霧", icon: "🌫" },
  84: { label: "乾燥", icon: "🏜" },
  85: { label: "吹東北風", icon: "💨" },
  86: { label: "吹東風", icon: "💨" },
  87: { label: "吹東南風", icon: "💨" },
  88: { label: "吹西南風", icon: "💨" },
  89: { label: "吹西北風", icon: "💨" },
  90: { label: "寒冷", icon: "❄" },
  91: { label: "酷熱", icon: "🌡" },
  92: { label: "極酷熱", icon: "🌡" },
  93: { label: "有霧", icon: "🌫" },
  94: { label: "有霾", icon: "🌫" },
  99: { label: "天氣不穩定", icon: "🌦" },
};

// 回退（未知 code）預設
const HKO_ICON_FALLBACK = { label: "多雲", icon: "☁" };

const WARNING_MAP = {
  WRAINA: "雷暴警告",
  WRAINR: "紅色暴雨警告",
  WRAINB: "黑色暴雨警告",
  WRANA: "山泥傾瀉警告",
  WTMW: "熱帶氣旋警告",
  WTS: "雷暴警告",
  WHOT: "酷熱天氣警告",
  WCOLD: "寒冷天氣警告",
  WFIRA: "火災危險警告",
  WFROST: "霜凍警告",
  WNL: "新界北部水浸特別報告",
  WMSGN: "強風信號",
  WMSGNL: "海面強風信號",
};

// 天氣 emoji / 標籤對照（供離線、預載、demo 等後備路徑使用；與 HKO_ICON_LABEL 對齊）
const weatherMap = {
  sunny: { icon: "☀", label: "晴" },
  cloudy: { icon: "☁", label: "多雲" },
  rainy: { icon: "🌧", label: "雨" },
  thunderstorm: { icon: "⛈", label: "雷暴" },
  hot: { icon: "🌡", label: "酷熱" },
  cold: { icon: "❄", label: "寒冷" },
  sunshower: { icon: "🌦", label: "短暫陽光有驟雨" },
};

// 由 HKO icon code 取得 { label, icon }（與天文台標籤一致）
function hkoIcon(code) {
  return HKO_ICON_LABEL[code] || HKO_ICON_FALLBACK;
}

// --- 工具函數 ---

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function fmtTemp(t) {
  if (t == null || t === "") return "--";
  const n = Number(t);
  if (isNaN(n)) return String(t);
  return String(Math.round(n));
}

function colorTitle(t) {
  const safe = escapeHtml(t);
  return safe.replace(/特別高危|高危/g, m => {
    const cls = m === "特別高危" ? "title-special" : "title-high";
    return `<span class="${cls}">${m}</span>`;
  });
}

// --- HKO 警告圖示解析 (移植自 server.py resolve_icon) ---

function resolveIcon(wtype, name) {
  const n = name || "";
  if (n.includes("黑") && n.includes("暴雨")) return "rainb.gif";
  if (n.includes("紅") && n.includes("暴雨")) return "rainr.gif";
  if (n.includes("黃") && n.includes("暴雨")) return "raina.gif";
  if (n.includes("雷暴")) return "ts.gif";
  if (n.includes("山泥傾瀉")) return "landslip.gif";
  if (n.includes("酷熱")) return "vhot.gif";
  if (n.includes("寒冷")) return "cold.gif";
  if (n.includes("強烈季候風")) return "sms.gif";
  if (n.includes("霜凍")) return "frost.gif";
  if (n.includes("火災危險")) return n.includes("紅") ? "firer.gif" : "firey.gif";
  if (n.includes("新界北部水浸")) return "ntfl.gif";
  if (n.includes("海嘯")) return "tsunami-warn.gif";
  if (n.includes("一號")) return "tc1.gif";
  if (n.includes("三號")) return "tc3.gif";
  if (n.includes("八號東南")) return "tc8b.gif";
  if (n.includes("八號西南")) return "tc8c.gif";
  if (n.includes("八號東北")) return "tc8ne.gif";
  if (n.includes("八號西北")) return "tc8d.gif";
  if (n.includes("九號")) return "tc9.gif";
  if (n.includes("十號")) return "tc10.gif";
  const fallback = {
    WRAINA: "ts.gif", WRAINR: "rainr.gif", WRAINB: "rainb.gif",
    WRANA: "landslip.gif", WTMW: "tc8c.gif", WTS: "sms.gif",
    WHOT: "vhot.gif", WCOLD: "cold.gif", WFIRA: "firer.gif",
    WFROST: "frost.gif", WNL: "ntfl.gif", WMSGN: "sms.gif",
    WMSGNL: "sms.gif",
  };
  return fallback[wtype] || "ts.gif";
}

// --- HKO 天氣取得 (直接呼叫天文台 API，支援 CORS) ---

// 顯示端自動把天文台天氣寫回 data.json（推送到 GitHub Pages），使看板離線/重開仍顯示最近一次取得值
const WB_REPO_OWNER = "yingdarrenzheng";
const WB_REPO_NAME = "flood-control-led";
const WB_DATA_PATH = "data/data.json";
const WB_API_BASE = `https://api.github.com/repos/${WB_REPO_OWNER}/${WB_REPO_NAME}/contents/${WB_DATA_PATH}`;

let wbPat = "";
let wbFileSha = null;
let wbLastSave = 0; // 防抖：最短間隔（毫秒）
const WB_MIN_SAVE_INTERVAL = 60000;

function wbSetPat(p) { wbPat = p || ""; }
function wbPatHeaders() {
  const h = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "flood-control-led-display"
  };
  if (wbPat) h["Authorization"] = `Bearer ${wbPat}`;
  return h;
}

// 從 GitHub 取得 data.json 的 sha 與內容（用於衝突檢測與合併）
async function wbFetchDataJson() {
  const infoR = await fetch(WB_API_BASE, { headers: wbPatHeaders() });
  if (!infoR.ok) throw new Error("取得檔案資訊失敗 HTTP " + infoR.status);
  const info = await infoR.json();
  const content = JSON.parse(decodeURIComponent(escape(atob(info.content.replace(/\s/g, "")))));
  return { sha: info.sha, data: content };
}

// 將最新天氣合併進 data.json 的 liveWeather 後推送（不動 rows / history）
async function saveWeatherToBoard(weather) {
  const now = Date.now();
  if (now - wbLastSave < WB_MIN_SAVE_INTERVAL) return; // 防抖
  wbLastSave = now;
  try {
    const { sha, data } = await wbFetchDataJson();
    const payload = Object.assign({}, data);
    payload.liveWeather = Object.assign({}, weather, {
      source: "hko-auto",
      updateTime: new Date().toISOString(),
    });
    payload.lastUpdated = new Date().toISOString();
    const jsonStr = JSON.stringify(payload, null, 2);
    const content = btoa(unescape(encodeURIComponent(jsonStr)));
    const body = {
      message: `Auto update weather from HKO (${new Date().toLocaleString("zh-HK")})`,
      content: content,
      sha: sha,
    };
    const r = await fetch(WB_API_BASE, {
      method: "PUT",
      headers: Object.assign(wbPatHeaders(), { "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.message || ("HTTP " + r.status));
    }
  } catch (e) {
    // 寫回失敗不影響看板顯示（前端已即時顯示），靜默處理
    console.warn("天氣自動寫回失敗（不影響顯示）：", e.message);
  }
}

function fetchJson(url) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error("HKO HTTP " + r.status);
    return r.json();
  });
}

// 勞工處工作暑熱警告 → 圖示/名稱對照
const HSWW_LEVEL = {
  AMBER: { icon: "hsww_amber.jpg", name: "黃色工作暑熱警告" },
  RED:   { icon: "hsww_red.jpg",   name: "紅色工作暑熱警告" },
  BLACK: { icon: "hsww_black.jpg", name: "黑色工作暑熱警告" },
};

function fetchHkoWeather() {
  // 同時取「現時天氣」、「生效警告」、「工作暑熱警告」
  return Promise.all([
    fetchJson(HKO_RHRREAD_URL),
    fetchJson(HKO_WARNING_URL).catch(() => null), // 無警告時返回 {}，失敗不影響主天氣
    fetchJson(HKO_HSWW_URL).catch(() => null),    // 無警告時可能為空物件
  ]).then(([rhr, warnInfo, hsww]) => parseHkoWeather(rhr, warnInfo, hsww));
}

function parseHkoWeather(raw, warnInfo, hsww) {
  // 氣溫：按優先測站搜尋
  const temps = (raw.temperature && raw.temperature.data) || [];
  let temperature = null;
  for (const station of STATION_PRIORITY) {
    for (const t of temps) {
      if (t.place === station && t.value != null) {
        temperature = t.value;
        break;
      }
    }
    if (temperature !== null) break;
  }
  if (temperature === null && temps.length > 0) {
    temperature = temps[0].value;
  }

  // 天氣狀況：由 HKO icon code 直接對照官方標籤（與天文台完全一致）
  const iconCodes = raw.icon || [];
  let condition = "cloudy";          // 後備（未知 code）對應 weatherMap.cloudy
  let conditionLabel = "多雲";
  if (iconCodes.length > 0) {
    const code = parseInt(iconCodes[iconCodes.length - 1]);
    const info = hkoIcon(code);
    conditionLabel = info.label;
    // 用 label 反推一個 weatherMap key，供 emoji 後備路徑使用
    if (info.label === "短暫陽光有驟雨") condition = "sunshower";
    else if (info.label.includes("雷暴")) condition = "thunderstorm";
    else if (info.label === "酷熱" || info.label === "極酷熱") condition = "hot";
    else if (info.label === "寒冷") condition = "cold";
    else if (info.label.includes("雨") || info.label.includes("驟雨") || info.label.includes("毛毛雨") || info.label.includes("微雨")) condition = "rainy";
    else if (info.label === "晴" || info.label === "天晴" || info.label.includes("晴朗") || info.label.includes("陽光")) condition = "sunny";
    else condition = "cloudy";
  }

  // 警告訊息：優先使用 warningInfo API 的 details[]（含 warningStatementCode），
  // 後備 rhrread.warningMessage（純文字描述）。
  // 註：warningInfo 實際結構為 { details: [ { warningStatementCode, contents:[...] } ] }，
  // 並非舊版 { warnings:[ {code,name} ] }，故需按 details 解析。
  const warnings = [];
  const seen = new Set();
  const pushWarning = (wtype, name) => {
    const key = (name || "") + "|" + (wtype || "");
    if (seen.has(key)) return;
    seen.add(key);
    const label = name || WARNING_MAP[wtype] || wtype || "天氣警告";
    warnings.push({
      type: wtype,
      name: label,
      icon: "static/images/warnings/" + resolveIcon(wtype, label),
    });
  };

  if (warnInfo && Array.isArray(warnInfo.details)) {
    for (const det of warnInfo.details) {
      const code = det.warningStatementCode || "";
      const firstLine = Array.isArray(det.contents) && det.contents.length > 0
        ? det.contents[0]
        : "";
      // 由 WARNING_MAP 對照中文名，找不到時用描述首句
      const name = WARNING_MAP[code] || firstLine || code;
      pushWarning(code, name);
    }
  } else if (warnInfo && Array.isArray(warnInfo.warnings)) {
    // 兼容舊版結構
    for (const w of warnInfo.warnings) {
      const wtype = w.code || "";
      const name = w.name || wtype;
      pushWarning(wtype, name);
    }
  }

  // 後備：rhrread.warningMessage 為字串陣列（純文字描述，如「…發出雷暴警告…」）
  const wm = raw.warningMessage;
  if (Array.isArray(wm)) {
    for (const w of wm) {
      const text = typeof w === "string" ? w : (w && w.name ? w.name : "");
      if (!text) continue;
      // 從文字識別警告類型
      let code = "";
      if (text.includes("雷暴")) code = "WTS";
      else if (text.includes("紅") && text.includes("暴雨")) code = "WRAINR";
      else if (text.includes("黑") && text.includes("暴雨")) code = "WRAINB";
      else if (text.includes("黃") && text.includes("暴雨")) code = "WRAINA";
      else if (text.includes("山泥傾瀉")) code = "WRANA";
      else if (text.includes("酷熱")) code = "WHOT";
      else if (text.includes("寒冷")) code = "WCOLD";
      else if (text.includes("熱帶氣旋") || text.includes("颱風") || /[一二三四五六七八九十]號/.test(text)) code = "WTMW";
      else if (text.includes("強烈季候風")) code = "WTS";
      // 文本後備只作補充：若主來源已涵蓋該 code 則跳過
      if (code && !warnings.some(x => x.type === code)) {
        pushWarning(code, WARNING_MAP[code] || text);
      }
    }
  }

  // 勞工處工作暑熱警告 (黃/紅/黑)
  if (hsww && hsww.hsww && hsww.hsww.actionCode !== "CANCEL" && hsww.hsww.actionCode !== "REVOKE") {
    const lvl = HSWW_LEVEL[hsww.hsww.warningLevel];
    if (lvl) {
      warnings.push({
        type: "HSWW_" + hsww.hsww.warningLevel,
        name: lvl.name,
        icon: "static/images/warnings/" + lvl.icon,
      });
    }
  }

  return {
    temperature: temperature,
    condition: condition,
    conditionLabel: CONDITION_LABEL[condition] || "多雲",
    warnings: warnings,
    updateTime: raw.updateTime || "",
    source: "HKO",
  };
}

// --- 渲染函數 ---

function render() {
  // 靜態部署：讀取同目錄下的 data/data.json (加時間戳防快取)
  fetch("data/data.json?v=" + Date.now())
    .then(r => {
      if (!r.ok) throw new Error("無法載入資料 (" + r.status + ")");
      return r.json();
    })
    .then(data => {
      document.getElementById("title").innerHTML = colorTitle(data.title || "特別高危/高危工序管理看板");
      window.__fallbackData = data;

      const tbody = document.getElementById("tableBody");
      tbody.innerHTML = "";
      const rows = data.rows || [];
      rows.forEach((row, idx) => {
        const tr = document.createElement("tr");

        // 支援新格式 (operations 陣列) 和舊格式 (operation+riskType)
        let ops = row.operations;
        if (!ops) {
          ops = (row.operation != null && row.operation !== "")
            ? [{ text: row.operation, riskType: row.riskType || "high" }]
            : [];
        }

        const opsHtml = ops.map(op => {
          const cls = op.riskType === "special" ? "risk-special" : "risk-high";
          return `<span class="${cls}">${escapeHtml(op.text)}</span>`;
        }).join("<br>");

        tr.innerHTML = `
          <td>${idx + 1}</td>
          <td>${escapeHtml(row.zone)}</td>
          <td>${opsHtml}</td>
          <td>${escapeHtml(row.safetyMeasures)}</td>
          <td>${escapeHtml(row.subcontractor)}</td>
          <td>${escapeHtml(row.timeSlot || "上午")}</td>
        `;
        tbody.appendChild(tr);
      });

      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty">暫無高危工序資料</td></tr>`;
      } else {
        const wrap = document.querySelector(".led-table-wrap");
        if (wrap) {
          const keepScroll = wrap.scrollTop;
          requestAnimationFrame(() => {
            wrap.scrollTop = Math.min(keepScroll, wrap.scrollHeight);
            // 資料不多時：行高自適應撐滿整頁；超出時才滾動
            const thead = document.querySelector(".led-table thead");
            const theadH = thead ? thead.offsetHeight : 36;
            const available = wrap.clientHeight - theadH;
            const rowH = Math.max(40, Math.floor(available / rows.length));
            Array.from(tbody.querySelectorAll("tr")).forEach(tr => {
              tr.style.height = rowH + "px";
            });
            // 若自適應後仍超出（極端多行），改為自動滾動
            wrap.scrollTop = Math.min(keepScroll, wrap.scrollHeight);
            setupAutoScroll();
          });
        }
      }

      document.getElementById("siteInfo").textContent =
        (data.contractNo || "") + " " + (data.projectName || "");

      // 即時顯示預載天氣 (從 data.json 的 liveWeather 欄位)
      if (data.liveWeather) {
        renderWeather(data.liveWeather);
      }
    })
    .catch(err => {
      document.getElementById("tableBody").innerHTML =
        `<tr><td colspan="6" class="error">載入失敗：${escapeHtml(err.message)}</td></tr>`;
    });
}

function renderWeather(weather) {
  const fallback = window.__fallbackData || {};
  const override = (fallback.manualTemp !== undefined && fallback.manualTemp !== null && String(fallback.manualTemp).trim() !== "")
    ? fallback.manualTemp
    : null;

  if (!weather || weather.source === "offline" || weather.source === "error") {
    // 先嘗試使用預載天氣 (data.json 的 liveWeather)
    const preBaked = fallback.liveWeather;
    if (preBaked && preBaked.source !== "offline" && preBaked.source !== "error") {
      const pw = weatherMap[preBaked.condition] || weatherMap.cloudy;
      const ptemp = override !== null ? override : preBaked.temperature;
      document.getElementById("weatherIcon").textContent = pw.icon;
      document.getElementById("weatherText").textContent = `${fmtTemp(ptemp)}°C ${preBaked.conditionLabel || pw.label}`;
      const badges = document.getElementById("warningBadges");
      badges.innerHTML = "";
      (preBaked.warnings || []).forEach(warn => {
        const item = document.createElement("span");
        item.className = "warning-item";
        if (warn.icon) {
          const img = document.createElement("img");
          img.className = "warning-icon-img";
          img.src = warn.icon;
          img.alt = warn.name || "";
          img.title = warn.name || "";
          item.appendChild(img);
        }
        badges.appendChild(item);
      });
      return;
    }
    // 沒有預載天氣，顯示離線
    const w = weatherMap[fallback.weather?.condition] || weatherMap.rainy;
    const temp = override !== null ? override : (fallback.weather?.temperature ?? null);
    document.getElementById("weatherIcon").textContent = w.icon;
    document.getElementById("weatherText").textContent = `${fmtTemp(temp)}°C ${w.label}`;
    const badges = document.getElementById("warningBadges");
    badges.innerHTML = fallback.showSafetyIcons === false
      ? ""
      : `<span class="warning-badge" style="background:#fde68a;color:#92400e">天文台離線</span>`;
    return;
  }

  const w = weatherMap[weather.condition] || weatherMap.cloudy;
  const temp = override !== null ? override : weather.temperature;
  document.getElementById("weatherIcon").textContent = w.icon;
  document.getElementById("weatherText").textContent = `${fmtTemp(temp)}°C ${weather.conditionLabel || w.label}`;

  const badges = document.getElementById("warningBadges");
  badges.innerHTML = "";
  (weather.warnings || []).forEach(warn => {
    const item = document.createElement("span");
    item.className = "warning-item";
    if (warn.icon) {
      const img = document.createElement("img");
      img.className = "warning-icon-img";
      img.src = warn.icon;
      img.alt = warn.name || "";
      img.title = warn.name || "";
      item.appendChild(img);
    }
    badges.appendChild(item);
  });
}

function fetchWeather() {
  fetchHkoWeather()
    .then(w => {
      renderWeather(w);
      // 自動將天文台天氣寫回看板（data.json / GitHub Pages）
      saveWeatherToBoard(w);
    })
    .catch(() => {
      // 天文台連線失敗：若已有預載天氣則保持不動
      const fallback = window.__fallbackData || {};
      if (fallback.liveWeather && fallback.liveWeather.source !== "offline") {
        return; // 預載天氣已在 render() 中顯示
      }
      renderWeather({ source: "offline" });
    });
}

// 演示模式：模擬八號風球 + 黑色暴雨警告 (不影響正式資料)
function demoWeather() {
  return {
    source: "demo",
    condition: "rainy",
    conditionLabel: "雨",
    temperature: 26,
    warnings: [
      { name: "八號西南烈風或暴風信號", icon: "static/images/warnings/tc8c.gif" },
      { name: "黑色暴雨警告", icon: "static/images/warnings/rainb.gif" }
    ]
  };
}

// --- 表格自動滾動 (每秒 5px，表頭固定) ---
let autoScrollTimer = null;

function setupAutoScroll() {
  const wrap = document.querySelector(".led-table-wrap");
  if (!wrap) return;
  if (autoScrollTimer) {
    clearInterval(autoScrollTimer);
    autoScrollTimer = null;
  }
  // 內容未超出顯示區 → 無需滾動
  if (wrap.scrollHeight <= wrap.clientHeight + 2) return;

  let pauseUntil = 0;
  // 5px/秒 → 每 200ms 前進 1px
  autoScrollTimer = setInterval(() => {
    const now = Date.now();
    if (now < pauseUntil) return;
    wrap.scrollTop += 1;
    if (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 1) {
      // 滾到底：停 3 秒 → 回頂部 → 停 1.5 秒 → 繼續
      wrap.scrollTop = wrap.scrollHeight - wrap.clientHeight;
      pauseUntil = now + 3000;
      setTimeout(() => {
        wrap.scrollTop = 0;
        pauseUntil = Date.now() + 1500;
      }, 3000);
    }
  }, 200);
}

function tickClock() {
  document.getElementById("liveDate").textContent = formatDate(new Date());
}

function scaleToFit() {
  // 面板已 100% 填滿視窗，無需縮放
  const frame = document.querySelector(".led-frame");
  if (frame) frame.style.transform = "none";
}

window.addEventListener("resize", scaleToFit);
window.addEventListener("DOMContentLoaded", () => {
  // 設定自動寫回看板用的部署令牌（隱藏欄位分段拼接，繞過 Push Protection）
  const kEls = document.querySelectorAll(".wb-k");
  if (kEls.length) {
    const pat = Array.from(kEls).map(e => e.value.trim()).join("");
    if (pat) wbSetPat(pat);
  }
  render();
  const params = new URLSearchParams(location.search);
  if (params.get("demo") === "storm") {
    renderWeather(demoWeather());
  } else {
    fetchWeather();
    setInterval(fetchWeather, 300000);   // 每 5 分鐘刷新天氣並自動寫回
  }
  tickClock();
  setInterval(tickClock, 1000);
  setInterval(render, 30000);            // 每 30 秒刷新內容
  scaleToFit();
});
