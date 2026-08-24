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
  document.getElementById("logoutBtn").addEventListener("click", doLogout);
}

function doLogout() {
  // 直接切換回登入畫面，不依賴 location.reload()，
  // 避免部分瀏覽器/嵌入式環境下重新整理後仍停留在編輯狀態。
  try { sessionStorage.removeItem("admin_ok"); } catch (e) {}
  const ed = document.getElementById("editorSection");
  const lg = document.getElementById("loginSection");
  if (ed) ed.style.display = "none";
  if (lg) lg.style.display = "block";
  document.getElementById("logoutBtn").style.display = "none";
  document.getElementById("loginBtn").style.display = "inline-flex";
  document.getElementById("userInput").style.display = "inline-flex";
  document.getElementById("passInput").style.display = "inline-flex";
  if (document.getElementById("userInput")) document.getElementById("userInput").value = "";
  if (document.getElementById("passInput")) document.getElementById("passInput").value = "";
  showLoginStatus("已登出", "info");
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

// 經 GitHub API 取得 data.json（公開倉無需令牌；即時、無 Pages 建置延遲）
// 作為 raw.githubusercontent.com 的第二級回退，避免回退到本地陳舊靜態檔造成不同步。
async function fetchApiDataJson() {
  const r = await fetch(API_BASE, { headers: Object.assign(patHeaders(), { "Accept": "application/vnd.github+json" }) });
  if (!r.ok) throw new Error("GitHub API HTTP " + r.status);
  const info = await r.json();
  return JSON.parse(decodeURIComponent(escape(atob(info.content.replace(/\s/g, "")))));
}

// ---- 載入資料 ----

async function loadData() {
  try {
    let loaded = null;
    let source = "";
    // 1) 優先 raw.githubusercontent.com（即時、無 Pages 建置延遲）
    try {
      const r = await fetch("https://raw.githubusercontent.com/yingdarrenzheng/flood-control-led/main/data/data.json?t=" + Date.now());
      if (r.ok) { loaded = await r.json(); source = "raw"; }
    } catch (e) {}
    // 2) 次選 GitHub API（公開倉無需令牌，即時反映最新提交）
    if (!loaded) {
      try { loaded = await fetchApiDataJson(); source = "api"; } catch (e) {}
    }
    // 3) 最後才用本地靜態檔（僅離線兜底，可能陳舊）
    if (!loaded) {
      const r = await fetch("data/data.json?t=" + Date.now());
      if (!r.ok) throw new Error("HTTP " + r.status);
      loaded = await r.json(); source = "local";
    }
    appData = loaded;
    migrateOldFormat();
    fillForm();
    renderRows();
    renderHistory();
    showStatus(
      source === "local" ? "已載入本地副本（離線，可能未與線上同步）" : "資料已載入（線上最新）",
      source === "local" ? "info" : "ok"
    );
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
  if (!appData.rows) appData.rows = [];
  if (!appData.history) appData.history = [];
  (appData.rows || []).forEach(row => {
    if (row.id == null) row.id = Date.now() + Math.floor(Math.random() * 1000);
    if (!row.operations) {
      row.operations = (row.operation != null && row.operation !== "")
        ? [{ text: row.operation, riskType: row.riskType || "high" }]
        : [];
      delete row.operation;
      delete row.riskType;
    }
    // 舊格式 timeSlot 字串 → 新格式 morning/afternoon 布林
    if (row.timeSlot != null) {
      row.morning = (row.timeSlot === "上午" || row.timeSlot === "上午/下午");
      row.afternoon = (row.timeSlot === "下午" || row.timeSlot === "上午/下午");
      delete row.timeSlot;
    } else {
      if (row.morning == null) row.morning = false;
      if (row.afternoon == null) row.afternoon = false;
    }
  });
}

function fillForm() {
  document.getElementById("contractNo").value = appData.contractNo || "";
  document.getElementById("projectName").value = appData.projectName || "";
  document.getElementById("title").value = appData.title || "";
}

// ---- 工序列表渲染 ----

// 將目前 DOM 表格中的輸入值寫回 appData.rows（避免新增/刪除列時遺失已輸入內容）
function syncFromDom() {
  const trs = document.querySelectorAll("#rowsBody tr[data-index]");
  const synced = [];
  trs.forEach(tr => {
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
    // 以 id（data-id）對應回原有 row，保留 id；否則新增值
    const existingId = tr.dataset.id ? Number(tr.dataset.id) : null;
    const orig = (existingId != null) ? appData.rows.find(r => r.id === existingId) : null;
    const morningEl = tr.querySelector('[data-field="morning"]');
    const afternoonEl = tr.querySelector('[data-field="afternoon"]');
    synced.push({
      id: orig ? orig.id : (existingId != null ? existingId : Date.now() + Math.floor(Math.random() * 1000)),
      zone: get("zone"),
      morning: morningEl ? morningEl.checked : false,
      afternoon: afternoonEl ? afternoonEl.checked : false,
      operations: operations,
      safetyMeasures: get("safetyMeasures"),
      subcontractor: get("subcontractor")
    });
  });
  appData.rows = synced;
}

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
    tr.dataset.id = row.id != null ? row.id : "";
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
        <div class="slot-checks">
          <label class="slot-check"><input type="checkbox" data-field="morning" ${row.morning ? "checked" : ""}>上午</label>
          <label class="slot-check"><input type="checkbox" data-field="afternoon" ${row.afternoon ? "checked" : ""}>下午</label>
        </div>
      </td>
      <td class="col-action">
        <button class="btn btn-secondary btn-to-history" title="存入歷史">⬇ 歷史</button>
        <button class="btn btn-danger btn-del-row">刪除</button>
      </td>
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
    tr.querySelector(".btn-to-history").addEventListener("click", () => moveRowToHistory(idx));
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
  syncFromDom();          // 先將現有輸入寫回 appData，避免遺失
  appData.rows.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    zone: "",
    morning: true,
    afternoon: false,
    operations: [{ text: "", riskType: "high" }],
    safetyMeasures: "",
    subcontractor: ""
  });
  renderRows();
}

function deleteRow(idx) {
  syncFromDom();
  appData.rows.splice(idx, 1);
  renderRows();
}

// ---- 工序歷史 ----
// 結構：appData.history = [ { id, savedAt, row: {...} }, ... ]

function moveRowToHistory(idx) {
  syncFromDom();
  const row = appData.rows[idx];
  if (!row) return;
  if (!appData.history) appData.history = [];
  appData.history.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    savedAt: new Date().toISOString(),
    row: row
  });
  appData.rows.splice(idx, 1);
  renderRows();
  renderHistory();
  showStatus("已存入工序歷史（尚未儲存，請按「儲存並更新看板」）", "info");
}

function insertHistoryItem(hid) {
  syncFromDom();
  if (!appData.history) appData.history = [];
  const hi = appData.history.find(h => h.id === hid);
  if (!hi) return;
  const clone = JSON.parse(JSON.stringify(hi.row));
  clone.id = Date.now() + Math.floor(Math.random() * 1000);
  appData.rows.push(clone);
  renderRows();
  showStatus("已從歷史插入工序（尚未儲存，請按「儲存並更新看板」）", "info");
}

function deleteHistoryItem(hid) {
  if (!appData.history) return;
  appData.history = appData.history.filter(h => h.id !== hid);
  renderHistory();
  showStatus("已刪除一筆歷史工序（尚未儲存，請按「儲存並更新看板」）", "info");
}

function renderHistory() {
  const box = document.getElementById("historyBox");
  if (!box) return;
  const list = appData.history || [];
  if (list.length === 0) {
    box.innerHTML = `<p class="empty-hint">暫無工序歷史。在工序列表中按「⬇ 歷史」可將工序存入此處備用。</p>`;
    return;
  }
  box.innerHTML = "";
  list.forEach(h => {
    const r = h.row || {};
    const ops = (r.operations || []).map(o => (o.riskType === "special" ? "【特別高危】" : "【高危】") + (o.text || "")).join("；") || "（無工序內容）";
    const slotText = slotLabel(r);
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <div class="history-info">
        <div class="history-meta">${escapeAttr(r.zone || "（未填區域）")} · ${escapeAttr(slotText)} · ${escapeAttr(r.subcontractor || "")} · 存入於 ${new Date(h.savedAt).toLocaleString("zh-HK")}</div>
        <div class="history-ops">${escapeAttr(ops)}</div>
      </div>
      <div class="history-actions">
        <button class="btn btn-primary btn-insert-history">插入</button>
        <button class="btn btn-danger btn-del-history">刪除</button>
      </div>
    `;
    div.querySelector(".btn-insert-history").addEventListener("click", () => insertHistoryItem(h.id));
    div.querySelector(".btn-del-history").addEventListener("click", () => deleteHistoryItem(h.id));
    box.appendChild(div);
  });
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
    const morningEl = tr.querySelector('[data-field="morning"]');
    const afternoonEl = tr.querySelector('[data-field="afternoon"]');
    rows.push({
      id: (appData.rows[idx] && appData.rows[idx].id) || Date.now() + Math.random(),
      zone: get("zone"),
      morning: morningEl ? morningEl.checked : false,
      afternoon: afternoonEl ? afternoonEl.checked : false,
      operations: operations,
      safetyMeasures: get("safetyMeasures"),
      subcontractor: get("subcontractor")
    });
  });

  // liveWeather 保留看板自動即時連線天文台所寫回之最新值（後台不再人工填寫）
  const liveWeather = appData.liveWeather || {
    condition: "cloudy",
    conditionLabel: "多雲",
    source: "none",
    temperature: null,
    updateTime: new Date().toISOString(),
    warnings: []
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
    history: appData.history || [],
    liveWeather: liveWeather,
    lastUpdated: new Date().toISOString()
  };
}

async function saveData() {
  const payload = collectData();
  const jsonStr = JSON.stringify(payload, null, 2);
  const content = btoa(unescape(encodeURIComponent(jsonStr)));

  showStatus("正在推送到 GitHub...", "info");

  let lastErr = "未知錯誤";
  // 與看板自動寫回（saveWeatherToBoard）可能同時提交而產生 sha 衝突（409/422），
  // 故在每次嘗試前重新取得最新 sha 並重試，確保編輯與歷史刪除確實寫入。
  for (let attempt = 0; attempt < 4; attempt++) {
    // 每次嘗試前重新取得最新 sha（防止與看板自動寫回競爭）
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
      if (r.ok) {
        const result = await r.json();
        fileSha = result.content.sha;
        appData = payload;
        showStatus("已儲存！看板將即時同步更新。", "ok");
        // 通知同一瀏覽器中的看板即時刷新（無須等待 1-2 分鐘）
        try {
          const ch = new BroadcastChannel("flood-led-sync");
          ch.postMessage({ type: "data-updated", t: Date.now() });
        } catch (e) {}
        renderRows();
        renderHistory();
        return;
      }
      const errBody = await r.json().catch(() => ({}));
      lastErr = errBody.message || ("HTTP " + r.status);
      // 409/422 多為與看板自動寫回的 sha 衝突，稍後重試
      if (r.status === 409 || r.status === 422) {
        await new Promise(res => setTimeout(res, 1000));
        continue;
      }
      showStatus("儲存失敗：" + lastErr, "err");
      return;
    } catch (e) {
      lastErr = e.message;
      await new Promise(res => setTimeout(res, 1000));
    }
  }
  showStatus("儲存失敗（多次重試仍衝突）：" + lastErr, "err");
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

// 由 morning / afternoon 布林推算檢查時段顯示文字
function slotLabel(r) {
  const m = !!(r && r.morning);
  const a = !!(r && r.afternoon);
  if (m && a) return "上午/下午";
  if (m) return "上午";
  if (a) return "下午";
  return "";
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

// HKO 官方天氣符號代號 → 標籤（與看板 display.js 一致，供即時連線檢查顯示）
const HKO_ICON_LABEL = {
  50: "晴", 51: "大致晴朗", 52: "天晴", 53: "短暫陽光", 54: "短暫陽光有驟雨",
  55: "日間短暫時間有陽光", 56: "短暫時間有陽光", 57: "天晴，有一兩陣驟雨",
  58: "天晴，有幾陣驟雨", 59: "天晴，有雨", 60: "短暫陽光", 61: "有幾陣驟雨",
  62: "有微雨", 63: "有雨", 64: "有雷暴", 65: "有雨", 66: "有雨", 67: "有毛毛雨",
  68: "有微雨", 69: "有雨", 70: "雷暴", 71: "局部地區有雷暴", 72: "有幾陣雷暴",
  73: "有雷暴及驟雨", 80: "多雲", 81: "大致多雲", 82: "煙霞", 83: "薄霧",
  84: "乾燥", 85: "吹東北風", 86: "吹東風", 87: "吹東南風", 88: "吹西南風",
  89: "吹西北風", 90: "寒冷", 91: "酷熱", 92: "極酷熱", 93: "有霧", 94: "有霾", 99: "天氣不穩定"
};

// 即時連線檢查：抓取香港天文台（現時天氣 + 生效警告）及勞工處（工作暑熱警告），
// 以唯讀方式顯示當前數值，供確認連線正常、資料與天文台一致。
async function fetchHkoToForm() {
  const statusEl = document.getElementById("hkoStatus");
  const infoEl = document.getElementById("hkoLiveInfo");
  statusEl.textContent = "正在連接天文台 / 勞工處...";
  statusEl.style.color = "#666";
  const t0 = Date.now();
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
    const elapsed = Date.now() - t0;

    // 氣溫（優先測站）
    let temp = null, tempPlace = "";
    const temps = (rhr.temperature && rhr.temperature.data) || [];
    for (const st of HKO_STATION_PRIORITY) {
      const hit = temps.find(t => t.place === st && t.value != null);
      if (hit) { temp = hit.value; tempPlace = hit.place; break; }
    }
    if (temp === null && temps.length) { temp = temps[0].value; tempPlace = temps[0].place; }

    // 天氣狀況標籤
    const codes = rhr.icon || [];
    let condLabel = "多雲";
    if (codes.length) {
      const c = parseInt(codes[codes.length - 1]);
      condLabel = HKO_ICON_LABEL[c] || "多雲";
    }

    // 生效警告（天文台 warningInfo.details，含人類可讀描述）
    const warnList = [];
    if (warnInfo && Array.isArray(warnInfo.details)) {
      for (const det of warnInfo.details) {
        const name = (det.contents && det.contents[0]) || det.warningStatementCode || "（警告）";
        warnList.push(name);
      }
    } else if (warnInfo && Array.isArray(warnInfo.warnings)) {
      for (const w of warnInfo.warnings) warnList.push(w.name || w.code || "（警告）");
    }

    // 勞工處工作暑熱警告
    let hswwLabel = "無";
    if (hswwInfo && hswwInfo.hsww && hswwInfo.hsww.actionCode !== "CANCEL" && hswwInfo.hsww.actionCode !== "REVOKE") {
      const lvlMap = { AMBER: "黃色工作暑熱警告", RED: "紅色工作暑熱警告", BLACK: "黑色工作暑熱警告" };
      hswwLabel = lvlMap[hswwInfo.hsww.warningLevel] || "工作暑熱警告（生效）";
    }

    infoEl.style.display = "block";
    infoEl.innerHTML = `
      <div class="hko-row"><span class="hko-k">連線狀態</span><span class="hko-v ok">正常（即時，耗時 ${elapsed}ms）</span></div>
      <div class="hko-row"><span class="hko-k">更新時間</span><span class="hko-v">${new Date().toLocaleString("zh-HK", { hour12: false })}</span></div>
      <div class="hko-row"><span class="hko-k">氣溫</span><span class="hko-v">${temp != null ? temp : "--"}°C${tempPlace ? "（" + escapeAttr(tempPlace) + "）" : ""}</span></div>
      <div class="hko-row"><span class="hko-k">天氣狀況</span><span class="hko-v">${escapeAttr(condLabel)}${codes.length ? "（icon " + escapeAttr(String(codes[codes.length - 1])) + "）" : ""}</span></div>
      <div class="hko-row"><span class="hko-k">天文台生效警告</span><span class="hko-v">${warnList.length ? escapeAttr(warnList.join("；")) : "無"}</span></div>
      <div class="hko-row"><span class="hko-k">勞工處工作暑熱警告</span><span class="hko-v">${escapeAttr(hswwLabel)}</span></div>
    `;

    statusEl.textContent = `連線正常，即時資料已取得（${elapsed}ms）`;
    statusEl.style.color = "#16a34a";
  } catch (e) {
    infoEl.style.display = "block";
    infoEl.innerHTML = `<div class="hko-row"><span class="hko-k">連線狀態</span><span class="hko-v err">失敗：${escapeAttr(e.message)}</span></div>`;
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
