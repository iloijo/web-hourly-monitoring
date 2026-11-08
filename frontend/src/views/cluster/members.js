// Cluster members are "SITE" (every sector) or "SITE_<sector>", e.g. "UPD012" or "UPD012_1".

const ID_RE = /^([A-Z0-9]{6})(?:[_.-](\d{1,3}))?$/;

export const memberSite = (m) => m.split('_')[0];
export const memberSector = (m) => (m.includes('_') ? Number(m.split('_')[1]) : null);

// Pasted text (Excel column or row, comma, semicolon, tab, space, |, /, dot) -> member ids.
// A dot followed by a sector number stays part of the id: "UPD001.1" = UPD001 sector 1.
export function parsePastedIds(text, knownSites, siteSectors) {
  const tokens = String(text || '').toUpperCase().split(/[\s,;|/\\]+|\.(?!\d)/).map(t => t.trim()).filter(Boolean);
  const members = new Set();
  const unknown = new Set();
  tokens.forEach(t => {
    const m = t.match(ID_RE);
    if (!m || !knownSites.has(m[1])) { unknown.add(t); return; }
    if (m[2] === undefined) { members.add(m[1]); return; }
    const sec = Number(m[2]);
    const known = siteSectors[m[1]];
    if (known && !known.includes(sec)) unknown.add(t);
    else members.add(`${m[1]}_${sec}`);
  });
  return { members: [...members], unknown: [...unknown] };
}

// Adds members; a whole site absorbs its sector picks
export function addMembers(current, added) {
  const all = new Set([...current, ...added]);
  const whole = new Set([...all].filter(m => !m.includes('_')));
  return [...all].filter(m => !m.includes('_') || !whole.has(memberSite(m))).sort();
}

// Toggles one sector; unchecking a sector of a whole-site member keeps the site's other sectors
export function toggleSector(current, site, sector, siteSectors) {
  const id = `${site}_${sector}`;
  if (current.includes(site)) {
    const others = (siteSectors[site] || []).filter(s => s !== sector).map(s => `${site}_${s}`);
    return [...current.filter(m => m !== site), ...others].sort();
  }
  return current.includes(id) ? current.filter(m => m !== id) : addMembers(current, [id]);
}

export const memberLabel = (m) => (m.includes('_') ? `${memberSite(m)} sec ${memberSector(m)}` : m);
