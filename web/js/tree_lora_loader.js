import { app } from "/scripts/app.js";

const STYLE_ID = "hier-lora-editor-style";

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.hl-editor-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hl-editor-panel {
  width: min(1200px, 92vw);
  height: min(780px, 86vh);
  background: #111318;
  border: 1px solid #2a3142;
  border-radius: 10px;
  color: #d4d7df;
  display: flex;
  flex-direction: column;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
}
.hl-editor-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid #2a3142;
}
.hl-editor-title {
  font-size: 16px;
  font-weight: 600;
}
.hl-editor-sub {
  font-size: 12px;
  opacity: 0.75;
}
.hl-editor-actions {
  display: flex;
  gap: 8px;
}
.hl-btn {
  background: #1a2030;
  border: 1px solid #394664;
  color: #d4d7df;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
}
.hl-btn:hover {
  background: #232c42;
}
.hl-editor-list {
  flex: 1;
  overflow: auto;
  padding: 10px 14px 14px 14px;
}
.hl-row {
  display: grid;
  grid-template-columns: 1fr 300px 78px 72px 90px;
  gap: 10px;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  border-left: 3px solid #2d3853;
  background: rgba(255, 255, 255, 0.01);
}
.hl-name-wrap {
  display: flex;
  align-items: center;
  min-width: 0;
}
.hl-toggle {
  width: 18px;
  height: 18px;
  border: 0;
  background: transparent;
  color: #b0b7c8;
  cursor: pointer;
  padding: 0;
  margin-right: 6px;
}
.hl-leaf-pad {
  width: 18px;
  margin-right: 6px;
}
.hl-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hl-slider {
  width: 100%;
}
.hl-slider-wrap {
  width: 100%;
}
.hl-num {
  width: 100%;
  box-sizing: border-box;
  background: #0f131d;
  color: #d4d7df;
  border: 1px solid #38425b;
  border-radius: 4px;
  padding: 4px 6px;
}
.hl-curve-btn {
  width: 100%;
  background: #121827;
  border: 1px solid #38425b;
  color: #cbd5e1;
  border-radius: 4px;
  padding: 5px 6px;
  cursor: pointer;
  font-size: 12px;
}
.hl-curve-btn.is-active {
  background: #1c2540;
  font-weight: 600;
}
.hl-eff {
  font-size: 12px;
  color: #9aa6bf;
  text-align: right;
}
.hl-editor-foot {
  border-top: 1px solid #2a3142;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hl-muted {
  font-size: 12px;
  color: #9aa6bf;
}
.hl-curve-panel {
  width: min(480px, 92vw);
  background: #111318;
  border: 1px solid #2a3142;
  border-radius: 10px;
  color: #d4d7df;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
}
.hl-curve-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.hl-curve-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hl-curve-field label {
  font-size: 12px;
  color: #9aa6bf;
}
.hl-select {
  width: 100%;
  box-sizing: border-box;
  background: #0f131d;
  color: #d4d7df;
  border: 1px solid #38425b;
  border-radius: 4px;
  padding: 6px 8px;
}
.hl-checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.hl-preview-wrap {
  position: relative;
}
.hl-preview-svg {
  width: 100%;
  height: 160px;
  background: #0f131d;
  border: 1px solid #38425b;
  border-radius: 6px;
  display: block;
  cursor: crosshair;
}
  `;
  document.head.appendChild(style);
}


const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

function naturalCompare(a, b) {
  return NATURAL_COLLATOR.compare(String(a), String(b));
}

function naturalSort(values) {
  return values.sort(naturalCompare);
}

function safeParseJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

function normPath(raw) {
  return String(raw || "")
    .split("/")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .join("/");
}

function defaultCurve() {
  return {
    enabled: true,
    points: [
      { x: 0.0, y: 1.0 },
      { x: 1.0, y: 1.0 },
    ],
  };
}

function normalizeCurvePoints(points) {
  const normalized = [];
  for (const point of points || []) {
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    normalized.push({
      x: Math.max(0, Math.min(1, x)),
      y,
    });
  }
  normalized.sort((a, b) => a.x - b.x);
  if (normalized.length === 0) return defaultCurve().points.map((p) => ({ ...p }));
  if (normalized[0].x !== 0) normalized.unshift({ x: 0.0, y: normalized[0].y });
  if (normalized[normalized.length - 1].x !== 1) normalized.push({ x: 1.0, y: normalized[normalized.length - 1].y });

  const deduped = [];
  for (const point of normalized) {
    if (deduped.length && Math.abs(deduped[deduped.length - 1].x - point.x) < 1e-6) {
      deduped[deduped.length - 1] = point;
    } else {
      deduped.push(point);
    }
  }
  return deduped;
}

function valueFromPoints(points, percent) {
  const normalized = normalizeCurvePoints(points);
  if (percent < normalized[0].x || percent > normalized[normalized.length - 1].x) return 0.0;
  if (percent <= normalized[0].x) return normalized[0].y;
  if (percent >= normalized[normalized.length - 1].x) return normalized[normalized.length - 1].y;
  for (let i = 0; i < normalized.length - 1; i += 1) {
    const p1 = normalized[i];
    const p2 = normalized[i + 1];
    if (percent >= p1.x && percent <= p2.x) {
      const span = p2.x - p1.x;
      if (span === 0) return p1.y;
      const localT = (percent - p1.x) / span;
      return p1.y * (1 - localT) + p2.y * localT;
    }
  }
  return 0.0;
}

function createNode(name) {
  return { name, local: 1.0, effective: 1.0, curve: null, children: {} };
}

function buildTreeFromPaths(paths) {
  const root = createNode("ROOT");
  for (const rawPath of paths || []) {
    const parts = normPath(rawPath).split("/").filter(Boolean);
    let node = root;
    for (const part of parts) {
      if (!node.children[part]) node.children[part] = createNode(part);
      node = node.children[part];
    }
  }
  return root;
}

function applyConfigRec(node, conf) {
  if (typeof conf === "number") {
    node.local = Number.isFinite(conf) ? conf : 1.0;
    return;
  }
  if (!conf || typeof conf !== "object") return;

  const valueRaw = conf._value ?? conf.value ?? conf.strength;
  if (typeof valueRaw === "number" && Number.isFinite(valueRaw)) {
    node.local = valueRaw;
  }
  if (conf._curve && typeof conf._curve === "object") {
    if (Array.isArray(conf._curve.points)) {
      node.curve = {
        enabled: !!conf._curve.enabled,
        points: normalizeCurvePoints(conf._curve.points),
      };
    } else {
      node.curve = {
        enabled: !!conf._curve.enabled,
        points: normalizeCurvePoints([
          { x: Number(conf._curve.start_percent ?? 0.0), y: Number(conf._curve.start_multiplier ?? 1.0) },
          { x: Number(conf._curve.end_percent ?? 1.0), y: Number(conf._curve.end_multiplier ?? 1.0) },
        ]),
      };
    }
  }

  const applyChild = (key, value) => {
    const childName = String(key).toUpperCase();
    if (!node.children[childName]) node.children[childName] = createNode(childName);
    applyConfigRec(node.children[childName], value);
  };

  if (conf.children && typeof conf.children === "object") {
    for (const [k, v] of Object.entries(conf.children)) applyChild(k, v);
  }
  for (const [k, v] of Object.entries(conf)) {
    if (k === "_value" || k === "value" || k === "strength" || k === "children" || k === "_curve") continue;
    applyChild(k, v);
  }
}

function applyConfigToTree(root, configObj) {
  if (!configObj || typeof configObj !== "object") return;
  for (const [k, v] of Object.entries(configObj)) {
    const top = String(k).toUpperCase();
    if (!root.children[top]) root.children[top] = createNode(top);
    applyConfigRec(root.children[top], v);
  }
}

function curveMultiplier(curve, percent) {
  if (!curve || !curve.enabled) return 1.0;
  if (Array.isArray(curve.points) && curve.points.length > 0) {
    return valueFromPoints(curve.points, percent);
  }
  return 1.0;
}

function recomputeEffective(root) {
  const walk = (node, parentEff) => {
    const currentMultiplier = curveMultiplier(node.curve, 0.0);
    node.effective = parentEff * node.local * currentMultiplier;
    for (const child of Object.values(node.children)) walk(child, node.effective);
  };
  for (const child of Object.values(root.children)) walk(child, 1.0);
}

function exportNodeChanged(node) {
  const obj = {};
  const childNames = naturalSort(Object.keys(node.children));
  for (const childName of childNames) {
    const childExport = exportNodeChanged(node.children[childName]);
    if (childExport !== null) obj[childName] = childExport;
  }

  const localChanged = Math.abs(node.local - 1.0) > 1e-9;
  const curveChanged = !!(node.curve && node.curve.enabled);
  if (localChanged) obj._value = Number(node.local.toFixed(6));
  if (curveChanged) {
    obj._curve = {
      enabled: true,
      points: normalizeCurvePoints(node.curve.points || []).map((point) => ({
        x: Number(point.x.toFixed(6)),
        y: Number(point.y.toFixed(6)),
      })),
    };
  }
  if (!localChanged && !curveChanged && Object.keys(obj).length === 0) return null;
  return obj;
}

function exportChanged(node) {
  const out = {};
  const childNames = naturalSort(Object.keys(node.children));
  for (const name of childNames) {
    const exported = exportNodeChanged(node.children[name]);
    if (exported !== null) out[name] = exported;
  }
  return out;
}

function countChanged(node) {
  let count = 0;
  const walk = (current) => {
    if (Math.abs(current.local - 1.0) > 1e-9 || (current.curve && current.curve.enabled)) {
      count += 1;
    }
    for (const child of Object.values(current.children)) walk(child);
  };
  for (const child of Object.values(node.children)) walk(child);
  return count;
}

function buildStructureSignature(paths) {
  const norm = (paths || []).map((p) => normPath(p)).filter(Boolean).sort(naturalCompare);
  let hash = 0x811c9dc5;
  for (const path of norm) {
    for (let i = 0; i < path.length; i += 1) {
      hash ^= path.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 47;
    hash = Math.imul(hash, 0x01000193);
  }
  return `${norm.length}:${(hash >>> 0).toString(16)}`;
}

async function fetchLoraTreePaths(loraName) {
  const resp = await fetch(`/hierarchical_lora_loader/tree?lora_name=${encodeURIComponent(loraName)}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!resp.ok) {
    let errText = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      if (body?.error) errText = body.error;
    } catch {}
    throw new Error(errText);
  }
  const payload = await resp.json();
  return payload.tree_paths || [];
}

function openCurveEditor({ row, rowColor, onApply }) {
  ensureStyle();
  const curve = row.nodeRef.curve
    ? { enabled: !!row.nodeRef.curve.enabled, points: normalizeCurvePoints(row.nodeRef.curve.points || []) }
    : defaultCurve();

  const backdrop = document.createElement("div");
  backdrop.className = "hl-editor-backdrop";
  const panel = document.createElement("div");
  panel.className = "hl-curve-panel";
  backdrop.appendChild(panel);

  panel.innerHTML = `
    <div class="hl-editor-title">Curve Settings</div>
    <div class="hl-editor-sub">${row.path}</div>
    <label class="hl-checkbox"><input type="checkbox" data-role="enabled"> Enable step curve</label>
    <div class="hl-curve-field">
      <label>Preview</label>
      <div class="hl-preview-wrap">
        <svg class="hl-preview-svg" data-role="preview" viewBox="0 0 360 160" preserveAspectRatio="none"></svg>
      </div>
    </div>
    <div class="hl-editor-actions" style="justify-content:flex-start;">
      <button class="hl-btn" data-act="add-point">Add Point</button>
      <div class="hl-muted">Drag points in the preview. Double-click curve to add a point.</div>
    </div>
    <div class="hl-curve-field">
      <label>Points</label>
      <div data-role="points"></div>
    </div>
    <div class="hl-editor-actions" style="justify-content:flex-end;">
      <button class="hl-btn" data-act="clear">Remove Curve</button>
      <button class="hl-btn" data-act="cancel">Cancel</button>
      <button class="hl-btn" data-act="apply" style="border-color:${rowColor}; color:${rowColor};">Apply</button>
    </div>
  `;

  const enabledEl = panel.querySelector('[data-role="enabled"]');
  const pointsEl = panel.querySelector('[data-role="points"]');
  const previewEl = panel.querySelector('[data-role="preview"]');

  enabledEl.checked = !!curve.enabled;
  let points = normalizeCurvePoints(curve.points || []);
  let dragIndex = -1;
  let isDragging = false;
  const previewMetrics = {
    width: 360,
    height: 160,
    left: 18,
    right: 8,
    top: 8,
    bottom: 18,
  };

  const getPreviewBounds = () => {
    const { width, height, left, right, top, bottom } = previewMetrics;
    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      plotW: width - left - right,
      plotH: height - top - bottom,
    };
  };

  const getYRange = (normalized) => {
    const yValues = normalized.map((p) => p.y);
    const minY = Math.min(...yValues, 0);
    const maxY = Math.max(...yValues, 1);
    const rangeY = maxY - minY || 1;
    return { minY, maxY, rangeY };
  };

  const worldToScreen = (point, normalized) => {
    const bounds = getPreviewBounds();
    const { minY, rangeY } = getYRange(normalized);
    return {
      x: bounds.left + point.x * bounds.plotW,
      y: bounds.top + (1 - (point.y - minY) / rangeY) * bounds.plotH,
    };
  };

  const screenToWorld = (clientX, clientY, normalized) => {
    const rect = previewEl.getBoundingClientRect();
    const bounds = getPreviewBounds();
    const { minY, rangeY } = getYRange(normalized);
    const localX = ((clientX - rect.left) / rect.width) * bounds.width;
    const localY = ((clientY - rect.top) / rect.height) * bounds.height;
    const x = (localX - bounds.left) / bounds.plotW;
    const y = minY + (1 - (localY - bounds.top) / bounds.plotH) * rangeY;
    return {
      x: Math.max(0, Math.min(1, x)),
      y,
    };
  };

  const findPointAtClientPos = (clientX, clientY) => {
    const normalized = normalizeCurvePoints(points);
    for (let i = 0; i < normalized.length; i += 1) {
      const screen = worldToScreen(normalized[i], normalized);
      const rect = previewEl.getBoundingClientRect();
      const px = rect.left + (screen.x / previewMetrics.width) * rect.width;
      const py = rect.top + (screen.y / previewMetrics.height) * rect.height;
      const dx = clientX - px;
      const dy = clientY - py;
      if ((dx * dx) + (dy * dy) <= 100) {
        return i;
      }
    }
    return -1;
  };

  const renderPreview = () => {
    const normalized = normalizeCurvePoints(points);
    const bounds = getPreviewBounds();
    const { minY, rangeY } = getYRange(normalized);
    const path = normalized
      .map((p, index) => {
        const sx = bounds.left + p.x * bounds.plotW;
        const sy = bounds.top + (1 - (p.y - minY) / rangeY) * bounds.plotH;
        return `${index === 0 ? "M" : "L"} ${sx.toFixed(2)} ${sy.toFixed(2)}`;
      })
      .join(" ");
    const circles = normalized
      .map((p, index) => {
        const sx = bounds.left + p.x * bounds.plotW;
        const sy = bounds.top + (1 - (p.y - minY) / rangeY) * bounds.plotH;
        const stroke = index === dragIndex ? "#ffffff" : rowColor;
        const radius = index === dragIndex ? 5.5 : 4;
        return `<circle cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="${radius}" fill="${rowColor}" stroke="${stroke}" stroke-width="1.5" />`;
      })
      .join("");
    previewEl.innerHTML = `
      <path d="${path}" fill="none" stroke="${rowColor}" stroke-width="2.5" />
      ${circles}
      <line x1="${bounds.left}" y1="${bounds.top + bounds.plotH}" x2="${bounds.left + bounds.plotW}" y2="${bounds.top + bounds.plotH}" stroke="#4b5563" stroke-width="1" />
      <line x1="${bounds.left}" y1="${bounds.top}" x2="${bounds.left}" y2="${bounds.top + bounds.plotH}" stroke="#4b5563" stroke-width="1" />
    `;
  };

  const renderPoints = () => {
    points = normalizeCurvePoints(points);
    pointsEl.innerHTML = "";
    points.forEach((point, index) => {
      const rowEl = document.createElement("div");
      rowEl.className = "hl-curve-grid";
      rowEl.style.marginBottom = "8px";
      rowEl.innerHTML = `
        <div class="hl-curve-field">
          <label>X (${index === 0 ? "start" : index === points.length - 1 ? "end" : "point"})</label>
          <input class="hl-num" type="number" min="0" max="1" step="0.01" data-role="x" value="${point.x}">
        </div>
        <div class="hl-curve-field">
          <label>Y</label>
          <input class="hl-num" type="number" min="-10" max="10" step="0.01" data-role="y" value="${point.y}">
        </div>
      `;
      const xEl = rowEl.querySelector('[data-role="x"]');
      const yEl = rowEl.querySelector('[data-role="y"]');
      if (index === 0 || index === points.length - 1) {
        xEl.disabled = true;
      }
      xEl.onchange = () => {
        points[index].x = Number(xEl.value);
        renderPoints();
        renderPreview();
      };
      yEl.onchange = () => {
        points[index].y = Number(yEl.value);
        renderPreview();
      };
      if (index !== 0 && index !== points.length - 1) {
        const removeBtn = document.createElement("button");
        removeBtn.className = "hl-btn";
        removeBtn.textContent = "Remove";
        removeBtn.style.marginTop = "22px";
        removeBtn.onclick = () => {
          points.splice(index, 1);
          renderPoints();
          renderPreview();
        };
        rowEl.appendChild(removeBtn);
      }
      pointsEl.appendChild(rowEl);
    });
  };

  renderPoints();
  renderPreview();

  previewEl.addEventListener("mousedown", (ev) => {
    const hit = findPointAtClientPos(ev.clientX, ev.clientY);
    if (hit < 0) return;
    dragIndex = hit;
    isDragging = true;
    renderPreview();
    ev.preventDefault();
  });

  const onMouseMove = (ev) => {
    if (!isDragging || dragIndex < 0) return;
    const normalized = normalizeCurvePoints(points);
    const world = screenToWorld(ev.clientX, ev.clientY, normalized);
    const point = points[dragIndex];
    if (!point) return;
    if (dragIndex === 0) {
      point.x = 0;
    } else if (dragIndex === points.length - 1) {
      point.x = 1;
    } else {
      const prevX = points[dragIndex - 1].x + 0.001;
      const nextX = points[dragIndex + 1].x - 0.001;
      point.x = Math.max(prevX, Math.min(nextX, world.x));
    }
    point.y = world.y;
    renderPoints();
    renderPreview();
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    dragIndex = -1;
    renderPreview();
  };

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  previewEl.addEventListener("dblclick", (ev) => {
    const normalized = normalizeCurvePoints(points);
    const world = screenToWorld(ev.clientX, ev.clientY, normalized);
    points.push({ x: world.x, y: world.y });
    renderPoints();
    renderPreview();
  });

  const close = () => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    backdrop.remove();
  };

  panel.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    if (act === "cancel") {
      close();
      return;
    }
    if (act === "clear") {
      onApply(null);
      close();
      return;
    }
    if (act === "add-point") {
      const normalized = normalizeCurvePoints(points);
      let insertX = 0.5;
      let insertY = valueFromPoints(normalized, insertX);
      if (normalized.length >= 2) {
        let widestIndex = 0;
        let widestSpan = -1;
        for (let i = 0; i < normalized.length - 1; i += 1) {
          const span = normalized[i + 1].x - normalized[i].x;
          if (span > widestSpan) {
            widestSpan = span;
            widestIndex = i;
          }
        }
        insertX = Number(((normalized[widestIndex].x + normalized[widestIndex + 1].x) / 2).toFixed(4));
        insertY = Number(valueFromPoints(normalized, insertX).toFixed(4));
      }
      points.push({ x: insertX, y: insertY });
      renderPoints();
      renderPreview();
      return;
    }
    if (act === "apply") {
      const next = {
        enabled: !!enabledEl.checked,
        points: normalizeCurvePoints(points).map((point) => ({
          x: Number(point.x.toFixed(6)),
          y: Number(point.y.toFixed(6)),
        })),
      };
      onApply(next);
      close();
    }
  });

  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) close();
  });

  document.body.appendChild(backdrop);
}

function openEditor({ node, treeRoot, onApply, initialExpandedPaths = [], onEditorStateSave }) {
  ensureStyle();
  const expanded = new Set();

  const backdrop = document.createElement("div");
  backdrop.className = "hl-editor-backdrop";
  const panel = document.createElement("div");
  panel.className = "hl-editor-panel";
  backdrop.appendChild(panel);

  const head = document.createElement("div");
  head.className = "hl-editor-head";
  head.innerHTML = `
    <div>
      <div class="hl-editor-title">Hierarchical LoRA Block Editor</div>
      <div class="hl-editor-sub">Node: ${node.title || "Hierarchical LoRA Loader"}</div>
    </div>
    <div class="hl-editor-actions">
      <button class="hl-btn" data-act="expand">Expand All</button>
      <button class="hl-btn" data-act="collapse">Collapse All</button>
      <button class="hl-btn" data-act="reset">Reset All</button>
    </div>
  `;
  panel.appendChild(head);

  const list = document.createElement("div");
  list.className = "hl-editor-list";
  panel.appendChild(list);

  const foot = document.createElement("div");
  foot.className = "hl-editor-foot";
  foot.innerHTML = `
    <div class="hl-muted" data-role="summary"></div>
    <div class="hl-editor-actions">
      <button class="hl-btn" data-act="close">Cancel</button>
      <button class="hl-btn" data-act="apply">Apply</button>
    </div>
  `;
  panel.appendChild(foot);

  const flatten = () => {
    const rows = [];
    const walk = (name, nodeRef, depth, path) => {
      rows.push({ name, nodeRef, depth, path, hasChildren: Object.keys(nodeRef.children).length > 0 });
      if (!expanded.has(path)) return;
      const childNames = naturalSort(Object.keys(nodeRef.children));
      for (const childName of childNames) {
        const childPath = path ? `${path}/${childName}` : childName;
        walk(childName, nodeRef.children[childName], depth + 1, childPath);
      }
    };
    const topNames = naturalSort(Object.keys(treeRoot.children));
    for (const topName of topNames) walk(topName, treeRoot.children[topName], 0, topName);
    return rows;
  };

  const levelColor = (depth) => {
    const palette = ["#4361ee", "#2a9d8f", "#f4a261", "#e76f51", "#8d99ae", "#4cc9f0"];
    return palette[depth % palette.length];
  };

  const expandAll = () => {
    const walk = (nodeRef, path) => {
      if (Object.keys(nodeRef.children).length > 0) expanded.add(path);
      for (const [childName, childValue] of Object.entries(nodeRef.children)) {
        walk(childValue, path ? `${path}/${childName}` : childName);
      }
    };
    for (const [name, child] of Object.entries(treeRoot.children)) walk(child, name);
  };

  const collapseAll = () => expanded.clear();
  if (initialExpandedPaths && initialExpandedPaths.length) {
    for (const path of initialExpandedPaths) expanded.add(String(path));
  } else {
    collapseAll();
  }

  const rerender = () => {
    recomputeEffective(treeRoot);
    list.innerHTML = "";
    for (const row of flatten()) {
      const rowColor = levelColor(row.depth);
      const rowEl = document.createElement("div");
      rowEl.className = "hl-row";
      rowEl.style.borderLeftColor = rowColor;

      const nameWrap = document.createElement("div");
      nameWrap.className = "hl-name-wrap";
      nameWrap.style.paddingLeft = `${row.depth * 14}px`;

      if (row.hasChildren) {
        const toggle = document.createElement("button");
        toggle.className = "hl-toggle";
        toggle.textContent = expanded.has(row.path) ? "v" : ">";
        toggle.onclick = () => {
          if (expanded.has(row.path)) expanded.delete(row.path);
          else expanded.add(row.path);
          rerender();
        };
        nameWrap.appendChild(toggle);
      } else {
        const pad = document.createElement("span");
        pad.className = "hl-leaf-pad";
        nameWrap.appendChild(pad);
      }

      const name = document.createElement("span");
      name.className = "hl-name";
      name.textContent = row.name;
      nameWrap.appendChild(name);

      const sliderWrap = document.createElement("div");
      sliderWrap.className = "hl-slider-wrap";
      sliderWrap.style.paddingLeft = `${Math.min(row.depth * 8, 40)}px`;

      const slider = document.createElement("input");
      slider.className = "hl-slider";
      slider.type = "range";
      slider.min = "-2";
      slider.max = "2";
      slider.step = "0.01";
      slider.value = String(row.nodeRef.local);
      slider.style.accentColor = rowColor;
      sliderWrap.appendChild(slider);

      const num = document.createElement("input");
      num.className = "hl-num";
      num.type = "number";
      num.min = "-100";
      num.max = "100";
      num.step = "0.01";
      num.value = String(Number(row.nodeRef.local.toFixed(4)));

      const curveBtn = document.createElement("button");
      curveBtn.className = `hl-curve-btn${row.nodeRef.curve && row.nodeRef.curve.enabled ? " is-active" : ""}`;
      curveBtn.textContent = row.nodeRef.curve && row.nodeRef.curve.enabled ? "Curve On" : "Curve";
      curveBtn.onclick = () => {
        openCurveEditor({
          row,
          rowColor,
          onApply: (curveConfig) => {
            row.nodeRef.curve = curveConfig && curveConfig.enabled ? curveConfig : null;
            rerender();
          },
        });
      };

      const eff = document.createElement("div");
      eff.className = "hl-eff";
      eff.textContent = `=> ${row.nodeRef.effective.toFixed(4)}`;

      const syncValue = (value) => {
        const next = Number(value);
        row.nodeRef.local = Number.isFinite(next) ? next : 1.0;
        slider.value = String(row.nodeRef.local);
        num.value = String(Number(row.nodeRef.local.toFixed(4)));
        rerender();
      };

      slider.oninput = () => syncValue(slider.value);
      num.onchange = () => syncValue(num.value);

      rowEl.appendChild(nameWrap);
      rowEl.appendChild(sliderWrap);
      rowEl.appendChild(num);
      rowEl.appendChild(curveBtn);
      rowEl.appendChild(eff);
      list.appendChild(rowEl);
    }
    const summary = foot.querySelector('[data-role="summary"]');
    summary.textContent = `Changed blocks: ${countChanged(treeRoot)}`;
  };

  let closed = false;
  const closeAndSave = () => {
    if (closed) return;
    closed = true;
    if (typeof onEditorStateSave === "function") {
      onEditorStateSave(Array.from(expanded));
    }
    backdrop.remove();
  };

  panel.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    if (act === "expand") {
      expandAll();
      rerender();
    } else if (act === "collapse") {
      collapseAll();
      rerender();
    } else if (act === "reset") {
      const walk = (current) => {
        current.local = 1.0;
        current.curve = null;
        for (const child of Object.values(current.children)) walk(child);
      };
      walk(treeRoot);
      rerender();
    } else if (act === "close") {
      closeAndSave();
    } else if (act === "apply") {
      onApply(exportChanged(treeRoot));
      closeAndSave();
    }
  });

  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) closeAndSave();
  });

  document.body.appendChild(backdrop);
  rerender();
}

app.registerExtension({
  name: "HierarchicalLoraLoader.TreeUI",
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "HierarchicalLoraLoader") return;

    const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = originalOnNodeCreated ? originalOnNodeCreated.apply(this, arguments) : undefined;
      const configWidget = this.widgets?.find((w) => w.name === "tree_config_json");
      const loraWidget = this.widgets?.find((w) => w.name === "lora_name");
      if (!configWidget || !loraWidget) return result;

      configWidget.hidden = true;

      let cachedLora = null;
      let cachedPaths = [];
      let lastStructureSignature = null;
      let lastExpandedPaths = [];

      const preview = this.addWidget("text", "editor_status", "Ready", () => {});
      preview.serialize = false;

      const loadPaths = async () => {
        const loraName = String(loraWidget.value || "").trim();
        if (!loraName) throw new Error("Please select a LoRA first.");
        if (cachedLora !== loraName) {
          cachedPaths = await fetchLoraTreePaths(loraName);
          cachedLora = loraName;
        }
        return cachedPaths;
      };

      this.addWidget("button", "Open Block Editor", "", async () => {
        try {
          preview.value = "Loading LoRA structure...";
          const paths = await loadPaths();
          const structureSignature = buildStructureSignature(paths);
          const root = buildTreeFromPaths(paths);
          applyConfigToTree(root, safeParseJson(configWidget.value));
          recomputeEffective(root);
          openEditor({
            node: this,
            treeRoot: root,
            initialExpandedPaths: lastStructureSignature === structureSignature ? lastExpandedPaths : [],
            onEditorStateSave: (expandedPaths) => {
              lastStructureSignature = structureSignature;
              lastExpandedPaths = expandedPaths;
            },
            onApply: (newConfig) => {
              configWidget.value = JSON.stringify(newConfig, null, 2);
              preview.value = `Updated ${Object.keys(newConfig).length} top-level groups`;
            },
          });
          preview.value = `Loaded ${paths.length} mapped branches`;
        } catch (err) {
          preview.value = `Failed: ${String(err?.message || err)}`;
        }
      });

      this.addWidget("button", "Reset Config JSON", "", () => {
        configWidget.value = "{}";
        preview.value = "All overrides cleared";
      });

      const oldLoraCallback = loraWidget.callback;
      loraWidget.callback = (...args) => {
        if (typeof oldLoraCallback === "function") oldLoraCallback.apply(loraWidget, args);
        cachedLora = null;
        preview.value = "LoRA changed. Open editor to refresh.";
      };

      return result;
    };
  },
});
