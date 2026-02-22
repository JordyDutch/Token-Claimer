"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchAssetByAddress, searchAssetsByName, getEnvioEndpoint, type AssetInfo as TokenInfo } from "../lib/envio";
import { useNetwork } from "./NetworkProvider";

interface Props {
  value: string;
  onChange: (address: string) => void;
  label?: string;
  className?: string;
}

export default function TokenSearchInput({ value, onChange, label, className }: Props) {
  const { networkId } = useNetwork();
  const envioEndpoint = getEnvioEndpoint(networkId);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<TokenInfo[]>([]);
  const [selected, setSelected] = useState<TokenInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load metadata for an already-set address on mount / value change
  useEffect(() => {
    if (!value || value.length !== 42 || !value.startsWith("0x")) {
      setSelected(null);
      return;
    }
    if (selected?.id.toLowerCase() === value.toLowerCase()) return;
    fetchAssetByAddress(value, envioEndpoint).then((t) => setSelected(t)).catch(() => setSelected(null));
  }, [value, envioEndpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setSearching(false); return; }

    // If it looks like a full address, look up directly
    if (q.startsWith("0x") && q.length === 42) {
      setSearching(true);
      fetchAssetByAddress(q, envioEndpoint)
        .then((t) => { setResults(t ? [t] : []); setSearching(false); })
        .catch(() => { setResults([]); setSearching(false); });
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await searchAssetsByName(q, 8, envioEndpoint);
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [envioEndpoint]);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setSearch(q);
    setOpen(true);
    doSearch(q);
  }

  function selectToken(token: TokenInfo) {
    setSelected(token);
    onChange(token.id);
    setSearch("");
    setResults([]);
    setOpen(false);
  }

  function clearSelection() {
    setSelected(null);
    onChange("");
    setSearch("");
    setResults([]);
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const inp = "w-full bg-surface border border-border-default rounded-lg px-3 py-2.5 text-sm text-secondary focus:outline-none focus:border-purple-400 transition-colors";

  return (
    <div ref={containerRef} className={className}>
      {label && <label className="text-[11px] sm:text-xs text-label block mb-1">{label}</label>}

      {/* Selected token preview */}
      {selected && (
        <div className="flex items-center gap-3 bg-surface-subtle border border-border-default rounded-lg px-3 py-2 mb-2">
          {selected.icon ? (
            <img src={selected.icon} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center text-xs text-label flex-shrink-0">
              {selected.isLSP7 ? "🪙" : "🖼"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-secondary truncate">{selected.lsp4TokenName}</span>
              <span className="text-[10px] text-label flex-shrink-0">{selected.lsp4TokenSymbol}</span>
              <span className="text-[10px] px-1 py-0.5 rounded bg-surface-hover text-muted flex-shrink-0">
                {selected.isLSP7 ? "LSP7" : "LSP8"}
              </span>
            </div>
            <span className="text-[10px] font-mono text-faint truncate block">
              {selected.id.slice(0, 10)}...{selected.id.slice(-8)}
            </span>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="text-label hover:text-red-400 transition-colors text-xs flex-shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          onFocus={() => { if (search) setOpen(true); }}
          placeholder={selected ? "Search to change token..." : "Search by name or paste 0x address..."}
          className={inp}
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Dropdown */}
        {open && results.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-dropdown border border-border-default rounded-xl shadow-xl overflow-hidden">
            {results.map((token) => (
              <button
                key={token.id}
                type="button"
                onClick={() => selectToken(token)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors text-left cursor-pointer"
              >
                {token.icon ? (
                  <img src={token.icon} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center text-xs text-label flex-shrink-0">
                    {token.isLSP7 ? "🪙" : "🖼"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-secondary truncate">{token.lsp4TokenName}</span>
                    <span className="text-[10px] text-label flex-shrink-0">{token.lsp4TokenSymbol}</span>
                    <span className="text-[10px] px-1 py-0.5 rounded bg-surface-hover text-muted flex-shrink-0">
                      {token.isLSP7 ? "LSP7" : "LSP8"}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-faint truncate block">
                    {token.id.slice(0, 10)}...{token.id.slice(-8)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* No results */}
        {open && search.length >= 2 && results.length === 0 && !searching && (
          <div className="absolute z-50 mt-1 w-full bg-dropdown border border-border-default rounded-xl shadow-xl px-3 py-3">
            <span className="text-xs text-label">No tokens found. Try a different name or paste a contract address.</span>
          </div>
        )}
      </div>
    </div>
  );
}
