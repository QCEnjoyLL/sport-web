/* Client timezone helpers.
   offsetMin follows Date.getTimezoneOffset(): UTC+8 is -480. */

export function resolveTimezoneOffset(headerValue, body) {
  const bodyTz = Number(body && body.tz_offset);
  if (Number.isFinite(bodyTz)) return bodyTz;
  const headerTz = Number(headerValue);
  return Number.isFinite(headerTz) ? headerTz : 0;
}

export function getClientDate(offsetMin = 0, nowMs = Date.now()) {
  return new Date(nowMs - offsetMin * 60000);
}

export function getClientDayStartTs(year, month, day, offsetMin = 0) {
  return Math.floor((Date.UTC(year, month - 1, day, 0, 0, 0) + offsetMin * 60000) / 1000);
}

export function getClientTodayStartTs(offsetMin = 0, nowMs = Date.now()) {
  const d = getClientDate(offsetMin, nowMs);
  return getClientDayStartTs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), offsetMin);
}

export function getClientMonthBoundsTs(year, month, offsetMin = 0) {
  return {
    startTs: getClientDayStartTs(year, month, 1, offsetMin),
    endTs: getClientDayStartTs(year, month + 1, 1, offsetMin),
  };
}

export function toClientDateStr(ts, offsetMin = 0) {
  const d = new Date(ts * 1000 - offsetMin * 60000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
