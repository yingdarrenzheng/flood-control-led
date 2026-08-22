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

const ICON_CONDITION = {
  sunny: [50, 51, 52, 53],
  cloudy: [54, 60, 61, 80, 81, 82, 83],
  rainy: [62, 63, 64, 65, 66, 67, 68, 69],
  thunderstorm: [70, 71],
  hot: [91],
  cold: [90],
};

const CONDITION_LABEL = {
  sunny: "晴",
  cloudy: "多雲",
  rainy: "雨",
  thunderstorm: "雷暴",
  hot: "酷熱",
  cold: "寒冷",
};

const WARNING_MAP = {
  WRAINA: "雷暴警告",
  WRAINR: "紅色暴雨警告",
  WRAINB: "黑色暴雨警告",
  WRANA: "山泥傾瀉警告",
  WTMW: "熱帶氣旋警告",
  WTS: "強烈季候風信號",
  WHOT: "酷熱天氣警告",
  WCOLD: "寒冷天氣警告",
  WFIRA: "火災危險警告",
  WFROST: "霜凍警告",
  WNL: "新界北部水浸特別報告",
  WMSGN: "強風信號",
  WMSGNL: "海面強風信號",
};

// 天氣 emoji 對照
const weatherMap = {
  sunny: { icon: "☀", label: "晴" },
  cloudy: { icon: "☁", label: "多雲" },
  rainy: { icon: "🌧", label: "雨" },
  thunderstorm: { icon: "⛈", label: "雷暴" },
  hot: { icon: "🌡", label: "酷熱" },
  cold: { icon: "❄", label: "寒冷" }
};

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

  // 天氣狀況：從 icon code 判斷
  const iconCodes = raw.icon || [];
  let condition = "cloudy";
  if (iconCodes.length > 0) {
    const code = parseInt(iconCodes[iconCodes.length - 1]);
    for (const [cond, codes] of Object.entries(ICON_CONDITION)) {
      if (codes.includes(code)) {
        condition = cond;
        break;
      }
    }
  }

  // 警告訊息：優先使用 warningInfo API (code + name)，後備 rhrread.warningMessage
  const warnings = [];
  const seen = new Set();
  if (warnInfo && Array.isArray(warnInfo.warnings)) {
    for (const w of warnInfo.warnings) {
      const wtype = w.code || "";
      const name = w.name || wtype;
      const key = name + "|" + wtype;
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push({
        type: wtype,
        name: name,
        icon: "static/images/warnings/" + resolveIcon(wtype, name),
      });
    }
  }
  const wm = raw.warningMessage;
  if (Array.isArray(wm)) {
    for (const w of wm) {
      let wtype, name;
      if (typeof w === "object" && w !== null) {
        wtype = w.type || "";
        name = w.name || wtype;
      } else {
        wtype = String(w);
        name = wtype;
      }
      const key = name + "|" + wtype;
      if (seen.has(key)) continue;
      seen.add(key);
      warnings.push({
        type: wtype,
        name: name,
        icon: "static/images/warnings/" + resolveIcon(wtype, name),
      });
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
          <td>${escapeHtml(row.timeSlot || "全天")}</td>
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
    .then(w => renderWeather(w))
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

// --- 表格自動滾動 (每秒 10px，表頭固定) ---
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
  // 10px/秒 → 每 100ms 前進 1px
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
  }, 100);
}

function tickClock() {
  document.getElementById("liveDate").textContent = formatDate(new Date());
}

function scaleToFit() {
  const frame = document.querySelector(".led-frame");
  if (!frame) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const scaleX = W / 896;
  const scaleY = H / 448;
  const scale = Math.min(scaleX, scaleY, 1);
  frame.style.transform = `scale(${scale})`;
}

window.addEventListener("resize", scaleToFit);
window.addEventListener("DOMContentLoaded", () => {
  render();
  const params = new URLSearchParams(location.search);
  if (params.get("demo") === "storm") {
    renderWeather(demoWeather());
  } else {
    fetchWeather();
    setInterval(fetchWeather, 300000);   // 每 5 分鐘刷新天氣
  }
  tickClock();
  setInterval(tickClock, 1000);
  setInterval(render, 30000);            // 每 30 秒刷新內容
  scaleToFit();
});
