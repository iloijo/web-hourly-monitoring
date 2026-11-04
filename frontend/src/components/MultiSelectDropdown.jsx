import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';

export default function MultiSelectDropdown({
  label,
  options = [],
  selectedValues = [],
  onChange,
  isMulti = true,
  placeholder = "Select...",
  searchable = true,
  darkMode = false,
  minWidth = "min-w-44"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // Multi-select edits a draft; onChange (which reloads data) fires only on Terapkan or closing
  const [draft, setDraft] = useState(selectedValues);
  const dropdownRef = useRef(null);

  const isDirty = isMulti && (
    draft.length !== selectedValues.length || draft.some(v => !selectedValues.includes(v))
  );

  const openDropdown = () => {
    setDraft(selectedValues);
    setIsOpen(true);
  };

  const closeDropdown = (apply) => {
    setIsOpen(false);
    if (apply && isDirty) onChange(draft);
  };

  // Close (and apply pending changes) when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        closeDropdown(true);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  });

  // Normalize options to { value, label }
  const normalizedOptions = useMemo(() => {
    return options.map(opt => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt };
      }
      return opt;
    });
  }, [options]);

  // Filtered options based on search term
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return normalizedOptions;
    const q = searchTerm.toLowerCase();
    return normalizedOptions.filter(opt => 
      opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q)
    );
  }, [normalizedOptions, searchTerm]);

  // Summary display text
  const displayText = useMemo(() => {
    if (!selectedValues || selectedValues.length === 0) return placeholder;
    if (!isMulti) {
      const match = normalizedOptions.find(o => o.value === selectedValues[0]);
      return match ? match.label : selectedValues[0];
    }
    if (selectedValues.length === 1) {
      return selectedValues[0];
    }
    if (selectedValues.length === normalizedOptions.length && normalizedOptions.length > 0) {
      return `All (${selectedValues.length})`;
    }
    return `${selectedValues.length} Selected`;
  }, [selectedValues, normalizedOptions, isMulti, placeholder]);

  // Toggle single item
  const handleToggle = (val) => {
    if (!isMulti) {
      onChange([val]);
      setIsOpen(false);
      return;
    }

    if (draft.includes(val)) {
      if (draft.length <= 1) return; // Keep at least 1
      setDraft(draft.filter(v => v !== val));
    } else {
      setDraft([...draft, val]);
    }
  };

  const handleSelectAll = () => {
    setDraft(normalizedOptions.map(o => o.value));
  };

  const handleClear = () => {
    if (normalizedOptions.length > 0) {
      setDraft([normalizedOptions[0].value]);
    }
  };

  return (
    <div className={`relative ${minWidth}`} ref={dropdownRef}>
      {label && (
        <label className="block text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1 flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[9px] opacity-60 font-semibold">{isMulti ? 'Multi' : 'Single'}</span>
        </label>
      )}

      {/* Button */}
      <button
        type="button"
        onClick={() => (isOpen ? closeDropdown(true) : openDropdown())}
        className={`w-full flex items-center justify-between border rounded-lg px-3 py-1.5 text-xs font-bold transition cursor-pointer shadow-2xs ${
          darkMode 
            ? 'bg-slate-800 border-slate-700 text-white hover:border-slate-600' 
            : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
        }`}
      >
        <span className="truncate pr-1">{displayText}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className={`absolute top-full left-0 mt-1.5 w-64 sm:w-72 border rounded-xl shadow-2xl z-50 p-2.5 space-y-2 text-xs ${
          darkMode 
            ? 'bg-slate-900 border-slate-700 text-slate-200' 
            : 'bg-white border-slate-200 text-slate-800'
        }`}>
          
          {/* Header for multi-select */}
          {isMulti && (
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px]">
              <span className="font-bold text-slate-400">
                {draft.length} of {normalizedOptions.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-blue-500 hover:underline font-bold cursor-pointer"
                >
                  All
                </button>
                <span className="opacity-40">|</span>
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-blue-500 hover:underline font-bold cursor-pointer"
                >
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* Search Box */}
          {searchable && normalizedOptions.length > 5 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                autoFocus
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-8 pr-7 py-1 text-xs rounded-lg border font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                  darkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
                }`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Options List */}
          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5">
            {filteredOptions.length === 0 ? (
              <div className="text-center py-3 text-slate-400 text-xs italic">
                Tidak ada data ditemukan
              </div>
            ) : (
              <>
                {filteredOptions.slice(0, 100).map(opt => {
                  const isSelected = isMulti ? draft.includes(opt.value) : selectedValues.includes(opt.value);

                  return (
                    <div
                      key={opt.value}
                      onClick={() => handleToggle(opt.value)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition select-none ${
                        isSelected
                          ? darkMode 
                            ? 'bg-blue-900/30 text-blue-300 font-bold' 
                            : 'bg-blue-50 text-blue-900 font-bold'
                          : darkMode 
                            ? 'hover:bg-slate-800 text-slate-300' 
                            : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {isMulti && (
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                            isSelected 
                              ? 'bg-blue-600 border-blue-600 text-white' 
                              : darkMode ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-white'
                          }`}>
                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                          </div>
                        )}
                        <span className="truncate">{opt.label}</span>
                      </div>

                      {!isMulti && isSelected && (
                        <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      )}
                    </div>
                  );
                })}
                {filteredOptions.length > 100 && (
                  <div className="text-[10px] text-center py-1 text-slate-400 italic">
                    Menampilkan 100 dari {filteredOptions.length} — gunakan pencarian untuk memfilter
                  </div>
                )}
              </>
            )}
          </div>

          {/* Apply / cancel for multi-select */}
          {isMulti && (
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => closeDropdown(false)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                  darkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => closeDropdown(true)}
                disabled={!isDirty}
                className="px-3 py-1 rounded-lg text-[11px] font-bold transition bg-blue-600 text-white hover:bg-blue-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Terapkan ({draft.length})
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
