// ==========================================================
// SYLLABUS MODULE
// ==========================================================
// Data shape per syllabus record:
// {
//   id: string,
//   classId: string,
//   startDate: 'YYYY-MM-DD',   // khai giảng
//   roadmap: string,            // tổng thể
//   sessions: [                 // buổi học
//     { content: string, date: 'YYYY-MM-DD' }  // date stored per-session
//   ]
// }
// NOTE: date is stored ON each session so that deleting a session in the
// middle never causes other sessions to shift to different calendar dates.

// ---- current state ----
let _syllabusClassId = null; // class being viewed

// Returns array of { sessionIndex (0-based), sessionNum (null if cancelled), date, content, cancelled, cancelReason }
// Cancelled sessions keep their timeline position but sessionNum is null (no sequence number).
// Uses the stored date on each session when available;
// falls back to computed dates for legacy records that lack stored dates.
function getSyllabusSessionDates(syllabusRecord) {
  if (!syllabusRecord) return [];
  const sessions = syllabusRecord.sessions || [];
  if (!sessions.length) return [];

  // Resolve stored or computed dates for every session
  let dates;
  const hasStoredDates = sessions.some(s => s.date);
  if (hasStoredDates) {
    dates = sessions.map(s => s.date || null);
  } else if (syllabusRecord.startDate) {
    // Legacy fallback: compute from startDate + class schedule
    const cls = classes.find(c => c.id === syllabusRecord.classId);
    if (cls) {
      const computed = getNextSessionsForClass(cls, syllabusRecord.startDate, sessions.length);
      dates = sessions.map((_, i) => computed[i] ? computed[i].date : null);
    } else {
      dates = sessions.map(() => null);
    }
  } else {
    dates = sessions.map(() => null);
  }

  // Only non-cancelled sessions get a sequential session number
  let sessionNum = 0;
  return sessions.map((s, i) => {
    if (!s.cancelled) sessionNum++;
    return {
      sessionIndex: i,
      sessionNum: s.cancelled ? null : sessionNum,
      date: dates[i],
      content: s.content || '',
      cancelled: !!s.cancelled,
      cancelReason: s.cancelReason || '',
    };
  });
}

/**
 * Given a class and a date string (YYYY-MM-DD), return info about which
 * session number it corresponds to in the syllabus, and what the content is.
 * Returns null if date is before startDate, no syllabus found, or the session
 * on that date was cancelled.
 */
function getSyllabusInfoForDate(classId, dateStr) {
  const syl = syllabi.find(s => s.classId === classId);
  if (!syl || !syl.startDate) return null;
  if (dateStr < syl.startDate) return null;
  const sessionDates = getSyllabusSessionDates(syl);
  const match = sessionDates.find(s => s.date === dateStr);
  if (!match) return null;
  if (match.cancelled) return null; // cancelled sessions don't show in dashboard
  return match;
}

// ---- Open syllabus page for a class ----
function openSyllabusPage(classId) {
  _syllabusClassId = classId;
  // hide all pages, show syllabus page (which has no bottom-nav entry)
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-syllabus').classList.add('active');
  renderSyllabusPage();
}

function closeSyllabusPage() {
  document.getElementById('page-syllabus').classList.remove('active');
  // return to classes page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-classes').classList.add('active');
  // reset nav active
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const classesNav = document.querySelector('.nav-item[data-page="classes"]');
  if (classesNav) classesNav.classList.add('active');
}

// ---- Temp state for "add sessions" form ----
let _pendingSessionCount = 10;
let _pendingSessionInputs = []; // array of content strings (from inputs)
let _insertingAfterIdx = null;  // sessionIndex after which to insert (-1 = before first)
let _syllabusDetailCache = null;

function renderSyllabusPage() {
  const cls = classes.find(c => c.id === _syllabusClassId);
  if (!cls) { closeSyllabusPage(); return; }

  document.getElementById('syllabus-class-name').textContent = cls.name;

  const syl = syllabi.find(s => s.classId === _syllabusClassId) || {
    classId: _syllabusClassId, startDate: '', roadmap: '', sessions: [],
  };

  // Info form
  document.getElementById('syl-start-date').value = syl.startDate || '';
  document.getElementById('syl-roadmap').value    = syl.roadmap || '';

  // Sessions list
  _insertingAfterIdx = null;
  renderSyllabusSessionList(syl);

  // "Add sessions" form reset
  document.getElementById('syl-add-count').value = 10;
  document.getElementById('syl-add-inputs').innerHTML = '';
  document.getElementById('syl-add-section').style.display = 'none';
}

function renderSyllabusSessionList(syl) {
  const container = document.getElementById('syl-session-list');
  const sessionDates = getSyllabusSessionDates(syl);
  if (!sessionDates.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>Chưa có buổi học nào trong syllabus</p></div>`;
    return;
  }

  const insertFormHtml = (labelText) => `
    <div style="background:var(--bg);border:2px dashed var(--primary);border-radius:10px;padding:10px;margin:4px 0">
      <div style="font-size:0.85rem;font-weight:700;color:var(--primary);margin-bottom:8px">➕ Chèn buổi ${labelText}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
        <input type="number" id="syl-insert-count" value="1" min="1" max="20" class="form-control" style="width:70px">
        <span style="font-size:0.82rem">buổi</span>
        <button class="btn btn-outline btn-sm" onclick="generateInsertInputs()">Tạo form</button>
      </div>
      <div id="syl-insert-inputs"></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary btn-sm" onclick="confirmInsertSylSessions()">✅ Chèn vào</button>
        <button class="btn btn-outline btn-sm" onclick="cancelInsertSylSessions()">Hủy</button>
      </div>
    </div>
  `;

  let html = '';

  if (_insertingAfterIdx === -1) {
    html += insertFormHtml('vào đầu danh sách');
  } else {
    html += `<div style="text-align:center;margin-bottom:4px">
      <button class="btn btn-outline btn-sm" style="font-size:0.75rem;opacity:0.7" onclick="startInsertSylSessions(-1)">➕ Chèn trước buổi đầu</button>
    </div>`;
  }

  for (const s of sessionDates) {
    const dateHtml = s.date
      ? fmtDate(s.date)
      : '<span style="color:var(--warning)">Chưa xác định ngày</span>';

    if (s.cancelled) {
      html += `
        <div class="syl-session-row cancelled" id="syl-row-${s.sessionIndex}" data-idx="${s.sessionIndex}">
          <div class="syl-session-num syl-session-cancelled-label">Buổi nghỉ</div>
          <div class="syl-session-date">${dateHtml}</div>
          <div class="syl-session-content">
            <span style="text-decoration:line-through;opacity:0.65">${esc(s.content) || 'Không có nội dung'}</span>
            ${s.cancelReason ? `<br><span style="font-size:0.78rem;color:var(--danger)">Lý do: ${esc(s.cancelReason)}</span>` : ''}
          </div>
          <div class="syl-session-actions">
            <button class="btn btn-outline btn-sm" title="Chèn buổi sau đây" onclick="startInsertSylSessions(${s.sessionIndex})">➕</button>
            <button class="btn btn-outline btn-sm" title="Khôi phục buổi học" onclick="restoreSylSession(${s.sessionIndex})">↩️</button>
            <button class="btn btn-danger btn-sm" title="Xóa hoàn toàn" onclick="permanentDeleteSylSession(${s.sessionIndex})">🗑</button>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="syl-session-row" id="syl-row-${s.sessionIndex}" data-idx="${s.sessionIndex}">
          <div class="syl-session-num">Buổi ${s.sessionNum}</div>
          <div class="syl-session-date">${dateHtml}</div>
          <div class="syl-session-content" id="syl-content-${s.sessionIndex}">${esc(s.content) || '<span style="color:var(--text-secondary)">Chưa có nội dung</span>'}</div>
          <div class="syl-session-actions">
            <button class="btn btn-outline btn-sm" title="Chèn buổi sau đây" onclick="startInsertSylSessions(${s.sessionIndex})">➕</button>
            <button class="btn btn-outline btn-sm" onclick="editSylSession(${s.sessionIndex})">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="cancelSylSession(${s.sessionIndex})">🗑</button>
          </div>
        </div>
      `;
    }

    if (_insertingAfterIdx === s.sessionIndex) {
      html += insertFormHtml(`sau Buổi ${s.sessionNum !== null ? s.sessionNum : '(nghỉ)'}`);
    }
  }

  container.innerHTML = html;
}

// ---- Save meta (startDate + roadmap) ----
// When startDate changes, recompute all stored session dates from the
// class schedule so the calendar dates reflect the new start.
async function saveSyllabusMeta() {
  const startDate = document.getElementById('syl-start-date').value;
  const roadmap   = document.getElementById('syl-roadmap').value.trim();
  let syl = syllabi.find(s => s.classId === _syllabusClassId);
  const oldStart = syl ? syl.startDate : null;

  if (!syl) {
    syl = { id: uid(), classId: _syllabusClassId, startDate, roadmap, sessions: [] };
    syllabi.push(syl);
  } else {
    syl.startDate = startDate;
    syl.roadmap   = roadmap;
  }

  // Recompute session dates when startDate changes (or first set)
  if (startDate && startDate !== oldStart && syl.sessions.length > 0) {
    const cls = classes.find(c => c.id === _syllabusClassId);
    if (cls) {
      const newDates = getNextSessionsForClass(cls, startDate, syl.sessions.length);
      syl.sessions = syl.sessions.map((s, i) => ({
        ...s,
        date: newDates[i] ? newDates[i].date : s.date,
      }));
    }
  }

  syl.updatedAt = new Date().toISOString();
  await dbPut('syllabi', syl);
  renderSyllabusSessionList(syl);
  toast('✅ Đã lưu thông tin syllabus');
}

// ---- Generate add-session inputs ----
function generateSylAddInputs() {
  const count = Math.max(1, Math.min(100, Number(document.getElementById('syl-add-count').value) || 10));
  const syl = syllabi.find(s => s.classId === _syllabusClassId);
  // Use only non-cancelled sessions for the sequential label numbering
  const existingActive = syl ? (syl.sessions || []).filter(s => !s.cancelled).length : 0;
  const section = document.getElementById('syl-add-section');
  section.style.display = 'block';
  const container = document.getElementById('syl-add-inputs');
  container.innerHTML = Array.from({ length: count }, (_, i) => `
    <div class="form-group" style="margin-bottom:8px">
      <label style="font-size:0.8rem;color:var(--text-secondary)">Buổi ${existingActive + i + 1}</label>
      <input class="form-control syl-add-input" data-offset="${i}"
        placeholder="Nội dung buổi ${existingActive + i + 1}...">
    </div>
  `).join('');
}

// ---- Append sessions ----
// New sessions get calendar dates computed from the class schedule,
// starting strictly AFTER the last existing session's date.
async function appendSylSessions() {
  const inputs = document.querySelectorAll('#syl-add-inputs .syl-add-input');
  const contents = [];
  inputs.forEach(inp => contents.push(inp.value.trim()));
  if (!contents.length) return;

  let syl = syllabi.find(s => s.classId === _syllabusClassId);
  const startDate = document.getElementById('syl-start-date').value;
  const roadmap   = document.getElementById('syl-roadmap').value.trim();

  if (!syl) {
    syl = { id: uid(), classId: _syllabusClassId, startDate, roadmap, sessions: [] };
    syllabi.push(syl);
  } else {
    if (!syl.startDate && startDate) syl.startDate = startDate;
  }

  // Determine from which date to start generating new session dates
  const cls = classes.find(c => c.id === _syllabusClassId);
  const newSessions = [];

  if (cls && syl.startDate) {
    const existing = syl.sessions || [];
    let fromDate; // we'll call getNextSessionsForClass(cls, fromDate, count)

    if (existing.length === 0) {
      // First batch: start exactly at startDate
      fromDate = syl.startDate;
    } else {
      // Find the date of the final existing session
      let lastDate = existing[existing.length - 1].date;
      if (!lastDate) {
        // Legacy data without stored dates: backfill them now
        const legacyDates = getNextSessionsForClass(cls, syl.startDate, existing.length);
        syl.sessions = existing.map((s, i) => ({
          ...s, date: legacyDates[i] ? legacyDates[i].date : null,
        }));
        lastDate = syl.sessions[syl.sessions.length - 1].date;
      }
      // Advance one day past the last session; getNextSessionsForClass will
      // then find the next scheduled weekday on or after that day.
      const d = new Date(lastDate + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      fromDate = localDateStr(d);
    }

    const computedDates = getNextSessionsForClass(cls, fromDate, contents.length);
    contents.forEach((content, i) => {
      newSessions.push({ content, date: computedDates[i] ? computedDates[i].date : null });
    });
  } else {
    // No class schedule info — store without dates
    contents.forEach(content => newSessions.push({ content, date: null }));
  }

  syl.sessions = (syl.sessions || []).concat(newSessions);
  syl.updatedAt = new Date().toISOString();
  await dbPut('syllabi', syl);

  // Reset add form
  document.getElementById('syl-add-section').style.display = 'none';
  document.getElementById('syl-add-inputs').innerHTML = '';
  document.getElementById('syl-add-count').value = 10;

  renderSyllabusSessionList(syl);
  toast(`✅ Đã thêm ${newSessions.length} buổi vào syllabus`);
}

// ---- Insert sessions between existing sessions ----
function startInsertSylSessions(afterIdx) {
  _insertingAfterIdx = afterIdx;
  const syl = syllabi.find(s => s.classId === _syllabusClassId);
  renderSyllabusSessionList(syl);
  generateInsertInputs(); // auto-show 1 input by default
}

function cancelInsertSylSessions() {
  _insertingAfterIdx = null;
  const syl = syllabi.find(s => s.classId === _syllabusClassId);
  renderSyllabusSessionList(syl);
}

function generateInsertInputs() {
  const countEl = document.getElementById('syl-insert-count');
  const count = Math.max(1, Math.min(20, Number(countEl ? countEl.value : 1) || 1));
  const container = document.getElementById('syl-insert-inputs');
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, (_, i) => `
    <div class="form-group" style="margin-bottom:6px">
      <label style="font-size:0.78rem;color:var(--text-secondary)">Buổi chèn ${i + 1}</label>
      <input class="form-control syl-ins-input" placeholder="Nội dung buổi chèn ${i + 1}...">
    </div>
  `).join('');
}

async function confirmInsertSylSessions() {
  const inputs = document.querySelectorAll('#syl-insert-inputs .syl-ins-input');
  const contents = Array.from(inputs).map(inp => inp.value.trim());
  if (!contents.length) { toast('Hãy nhấn "Tạo form" để nhập nội dung trước'); return; }

  const syl = syllabi.find(s => s.classId === _syllabusClassId);
  if (!syl) return;

  const afterIdx = _insertingAfterIdx;
  const newItems = contents.map(c => ({ content: c, date: null }));

  if (afterIdx === -1) {
    syl.sessions = [...newItems, ...syl.sessions];
  } else {
    syl.sessions = [
      ...syl.sessions.slice(0, afterIdx + 1),
      ...newItems,
      ...syl.sessions.slice(afterIdx + 1),
    ];
  }

  _insertingAfterIdx = null;
  syl.updatedAt = new Date().toISOString();
  await dbPut('syllabi', syl);
  renderSyllabusSessionList(syl);
  toast(`✅ Đã chèn ${newItems.length} buổi vào syllabus`);
}

// ---- Smart Syllabus from Oxford Discover ----
async function loadSyllabusDetail() {
  if (_syllabusDetailCache) return _syllabusDetailCache;
  try {
    const resp = await fetch('./syllabus_detail.json');
    _syllabusDetailCache = await resp.json();
    return _syllabusDetailCache;
  } catch (e) {
    toast('❌ Không thể tải dữ liệu syllabus chi tiết');
    return null;
  }
}

async function applySmartSyllabus() {
  const select = document.getElementById('syl-smart-level');
  const levelClass = select ? select.value : '';
  if (!levelClass) { toast('Vui lòng chọn trình độ'); return; }

  const data = await loadSyllabusDetail();
  if (!data) return;

  const levelData = data.find(d => d.class === levelClass);
  if (!levelData) { toast('Không tìm thấy dữ liệu cho trình độ này'); return; }

  let syl = syllabi.find(s => s.classId === _syllabusClassId);
  if (syl && syl.sessions && syl.sessions.length > 0) {
    const ok = confirm(
      `Syllabus đã có ${syl.sessions.filter(s => !s.cancelled).length} buổi.\n` +
      `OK = Thay thế toàn bộ bằng ${levelData.days.length} buổi của ${levelClass} (${levelData.cefr})\n` +
      `Cancel = Hủy bỏ`
    );
    if (!ok) return;
    syl.sessions = [];
  }

  const startDate = document.getElementById('syl-start-date').value;
  const roadmap   = document.getElementById('syl-roadmap').value.trim();

  if (!syl) {
    syl = { id: uid(), classId: _syllabusClassId, startDate: startDate || '', roadmap: roadmap || '', sessions: [] };
    syllabi.push(syl);
  }
  if (!syl.roadmap) syl.roadmap = `Oxford Discover ${levelClass} (${levelData.cefr})`;

  const contentSessions = levelData.days.map(d => ({ content: d.content, date: null }));

  const cls = classes.find(c => c.id === _syllabusClassId);
  if (cls && syl.startDate) {
    const computedDates = getNextSessionsForClass(cls, syl.startDate, contentSessions.length);
    syl.sessions = contentSessions.map((s, i) => ({
      ...s, date: computedDates[i] ? computedDates[i].date : null,
    }));
  } else {
    syl.sessions = contentSessions;
  }

  syl.updatedAt = new Date().toISOString();
  await dbPut('syllabi', syl);
  renderSyllabusPage();
  toast(`✅ Đã tạo syllabus ${levelData.days.length} buổi cho ${levelClass} (${levelData.cefr})`);
}

// ---- Edit single session ----
function editSylSession(idx) {
  const syl = syllabi.find(s => s.classId === _syllabusClassId);
  if (!syl || !syl.sessions[idx]) return;
  const row = document.getElementById(`syl-row-${idx}`);
  const current = syl.sessions[idx].content || '';
  const contentDiv = row.querySelector('.syl-session-content');
  contentDiv.innerHTML = `
    <textarea class="form-control" id="syl-edit-input-${idx}" rows="4"
      style="margin-bottom:4px;resize:vertical"></textarea>
    <div style="display:flex;gap:6px">
      <button class="btn btn-primary btn-sm" onclick="saveSylSession(${idx})">💾 Lưu</button>
      <button class="btn btn-outline btn-sm" onclick="cancelEditSylSession(${idx})">Hủy</button>
    </div>
  `;
  // Set value after DOM insertion to preserve \n and avoid HTML encoding issues
  document.getElementById(`syl-edit-input-${idx}`).value = current;
}

function cancelEditSylSession(idx) {
  const syl = syllabi.find(s => s.classId === _syllabusClassId);
  const row = document.getElementById(`syl-row-${idx}`);
  if (!row || !syl) return;
  const original = (syl.sessions[idx] && syl.sessions[idx].content) || '';
  row.querySelector('.syl-session-content').innerHTML =
    esc(original) || '<span style="color:var(--text-secondary)">Chưa có nội dung</span>';
}

async function saveSylSession(idx) {
  const syl = syllabi.find(s => s.classId === _syllabusClassId);
  if (!syl) return;
  const input = document.getElementById(`syl-edit-input-${idx}`);
  if (!input) return;
  syl.sessions[idx].content = input.value.trim();
  syl.updatedAt = new Date().toISOString();
  await dbPut('syllabi', syl);
  renderSyllabusSessionList(syl);
  toast('✅ Đã cập nhật buổi học');
}

// ---- Cancel (soft-delete) a session ----
// The session keeps its timeline position and date but is marked as a rest day.
// It no longer receives a session number; remaining active sessions are renumbered.
// If the cancelled session has content, that content cascades forward: each subsequent
// active session receives the topic from the previous slot. Any content displaced from
// the final session is appended as a new unscheduled session so no topic is lost.
async function cancelSylSession(idx) {
  const reason = prompt('Lý do nghỉ buổi này (có thể để trống):');
  if (reason === null) return; // user pressed Cancel in prompt
  const syl = syllabi.find(s => s.classId === _syllabusClassId);
  if (!syl) return;
  syl.sessions = syl.sessions.slice();

  const cancelledContent = syl.sessions[idx].content || '';

  // --- Cascade content forward and record a rollback snapshot ---
  // snapshot = array of { sessionIdx, originalContent } for every session touched
  // spillId   = unique marker placed on the auto-appended overflow session (if any)
  const snapshot = [];
  let spillId = null;

  if (cancelledContent) {
    let carry = cancelledContent;
    for (let i = idx + 1; i < syl.sessions.length; i++) {
      if (!syl.sessions[i].cancelled) {
        const displaced = syl.sessions[i].content || '';
        snapshot.push({ sessionIdx: i, originalContent: displaced });
        syl.sessions[i] = { ...syl.sessions[i], content: carry };
        carry = displaced;
        if (!carry) break; // nothing left to propagate
      }
    }
    // If content was pushed beyond the last session, append a new unscheduled slot
    if (carry) {
      spillId = '_spill_' + idx + '_' + Date.now();
      syl.sessions.push({ content: carry, date: null, _cascadeSpillId: spillId });
    }
  }

  // Mark as cancelled — keep content on the slot so it shows struck-through as reference.
  // Attach rollback metadata so restore() can undo the cascade exactly.
  syl.sessions[idx] = {
    ...syl.sessions[idx],
    cancelled: true,
    cancelReason: reason.trim(),
    _rollbackSnapshot: snapshot,
    _rollbackSpillId: spillId,
  };

  syl.updatedAt = new Date().toISOString();
  await dbPut('syllabi', syl);
  renderSyllabusSessionList(syl);
  toast('📌 Đã đánh dấu buổi nghỉ — nội dung đã được dịch chuyển sang các buổi tiếp theo');
}

// ---- Restore a cancelled session back to active ----
// Reverses the content cascade that was applied at cancel time using the stored snapshot.
async function restoreSylSession(idx) {
  const syl = syllabi.find(s => s.classId === _syllabusClassId);
  if (!syl) return;
  syl.sessions = syl.sessions.slice();

  const session = syl.sessions[idx];
  const snapshot  = session._rollbackSnapshot || [];   // [{ sessionIdx, originalContent }]
  const spillId   = session._rollbackSpillId  || null; // ID of the overflow session to remove

  // 1. Remove the overflow (spill) session that was appended during cascade, if any
  if (spillId) {
    const spillIdx = syl.sessions.findIndex(s => s._cascadeSpillId === spillId);
    if (spillIdx !== -1) {
      syl.sessions.splice(spillIdx, 1);
      // After removing the spill, indices stored in snapshot that are >= spillIdx shift by -1.
      // But the spill was always pushed to the END (index > all snapshot indices), so
      // no snapshot index needs adjustment.
    }
  }

  // 2. Restore original contents of all sessions touched by the cascade
  for (const { sessionIdx, originalContent } of snapshot) {
    if (syl.sessions[sessionIdx]) {
      syl.sessions[sessionIdx] = { ...syl.sessions[sessionIdx], content: originalContent };
    }
  }

  // 3. Restore the cancelled session itself, stripping all cancel/rollback metadata
  const restored = { ...syl.sessions[idx] };
  delete restored.cancelled;
  delete restored.cancelReason;
  delete restored._rollbackSnapshot;
  delete restored._rollbackSpillId;
  syl.sessions[idx] = restored;

  syl.updatedAt = new Date().toISOString();
  await dbPut('syllabi', syl);
  renderSyllabusSessionList(syl);
  toast('✅ Đã khôi phục buổi học — nội dung đã được hoàn nguyên');
}

// ---- Permanently remove a session from the syllabus ----
async function permanentDeleteSylSession(idx) {
  if (!confirm('Xóa hoàn toàn buổi này khỏi syllabus? Thao tác không thể hoàn tác.')) return;
  const syl = syllabi.find(s => s.classId === _syllabusClassId);
  if (!syl) return;
  syl.sessions = syl.sessions.slice();
  syl.sessions.splice(idx, 1);
  syl.updatedAt = new Date().toISOString();
  await dbPut('syllabi', syl);
  renderSyllabusSessionList(syl);
  toast('🗑 Đã xóa buổi học');
}

// ---- Recalculate session dates from a given date (schedule change) ----
// Sessions before fromDate keep their stored dates unchanged.
// Sessions from fromDate onward are reassigned new dates using the current class schedule.
async function recalcSyllabusFromDate() {
  const fromDate = document.getElementById('syl-recalc-from').value;
  if (!fromDate) { toast('Vui lòng chọn ngày bắt đầu tính lại'); return; }

  const syl = syllabi.find(s => s.classId === _syllabusClassId);
  if (!syl || !syl.sessions.length) { toast('Chưa có buổi học trong syllabus'); return; }

  const cls = classes.find(c => c.id === _syllabusClassId);
  if (!cls) return;

  // Find the first session that needs recalculation (date >= fromDate, or has no date)
  const cutoffIdx = syl.sessions.findIndex(s => !s.date || s.date >= fromDate);
  if (cutoffIdx === -1) { toast('Không có buổi nào từ ngày đó trở đi để tính lại'); return; }

  const count = syl.sessions.length - cutoffIdx;
  // Compute 'count' consecutive dates using the current schedule, starting from fromDate.
  // Cancelled sessions still occupy a slot in the schedule (the day was skipped, not removed).
  const newDates = getNextSessionsForClass(cls, fromDate, count);

  syl.sessions = syl.sessions.map((s, i) => {
    if (i < cutoffIdx) return s;
    const nd = newDates[i - cutoffIdx];
    return { ...s, date: nd ? nd.date : null };
  });

  syl.updatedAt = new Date().toISOString();
  await dbPut('syllabi', syl);
  renderSyllabusSessionList(syl);
  toast(`✅ Đã tính lại lịch cho ${count} buổi từ ngày ${fmtDate(fromDate)}`);
}
