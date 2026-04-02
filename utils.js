// ==========================================================
// UTILITY HELPERS
// ==========================================================
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DAY_FULL  = [
  'Chủ nhật', 'Thứ 2', 'Thứ 3',
  'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7',
];

/** Format VNĐ */
function fmtMoney(n) {
  if (!n) return '0 ₫';
  return Number(n).toLocaleString('vi-VN') + ' ₫';
}

/** Format date dd/mm/yyyy */
function fmtDate(d) {
  if (!d) return '';
  const parts = d.split('-');
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** Convert time "HH:MM" to minutes since midnight */
function timeToMinutes(str) {
  if (!str) return NaN;
  const parts = String(str).split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

/** Convert minutes since midnight to "HH:MM" */
function minutesToTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** Format a Date object to local YYYY-MM-DD */
function localDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/**
 * Return the ISO date strictly after afterIso that falls on one of the class's
 * scheduled weekdays.
 */
function nextScheduledDateAfter(cls, afterIso) {
  if (!cls || !afterIso) return null;
  const d = new Date(afterIso + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  const result = getNextSessionsForClass(cls, localDateStr(d), 1);
  return result.length > 0 ? result[0].date : null;
}

/** Get class time info for a specific weekday index */
function getClassTimeForDay(c, dayIdx) {
  if (!c) return null;
  if (c.schedules && c.schedules[dayIdx]) {
    const start = c.schedules[dayIdx].start;
    const end   = c.schedules[dayIdx].end;
    const sMin  = timeToMinutes(start);
    const eMin  = timeToMinutes(end);
    const duration = (isNaN(sMin) || isNaN(eMin)) ? null : (eMin - sMin);
    return { start, end, startMin: sMin, endMin: eMin, duration };
  }
  if (c.time) {
    const start    = c.time;
    const sMin     = timeToMinutes(start);
    const duration = Number(c.duration) || 90;
    const endMin   = sMin + duration;
    return { start, end: minutesToTime(endMin), startMin: sMin, endMin, duration };
  }
  return null;
}

// Generate next N sessions (date + start/end) for a class starting from fromDate
function getNextSessionsForClass(cls, fromDateIso, count) {
  if (!cls) return [];
  const startDate    = fromDateIso ? new Date(fromDateIso + 'T00:00:00') : new Date();
  const scheduleDays = cls.schedules
    ? Object.keys(cls.schedules).map(Number)
    : (cls.days || []);
  if (!scheduleDays || scheduleDays.length === 0) return [];
  const result  = [];
  const maxIter = 365 * 3;
  let iter = 0;
  const d = new Date(startDate);
  while (result.length < count && iter < maxIter) {
    const wd = d.getDay();
    if (scheduleDays.includes(wd)) {
      const schedule = cls.schedules && cls.schedules[wd] ? cls.schedules[wd] : null;
      const start    = schedule ? schedule.start : (cls.time || null);
      const end      = schedule ? schedule.end
        : (cls.time ? minutesToTime(timeToMinutes(cls.time) + (Number(cls.duration) || 90)) : null);
      if (start && end) {
        result.push({ date: localDateStr(d), start, end, day: wd });
      }
    }
    d.setDate(d.getDate() + 1);
    iter++;
  }
  return result;
}

/** Show a toast message */
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

/** Escape HTML to prevent XSS */
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
