import { useCallback, useMemo, useState } from 'react';
import { Copy, FilePlus2, Save, Trash2, X } from 'lucide-react';
import MultiSelectDropdown from '../../components/MultiSelectDropdown';
import SegmentedToggle from '../../components/filters/SegmentedToggle';
import { FilterLabel } from '../../components/filters/FilterLabel';
import { fieldClass } from '../../components/filters/styles';
import MemberPicker from './MemberPicker';
import { addMembers, memberLabel, memberSite, parsePastedIds, toggleSector } from './members';

const PICK_OPTIONS = [['kabupaten', 'Kabupaten'], ['kecamatan', 'Kecamatan'], ['site', 'Site'], ['sector', 'Site Sector']];
const CHIP_LIMIT = 150;

// Two columns: left = saved cluster, name / PIC / description and the member pickers; right = the members
export default function ClusterEditor({
  clusters, selectedId, onSelect, onNew, onSave, onDelete, saving, storeError, storeInfo,
  draft, setDraft, hierarchyData, knownSites, siteSectors, darkMode,
}) {
  const [pick, setPick] = useState('site');
  const [pasteResult, setPasteResult] = useState(null);
  const [kabs, setKabs] = useState([]);
  const [kecs, setKecs] = useState([]);

  const members = draft.members;
  const setMembers = (next) => setDraft({ ...draft, members: next });
  const memberSet = useMemo(() => new Set(members), [members]);
  const field = `border rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${fieldClass(darkMode)}`;
  const box = `rounded-xl border p-4 shadow-2xs space-y-3 ${darkMode ? 'bg-slate-800/80 border-slate-700/80' : 'bg-white border-slate-200/90'}`;

  const kabOptions = useMemo(() => Object.keys(hierarchyData?.kecamatan_by_kab || {}).sort(), [hierarchyData]);
  const kecOptions = useMemo(
    () => Object.keys(hierarchyData?.sites_by_kec || {}).sort().map(k => {
      const [kab, kec] = k.split('___');
      return { value: k, label: `${kec} (${kab})` };
    }),
    [hierarchyData]
  );
  const siteList = useMemo(() => [...knownSites].sort(), [knownSites]);
  const sectorList = useMemo(
    () => siteList.flatMap(s => (siteSectors[s] || []).map(n => `${s}_${n}`)),
    [siteList, siteSectors]
  );

  const sitesOfKabs = (list) => {
    const byKec = hierarchyData?.sites_by_kec || {};
    return Object.entries(byKec).filter(([k]) => list.includes(k.split('___')[0])).flatMap(([, v]) => v);
  };

  const applyPaste = (text) => {
    const res = parsePastedIds(text, knownSites, siteSectors);
    setPasteResult(res);
    if (res.members.length) setMembers(addMembers(members, res.members));
  };

  const siteChecked = useCallback((s) => memberSet.has(s), [memberSet]);
  const sitePartial = useCallback((s) => members.some(m => m.startsWith(`${s}_`)), [members]);
  const sectorChecked = useCallback((id) => memberSet.has(id) || memberSet.has(memberSite(id)), [memberSet]);
  const toggleSite = (s) => setMembers(memberSet.has(s) ? members.filter(m => m !== s) : addMembers(members, [s]));
  const toggleSectorId = (id) => {
    const [s, n] = id.split('_');
    setMembers(toggleSector(members, s, Number(n), siteSectors));
  };

  const wholeCount = members.filter(m => !m.includes('_')).length;
  const sectorCount = members.length - wholeCount;
  const siteCount = new Set(members.map(memberSite)).size;
  const ghostBtn = `px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50 ${fieldClass(darkMode)}`;

  return (
    <div className="grid gap-3 lg:grid-cols-2 items-stretch">
      <div className={box}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <FilterLabel>SAVED CLUSTER</FilterLabel>
            <select value={selectedId ?? ''} onChange={e => onSelect(e.target.value ? Number(e.target.value) : null)} className={`${field} w-full cursor-pointer`}>
              <option value="">— New cluster (not saved) —</option>
              {clusters.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({new Set(c.members.map(m => m.site_id)).size} sites)</option>
              ))}
            </select>
          </div>
          <div>
            <FilterLabel>CLUSTER NAME</FilterLabel>
            <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Antenna Swap Palu W45" className={`${field} w-full`} />
          </div>
          <div>
            <FilterLabel>PIC</FilterLabel>
            <input value={draft.pic} onChange={e => setDraft({ ...draft, pic: e.target.value })} placeholder="Name" className={`${field} w-full`} />
          </div>
        </div>
        <div>
          <FilterLabel>DESCRIPTION</FilterLabel>
          <input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Activity / notes" className={`${field} w-full`} />
        </div>

        <SegmentedToggle label="ADD MEMBERS FROM" options={PICK_OPTIONS} value={pick} onChange={(v) => { setPick(v); setPasteResult(null); }} darkMode={darkMode} />

        {pick === 'kabupaten' && (
          <div className="flex flex-wrap items-end gap-2">
            <MultiSelectDropdown options={kabOptions} selectedValues={kabs} isMulti onChange={setKabs} placeholder="Select Kabupaten..." darkMode={darkMode} minWidth="min-w-60 grow" />
            <button type="button" disabled={!kabs.length} onClick={() => { setMembers(addMembers(members, sitesOfKabs(kabs))); setKabs([]); }} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold cursor-pointer disabled:opacity-40">
              Add all sites
            </button>
          </div>
        )}

        {pick === 'kecamatan' && (
          <div className="flex flex-wrap items-end gap-2">
            <MultiSelectDropdown options={kecOptions} selectedValues={kecs} isMulti onChange={setKecs} placeholder="Select Kecamatan..." darkMode={darkMode} minWidth="min-w-72 grow" />
            <button type="button" disabled={!kecs.length} onClick={() => { setMembers(addMembers(members, kecs.flatMap(k => hierarchyData.sites_by_kec[k] || []))); setKecs([]); }} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold cursor-pointer disabled:opacity-40">
              Add all sites
            </button>
          </div>
        )}

        {pick === 'site' && (
          <MemberPicker mode="site" options={siteList} isChecked={siteChecked} isPartial={sitePartial} onToggle={toggleSite}
            onPaste={applyPaste} pasteResult={pasteResult} darkMode={darkMode} />
        )}
        {pick === 'sector' && (
          <MemberPicker mode="sector" options={sectorList} isChecked={sectorChecked} onToggle={toggleSectorId}
            onPaste={applyPaste} pasteResult={pasteResult} darkMode={darkMode} />
        )}
      </div>

      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterLabel>CLUSTER MEMBERS</FilterLabel>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onNew} className={ghostBtn} title="Start a new cluster">
              <FilePlus2 className="w-3.5 h-3.5" /> New
            </button>
            <button type="button" onClick={() => onSave(false)} disabled={saving} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> {selectedId ? 'Save' : 'Save cluster'}
            </button>
            {selectedId && (
              <>
                <button type="button" onClick={() => onSave(true)} disabled={saving} className={ghostBtn} title="Save as a new cluster (needs a different name)">
                  <Copy className="w-3.5 h-3.5" /> Duplicate
                </button>
                <button type="button" onClick={onDelete} disabled={saving} className="px-2.5 py-1.5 rounded-lg border border-rose-300 text-rose-600 text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50" title="Delete cluster">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
        {storeError && <div className="text-[11px] font-semibold text-rose-500">{storeError}</div>}
        {storeInfo && <div className="text-[11px] font-semibold text-emerald-600">{storeInfo}</div>}
        <div className="flex items-center justify-between">
          <div className={`text-xs font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
            {siteCount} sites • {wholeCount} full sites • {sectorCount} site sectors
          </div>
          <button type="button" disabled={!members.length} onClick={() => setMembers([])} className="text-[11px] font-bold text-rose-500 cursor-pointer disabled:opacity-30">Clear</button>
        </div>
        <div className="flex flex-wrap gap-1 max-h-60 overflow-y-auto">
          {members.length === 0 && <span className="text-[11px] opacity-60">No members yet. Pick from the left or paste a site list.</span>}
          {members.slice(0, CHIP_LIMIT).map(m => (
            <span key={m} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${m.includes('_') ? 'border-violet-300 text-violet-700 dark:text-violet-300' : 'border-blue-300 text-blue-700 dark:text-blue-300'}`}>
              {memberLabel(m)}
              <button type="button" onClick={() => setMembers(members.filter(x => x !== m))} className="cursor-pointer opacity-70 hover:opacity-100"><X className="w-3 h-3" /></button>
            </span>
          ))}
          {members.length > CHIP_LIMIT && <span className="text-[11px] opacity-60">+{members.length - CHIP_LIMIT} more</span>}
        </div>
      </div>
    </div>
  );
}
