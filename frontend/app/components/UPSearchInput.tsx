"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getEnvioEndpoint } from "../lib/envio";
import { useNetwork } from "./NetworkProvider";

interface ProfileResult {
  id: string;   // UP address
  name: string;
  avatar: string | null;
}

const IPFS_GW = "https://api.universalprofile.cloud/ipfs";

async function searchProfiles(query: string, endpoint: string): Promise<ProfileResult[]> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          Profile(
            where: { name: { _ilike: "%${query.replace(/"/g, "")}%" } }
            limit: 8
            order_by: { name: asc }
          ) {
            id
            name
            profileImages(limit: 1) { url }
          }
        }`,
      }),
    });
    const json = await res.json();
    return (json?.data?.Profile ?? []).map((p: any) => ({
      id: p.id,
      name: p.name ?? "",
      avatar: p.profileImages?.[0]?.url
        ? `${IPFS_GW}/${p.profileImages[0].url.replace("ipfs://", "")}`
        : null,
    }));
  } catch {
    return [];
  }
}

async function fetchProfileById(address: string, endpoint: string): Promise<ProfileResult | null> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{
          Profile_by_pk(id: "${address.toLowerCase()}") {
            id name profileImages(limit: 1) { url }
          }
        }`,
      }),
    });
    const json = await res.json();
    const p = json?.data?.Profile_by_pk;
    if (!p) return null;
    return {
      id: p.id,
      name: p.name ?? "",
      avatar: p.profileImages?.[0]?.url
        ? `${IPFS_GW}/${p.profileImages[0].url.replace("ipfs://", "")}`
        : null,
    };
  } catch {
    return null;
  }
}

interface Props {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
  className?: string;
}

export default function UPSearchInput({ value, onChange, placeholder, className }: Props) {
  const { networkId } = useNetwork();
  const endpoint = getEnvioEndpoint(networkId);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [selected, setSelected] = useState<ProfileResult | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load profile for a pre-set address
  useEffect(() => {
    if (!value || !value.startsWith("0x") || value.length !== 42) {
      if (!value) setSelected(null);
      return;
    }
    if (selected?.id?.toLowerCase() === value.toLowerCase()) return;
    fetchProfileById(value, endpoint).then(setSelected).catch(() => setSelected(null));
  }, [value, endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setLoading(false); return; }

    // Direct address lookup
    if (q.startsWith("0x") && q.length === 42) {
      setLoading(true);
      fetchProfileById(q, endpoint)
        .then((p) => { setResults(p ? [p] : []); setLoading(false); })
        .catch(() => { setResults([]); setLoading(false); });
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchProfiles(q, endpoint);
      setResults(r);
      setLoading(false);
    }, 300);
  }, [endpoint]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(p: ProfileResult) {
    setSelected(p);
    onChange(p.id);
    setSearch("");
    setResults([]);
    setOpen(false);
  }

  function clear() {
    setSelected(null);
    onChange("");
    setSearch("");
    setResults([]);
  }

  const inp = "w-full bg-surface border border-border-default rounded-lg px-3 py-2.5 text-sm text-secondary focus:outline-none focus:border-purple-400 transition-colors";

  if (selected) {
    return (
      <div className={`flex items-center gap-2 bg-surface border border-border-default rounded-lg px-3 py-2 ${className ?? ""}`}>
        {selected.avatar ? (
          <img src={selected.avatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-purple-500/20 shrink-0 flex items-center justify-center text-[10px] text-purple-400">UP</div>
        )}
        <span className="text-xs text-secondary flex-1 truncate">{selected.name || selected.id.slice(0, 10) + "…"}</span>
        <span className="text-[10px] text-label font-mono hidden sm:inline">{selected.id.slice(0, 6)}…{selected.id.slice(-4)}</span>
        <button type="button" onClick={clear} className="text-label hover:text-red-400 text-xs ml-1">✕</button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); doSearch(e.target.value); }}
        onFocus={() => { if (search) setOpen(true); }}
        placeholder={placeholder ?? "Search by name or paste 0x address…"}
        className={inp}
      />
      {open && (loading || results.length > 0) && (
        <div className="absolute z-50 top-full mt-1 w-full bg-dropdown border border-border-default rounded-xl shadow-2xl overflow-hidden">
          {loading && <div className="px-3 py-2 text-xs text-label">Searching…</div>}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors text-left"
            >
              {p.avatar ? (
                <img src={p.avatar} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-purple-500/20 shrink-0 flex items-center justify-center text-[10px] text-purple-400">UP</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-secondary truncate">{p.name}</p>
                <p className="text-[10px] text-label font-mono">{p.id.slice(0, 8)}…{p.id.slice(-6)}</p>
              </div>
            </button>
          ))}
          {!loading && results.length === 0 && search.trim() && (
            <div className="px-3 py-2 text-xs text-label">No profiles found</div>
          )}
        </div>
      )}
    </div>
  );
}
