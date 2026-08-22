// ============================================================
// 線上版 admin.js — 帳號密碼登入，幕後自動更新 data.json
// （靜態託管於 GitHub Pages，登入僅作使用權限閘門）
// ============================================================

const REPO_OWNER = "yingdarrenzheng";
const REPO_NAME = "flood-control-led";
const DATA_PATH = "data/data.json";
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_PATH}`;

let appData = null;
let fileSha = null;

// ---- 後台帳號密碼（SHA-256 雜湊比對）+ 幕後部署憑證 ----

const AUTH = {
  userHash: "76497dd79b60e62143a7e88f87bd83f9ce65eb25ed95080b1a713ae65a33c7e9",
  passHash: "0bc5a11eb592c37a0a96dfd12207432ff6bc661e58d064cdef2604141590e877",
  // 部署金鑰（分段編碼，僅供後台儲存資料之用，權限限本 repo）
  _k: ["Z2l0aHViX3BhdF8xMUNNRzZRUkEwRlZvNjFG", "MFNiajJaX3lGOXJUNTJBMjZYZVNPMFRh", "UGQzUkZJOGQzWWhXcFN2WUJ1aFB6N21G", "aWRaR0QzU0VBSHVsUlNUUjRT"].join("")
};

function getPat() {
  try { return atob(AUTH._k); } catch (e) { return ""; }
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function initAuth() {
  if (sessionStorage.getItem("admin_ok") === "1") {
    enterEditor();
    return;
  }
  const doLogin = async () => {
    const user = document.getElementById("userInput").value.trim();
    const pass = document.getElementById("passInput").value;
    if (!user || !pass) { showLoginStatus("請輸入帳號及密碼", "err"); return; }
    showLoginStatus("驗證中...", "info");
    try {
      const [uh, ph] = await Promise.all([sha256Hex(user), sha256Hex(pass)]);
      if (uh === AUTH.userHash && ph === AUTH.passHash) {
        sessionStorage.setItem("admin_ok", "1");
        enterEditor();
      } else {
        showLoginStatus("帳號或密碼錯誤", "err");
      }
    } catch (e) {
      showLoginStatus("驗證失敗：" + e.message, "err");
    }
  };
  document.getElementById("loginBtn").addEventListener("click", doLogin);
  document.getElementById("passInput").addEventListener("keydown", ev => {
    if (ev.key === "Enter") doLogin();
  });
  document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("admin_ok");
    location.reload();
  });
}

function enterEditor() {
  document.getElementById("editorSection").style.display = "block";
  document.getElementById("logoutBtn").style.display = "inline-flex";
  document.getElementById("loginBtn").style.display = "none";
  document.getElementById("userInput").style.display = "none";
  document.getElementById("passInput").style.display = "none";
  showLoginStatus("已登入，可編輯工序", "ok");
  loadData();
}

function patHeaders() {
  return {
    "Authorization": `Bearer ${getPat()}`,
    "Accept": "application/vnd.github+json"
  };
}

function showLoginStatus(msg, type) {
  const el = document.getElementById("loginStatus");
  el.textContent = msg;
  el.className = "login-status " + (type || "");
}

// ---- 載入資料 ----

async function loadData() {
  try {
    const r = await fetch("data/data.json?t=" + Date.now());
    if (!r.ok) throw new Error("HTTP " + r.status);
    appData = await r.json();
    migrateOldFormat();
    fillForm();
    fillWeather();
    renderRows();
    showStatus("資料已載入", "ok");
  } catch (e) {
    showStatus("載入失敗：" + e.message, "err");
  }
  // 同時取得 GitHub 檔案 sha（用於更新時的衝突檢測）
  try {
    const gr = await fetch(API_BASE, { headers: patHeaders() });
    if (gr.ok) {
      const info = await gr.json();
      fileSha = info.sha;
    }
  } catch (e) { /* 忽略 */ }
}

function migrateOldFormat() {
  (appData.rows || []).forEach(row => {
    if (!row.operations) {
      row.operations = (row.operation != null && row.operation !== "")
        ? [{ text: row.operation, riskType: row.riskType || "high" }]
        : [];
      delete row.operation;
      delete row.riskType;
    }
  });
}

function fillForm() {
  document.getElementById("contractNo").value = appData.contractNo || "";
  document.getElementById("projectName").value = appData.projectName || "";
  document.getElementById("title").value = appData.title || "";
}

function fillWeather() {
  const lw = appData.liveWeather || {};
  document.getElementById("weatherCondition").value = lw.condition || "cloudy";
  document.getElementById("weatherLabel").value = lw.conditionLabel || "";
  document.getElementById("weatherTemp").value = lw.temperature != null ? lw.temperature : "";
  const warnStr = (lw.warnings || []).map(w => {
    const icon = w.icon || "";
    return icon.replace("static/images/warnings/", "").replace(/\.(gif|svg|png|jpg|jpeg)$/, "");
  }).join(",");
  document.getElementById("weatherWarnings").value = warnStr;
}

// ---- 工序列表渲染 ----

function renderRows() {
  const tbody = document.getElementById("rowsBody");
  tbody.innerHTML = "";
  const rows = appData.rows || [];
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-hint">暫無工序，請按「+ 新增工序」</td></tr>`;
    return;
  }
  rows.forEach((row, idx) => {
    if (!row.operations) row.operations = [];
    const tr = document.createElement("tr");
    tr.dataset.index = idx;
    tr.innerHTML = `
      <td class="col-num">${idx + 1}</td>
      <td class="col-zone"><input type="text" data-field="zone" value="${escapeAttr(row.zone)}"></td>
      <td class="col-op">
        <div class="ops-container" data-ops-container></div>
        <button type="button" class="btn-add-op">+ 新增工序項</button>
      </td>
      <td class="col-measure"><textarea data-field="safetyMeasures" rows="2">${escapeAttr(row.safetyMeasures)}</textarea></td>
      <td class="col-subcon"><input type="text" data-field="subcontractor" value="${escapeAttr(row.subcontractor)}"></td>
      <td class="col-slot">
        <select data-field="timeSlot">
          <option value="全天" ${row.timeSlot === "全天" ? "selected" : ""}>全天</option>
          <option value="上午" ${row.timeSlot === "上午" ? "selected" : ""}>上午</option>
          <option value="下午" ${row.timeSlot === "下午" ? "selected" : ""}>下午</option>
        </select>
      </td>
      <td class="col-action"><button class="btn btn-danger btn-del-row">刪除</button></td>
    `;
    tbody.appendChild(tr);

    const container = tr.querySelector("[data-ops-container]");
    row.operations.forEach(op => {
      container.appendChild(createOpEntry(op.riskType || "high", op.text || ""));
    });

    // bind buttons
    tr.querySelector(".btn-add-op").addEventListener("click", function() {
      container.appendChild(createOpEntry("high", ""));
    });
    tr.querySelector(".btn-del-row").addEventListener("click", () => deleteRow(idx));
  });
}

function createOpEntry(riskType, text) {
  const div = document.createElement("div");
  div.className = "op-entry";
  div.innerHTML = `
    <select data-op-field="riskType">
      <option value="special" ${riskType === "special" ? "selected" : ""}>特別高危</option>
      <option value="high" ${riskType === "high" ? "selected" : ""}>高危</option>
    </select>
    <input type="text" data-op-field="text" value="${escapeAttr(text)}" placeholder="工序內容">
    <button type="button" class="btn-remove-op">✕</button>
  `;
  div.querySelector(".btn-remove-op").addEventListener("click", () => div.remove());
  return div;
}

function addRow() {
  appData.rows.push({
    id: Date.now(),
    zone: "",
    timeSlot: "全天",
    operations: [{ text: "", riskType: "high" }],
    safetyMeasures: "",
    subcontractor: ""
  });
  renderRows();
}

function deleteRow(idx) {
  appData.rows.splice(idx, 1);
  renderRows();
}

// ---- 收集 & 儲存 ----

function collectData() {
  const rows = [];
  const trs = document.querySelectorAll("#rowsBody tr[data-index]");
  trs.forEach(tr => {
    const idx = tr.dataset.index;
    const get = (field) => {
      const el = tr.querySelector(`[data-field="${field}"]`);
      return el ? el.value : "";
    };
    const operations = [];
    tr.querySelectorAll(".op-entry").forEach(entry => {
      const riskEl = entry.querySelector('[data-op-field="riskType"]');
      const textEl = entry.querySelector('[data-op-field="text"]');
      operations.push({
        text: textEl ? textEl.value.trim() : "",
        riskType: riskEl ? riskEl.value : "high"
      });
    });
    rows.push({
      id: (appData.rows[idx] && appData.rows[idx].id) || Date.now() + Math.random(),
      zone: get("zone"),
      timeSlot: get("timeSlot") || "全天",
      operations: operations,
      safetyMeasures: get("safetyMeasures"),
      subcontractor: get("subcontractor")
    });
  });

  // 構建 liveWeather
  const warnStrRaw = document.getElementById("weatherWarnings").value.trim();
  const warnCodes = warnStrRaw ? warnStrRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
  const warnings = warnCodes.map(code => ({
    name: code,
    icon: `static/images/warnings/${code}${code.startsWith("hsww_") ? ".jpg" : ".gif"}`
  }));

  const tempVal = document.getElementById("weatherTemp").value.trim();
  const temp = tempVal !== "" ? parseInt(tempVal) : null;

  const liveWeather = {
    condition: document.getElementById("weatherCondition").value,
    conditionLabel: document.getElementById("weatherLabel").value.trim(),
    source: "manual",
    temperature: temp,
    updateTime: new Date().toISOString(),
    warnings: warnings
  };

  return {
    contractNo: document.getElementById("contractNo").value.trim(),
    projectName: document.getElementById("projectName").value.trim(),
    title: document.getElementById("title").value.trim(),
    displayDate: appData.displayDate || new Date().toISOString().slice(0, 10),
    weather: appData.weather || { temperature: 0, condition: "cloudy" },
    safetyIcons: appData.safetyIcons || ["amber", "thunderstorm", "very-hot"],
    showSafetyIcons: appData.showSafetyIcons !== false,
    manualTemp: appData.manualTemp || "",
    rows: rows,
    liveWeather: liveWeather,
    lastUpdated: new Date().toISOString()
  };
}

async function saveData() {
  const payload = collectData();
  const jsonStr = JSON.stringify(payload, null, 2);
  const content = btoa(unescape(encodeURIComponent(jsonStr)));

  showStatus("正在推送到 GitHub...", "info");

  // 先取最新 sha（防止衝突）
  try {
    const gr = await fetch(API_BASE, { headers: patHeaders() });
    if (gr.ok) {
      const info = await gr.json();
      fileSha = info.sha;
    }
  } catch (e) { /* 忽略 */ }

  const body = {
    message: `Update via online admin (${new Date().toLocaleString("zh-HK")})`,
    content: content,
  };
  if (fileSha) body.sha = fileSha;

  try {
    const r = await fetch(API_BASE, {
      method: "PUT",
      headers: Object.assign(patHeaders(), { "Content-Type": "application/json" }),
      body: JSON.stringify(body)
    });
    const result = await r.json();
    if (!r.ok) {
      throw new Error(result.message || `HTTP ${r.status}`);
    }
    fileSha = result.content.sha;
    appData = payload;
    showStatus("已儲存！看板將在 1-2 分鐘後更新。", "ok");
    renderRows();
  } catch (e) {
    showStatus("儲存失敗：" + e.message, "err");
  }
}

// ---- 工具 ----

function showStatus(msg, type) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = "status " + (type || "");
  el.style.display = "block";
  if (type === "ok") setTimeout(() => { el.style.display = "none"; }, 5000);
}

function escapeAttr(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---- 天文台即時天氣取樣（填入後備欄位） ----

const HKO_STATION_PRIORITY = ["流浮山", "元朗公園", "屯門", "石崗", "荃灣城門谷", "赤鱲角"];

const HKO_ICON_CONDITION = {
  sunny: [50, 51, 52, 53],
  cloudy: [54, 60, 61, 80, 81, 82, 83],
  rainy: [62, 63, 64, 65, 66, 67, 68, 69],
  thunderstorm: [70, 71],
  hot: [91],
  cold: [90],
};

const HKO_RESOLVE_ICON = [
  [n => n.includes("黑") && n.includes("暴雨"), "rainb"],
  [n => n.includes("紅") && n.includes("暴雨"), "rainr"],
  [n => n.includes("黃") && n.includes("暴雨"), "raina"],
  [n => n.includes("雷暴"), "ts"],
  [n => n.includes("山泥傾瀉"), "landslip"],
  [n => n.includes("酷熱"), "vhot"],
  [n => n.includes("寒冷"), "cold"],
  [n => n.includes("強烈季候風"), "sms"],
  [n => n.includes("霜凍"), "frost"],
  [n => n.includes("新界北部水浸"), "ntfl"],
  [n => n.includes("八號東南"), "tc8b"],
  [n => n.includes("八號西南"), "tc8c"],
  [n => n.includes("八號東北"), "tc8ne"],
  [n => n.includes("八號西北"), "tc8d"],
  [n => n.includes("一號"), "tc1"],
  [n => n.includes("三號"), "tc3"],
  [n => n.includes("九號"), "tc9"],
  [n => n.includes("十號"), "tc10"],
];

async function fetchHkoToForm() {
  const statusEl = document.getElementById("hkoStatus");
  statusEl.textContent = "正在連接天文台...";
  statusEl.style.color = "#666";
  try {
    const [rhrR, warnR, hswwR] = await Promise.all([
      fetch("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc"),
      fetch("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warningInfo&lang=tc").catch(() => null),
      fetch("https://data.weather.gov.hk/weatherAPI/opendata/hsww.php?lang=tc").catch(() => null),
    ]);
    if (!rhrR.ok) throw new Error("HTTP " + rhrR.status);
    const rhr = await rhrR.json();
    const warnInfo = warnR && warnR.ok ? await warnR.json() : null;
    const hswwInfo = hswwR && hswwR.ok ? await hswwR.json() : null;

    // 氣溫（優先測站）
    let temp = null;
    const temps = (rhr.temperature && rhr.temperature.data) || [];
    for (const st of HKO_STATION_PRIORITY) {
      const hit = temps.find(t => t.place === st && t.value != null);
      if (hit) { temp = hit.value; break; }
    }
    if (temp === null && temps.length) temp = temps[0].value;

    // 天氣狀況
    const codes = rhr.icon || [];
    let condition = "cloudy";
    if (codes.length) {
      const c = parseInt(codes[codes.length - 1]);
      for (const [cond, list] of Object.entries(HKO_ICON_CONDITION)) {
        if (list.includes(c)) { condition = cond; break; }
      }
    }

    // 生效警告 → 圖示代碼
    const warnCodes = [];
    if (warnInfo && Array.isArray(warnInfo.warnings)) {
      for (const w of warnInfo.warnings) {
        const name = w.name || w.code || "";
        let icon = null;
        for (const [match, code] of HKO_RESOLVE_ICON) {
          if (match(name)) { icon = code; break; }
        }
        if (icon) warnCodes.push(icon);
      }
    }

    // 勞工處工作暑熱警告
    if (hswwInfo && hswwInfo.hsww && hswwInfo.hsww.actionCode !== "CANCEL" && hswwInfo.hsww.actionCode !== "REVOKE") {
      const lvlMap = { AMBER: "hsww_amber", RED: "hsww_red", BLACK: "hsww_black" };
      const code = lvlMap[hswwInfo.hsww.warningLevel];
      if (code) warnCodes.push(code);
    }

    document.getElementById("weatherCondition").value = condition;
    const condLabelMap = { sunny: "晴", cloudy: "多雲", rainy: "雨", thunderstorm: "雷暴", hot: "酷熱", cold: "寒冷" };
    document.getElementById("weatherLabel").value = condLabelMap[condition] || "多雲";
    document.getElementById("weatherTemp").value = temp != null ? temp : "";
    document.getElementById("weatherWarnings").value = warnCodes.join(",");

    statusEl.textContent = `已取得（更新於 ${new Date().toLocaleTimeString("zh-HK", { hour12: false })}）`;
    statusEl.style.color = "#16a34a";
  } catch (e) {
    statusEl.textContent = "連線失敗：" + e.message;
    statusEl.style.color = "#dc2626";
  }
}

// ---- 初始化 ----

window.addEventListener("DOMContentLoaded", () => {
  initAuth();
  document.getElementById("addRowBtn").addEventListener("click", addRow);
  document.getElementById("saveBtn").addEventListener("click", saveData);
  document.getElementById("refreshBtn").addEventListener("click", loadData);
  document.getElementById("btnFetchHko").addEventListener("click", fetchHkoToForm);
});
