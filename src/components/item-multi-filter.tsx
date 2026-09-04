import { ChevronDown, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';

export type ItemFilterOption = {
  id: string;
  code: string;
  name: string;
};

export function matchesSelectedItems(itemIds: string[], selectedIds: string[]): boolean {
  if (!selectedIds.length) return true;
  const selected = new Set(selectedIds);
  return itemIds.some((id) => selected.has(id));
}

export function ItemMultiFilter({
  label,
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  options: ItemFilterOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const visibleOptions = useMemo(
    () =>
      normalizedSearch
        ? options.filter((option) =>
            `${option.code} ${option.name}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch),
          )
        : options,
    [normalizedSearch, options],
  );

  const summary =
    selectedIds.length === 0
      ? 'Todos os itens'
      : selectedIds.length === 1
        ? (() => {
            const option = options.find((entry) => entry.id === selectedIds[0]);
            return option ? `${option.code} · ${option.name}` : '1 item selecionado';
          })()
        : `${selectedIds.length} itens selecionados`;

  const toggle = (id: string) => {
    onChange(selected.has(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id]);
  };

  return (
    <details className="item-multi-filter">
      <summary aria-label={label} title={summary}>
        <span>{summary}</span>
        <ChevronDown size={15} />
      </summary>
      <div className="item-multi-filter__menu">
        <label className="item-multi-filter__search">
          <Search size={15} />
          <input
            aria-label={`Buscar ${label.toLocaleLowerCase('pt-BR')}`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar codigo ou nome"
          />
        </label>
        <div className="item-multi-filter__toolbar">
          <strong>Itens neste modulo</strong>
          {selectedIds.length > 0 && (
            <button type="button" onClick={() => onChange([])}>
              <X size={14} /> Limpar
            </button>
          )}
        </div>
        <div className="item-multi-filter__options">
          {visibleOptions.length ? (
            visibleOptions.map((option) => (
              <label key={option.id}>
                <input
                  type="checkbox"
                  checked={selected.has(option.id)}
                  onChange={() => toggle(option.id)}
                />
                <span>
                  <strong>{option.code}</strong>
                  <small>{option.name}</small>
                </span>
              </label>
            ))
          ) : (
            <small className="item-multi-filter__empty">Nenhum item encontrado.</small>
          )}
        </div>
      </div>
      <style>{`
        .item-multi-filter { position: relative; min-width: 220px; }
        .item-multi-filter > summary { box-sizing: border-box; min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); cursor: pointer; list-style: none; }
        .item-multi-filter > summary::-webkit-details-marker { display: none; }
        .item-multi-filter > summary span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .item-multi-filter[open] > summary svg { transform: rotate(180deg); }
        .item-multi-filter__menu { position: absolute; z-index: 60; top: calc(100% + 6px); left: 0; width: min(390px, 88vw); padding: 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); box-shadow: 0 16px 36px rgb(15 23 42 / 18%); }
        .item-multi-filter__search { display: flex; align-items: center; gap: 7px; padding: 0 9px; border: 1px solid var(--border); border-radius: 8px; }
        .item-multi-filter__search input { width: 100%; min-height: 36px; border: 0; outline: 0; background: transparent; color: inherit; }
        .item-multi-filter__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 2px 6px; }
        .item-multi-filter__toolbar button { display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent; color: var(--muted); cursor: pointer; }
        .item-multi-filter__options { max-height: 280px; overflow: auto; display: grid; gap: 2px; }
        .item-multi-filter__options > label { display: flex; align-items: flex-start; gap: 8px; padding: 8px; border-radius: 8px; cursor: pointer; }
        .item-multi-filter__options > label:hover { background: rgb(15 23 42 / 5%); }
        .item-multi-filter__options > label input { margin-top: 3px; }
        .item-multi-filter__options > label span { display: grid; min-width: 0; }
        .item-multi-filter__options > label small { color: var(--muted); white-space: normal; }
        .item-multi-filter__empty { padding: 12px 8px; color: var(--muted); }
      `}</style>
    </details>
  );
}
