// ============================================================
// 線上版 admin.js — 直接用 GitHub Contents API 更新 data.json
// ============================================================

const REPO_OWNER = "yingdarrenzheng";
const REPO_NAME = "flood-control-led";
const DATA_PATH = "data/data.json";
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_PATH}`;

let appData = null;
let fileSha = null;
let pat = localStorage.getItem("gh_pat") || "";

// ---- 認證 ----

function initAuth() {
  if (pat) {
    document.getElementById("patInput").value = pat;
    verifyToken();
  }
  document.getElementById("loginBtn").addEventListener("click", () => {
    pat = document.getElementById("patInput").value.trim();
    if (!pat) { showLoginStatus("請輸入 Token", "err"); return; }
    localStorage.setItem("gh_pat", pat);
    verifyToken();
  });
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("gh_pat");
    pat = "";
    location.reload();
  });
}

async function verifyToken() {
  showLoginStatus("驗證中...", "info");
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, {
      headers: { "Authorization": `Bearer ${pat}`, "Accept": "application/vnd.github+json" }
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    showLoginStatus("已登入，可編輯工序", "ok");
    document.getElementById("editorSection").style.display = "block";
    document.getElementById("logoutBtn").style.display = "inline-flex";
    document.getElementById("loginBtn").style.display = "none";
    document.getElementById("patInput").style.display = "none";
    loadData();
  } catch (e) {
    showLoginStatus(`認證失敗：${e.message}`, "err");
    localStorage.removeItem("gh_pat");
    pat = "";
  }
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
    const gr = await fetch(API_BASE, {
      headers: { "Authorization": `Bearer ${pat}`, "Accept": "application/vnd.github+json" }
    });
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
    return icon.replace("static/images/warnings/", "").replace(".gif", "");
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
  const warnStr = document.getElementById("weatherWarnings").value.trim();
  const warnCodes = warnStr ? warnStr.split(",").map(s => s.trim()).filter(Boolean) : [];
  const warnings = warnCodes.map(code => ({
    name: code,
    icon: `static/images/warnings/${code}.gif`
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
    const gr = await fetch(API_BASE, {
      headers: { "Authorization": `Bearer ${pat}`, "Accept": "application/vnd.github+json" }
    });
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
      headers: {
        "Authorization": `Bearer ${pat}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
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

// ---- 初始化 ----

window.addEventListener("DOMContentLoaded", () => {
  initAuth();
  document.getElementById("addRowBtn").addEventListener("click", addRow);
  document.getElementById("saveBtn").addEventListener("click", saveData);
  document.getElementById("refreshBtn").addEventListener("click", loadData);
});
