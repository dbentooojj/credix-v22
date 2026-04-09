"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Settings2,
} from "lucide-react";
import { ModalBase, ModalBtnGhost, ModalBtnPrimary, modalInputClass } from "./ModalBase";

export type FinanceCategoryType = "income" | "expense";

export type FinanceCategory = {
  id: string;
  name: string;
  emoji: string;
  type: FinanceCategoryType;
  active: boolean;
  isPreset: boolean;
};

export type FinanceCategoryMeta = FinanceCategory;

function normalizeCategoryText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function readJsonOrThrow(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || "Nao foi possivel concluir a operacao.");
  }
  return payload;
}

export function formatFinanceCategoryLabel(categoryMeta?: FinanceCategoryMeta | null, fallbackCategory?: string | null) {
  if (categoryMeta) {
    return `${categoryMeta.emoji ? `${categoryMeta.emoji} ` : ""}${categoryMeta.name}`;
  }

  const raw = String(fallbackCategory ?? "").trim();
  return raw || "Sem categoria";
}

export function useFinanceCategoryCatalog(type: FinanceCategoryType) {
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/finance/categories?type=${type}&includeInactive=true`);
      const payload = await readJsonOrThrow(response);
      setCategories(Array.isArray(payload.data) ? payload.data : []);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createCategory = useCallback(async (input: { name: string; emoji?: string }) => {
    const response = await fetch("/api/finance/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        name: input.name.trim(),
        emoji: (input.emoji ?? "").trim(),
      }),
    });
    const payload = await readJsonOrThrow(response);
    await refresh();
    return payload.data as FinanceCategory;
  }, [refresh, type]);

  const updateCategory = useCallback(async (id: string, input: { name?: string; emoji?: string }) => {
    const response = await fetch(`/api/finance/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await readJsonOrThrow(response);
    await refresh();
    return payload.data as FinanceCategory;
  }, [refresh]);

  const toggleArchive = useCallback(async (id: string, archived: boolean) => {
    const response = await fetch(`/api/finance/categories/${id}/archive`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    const payload = await readJsonOrThrow(response);
    await refresh();
    return payload.data as FinanceCategory;
  }, [refresh]);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.active),
    [categories],
  );

  return {
    categories,
    activeCategories,
    loading,
    refresh,
    createCategory,
    updateCategory,
    toggleArchive,
  };
}

type FinanceCategoryPickerProps = {
  categories: FinanceCategory[];
  loading?: boolean;
  valueCategoryId?: string;
  fallbackLabel?: string;
  onChange: (category: FinanceCategory) => void;
  onCreateCategory: (input: { name: string; emoji?: string }) => Promise<FinanceCategory>;
  onManage: () => void;
};

export function FinanceCategoryPicker({
  categories,
  loading = false,
  valueCategoryId,
  fallbackLabel,
  onChange,
  onCreateCategory,
  onManage,
}: FinanceCategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draftEmoji, setDraftEmoji] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === valueCategoryId) ?? null,
    [categories, valueCategoryId],
  );

  const searchNormalized = normalizeCategoryText(search);
  const visibleCategories = useMemo(() => {
    return categories.filter((category) => {
      if (!category.active && category.id !== valueCategoryId) {
        return false;
      }

      if (!searchNormalized) {
        return true;
      }

      return normalizeCategoryText(category.name).includes(searchNormalized);
    });
  }, [categories, searchNormalized, valueCategoryId]);

  const hasExactMatch = useMemo(() => {
    if (!searchNormalized) {
      return true;
    }

    return categories.some((category) => (
      category.active
      && normalizeCategoryText(category.name) === searchNormalized
    ));
  }, [categories, searchNormalized]);

  async function handleCreateCategory() {
    const name = search.trim();
    if (!name) return;

    try {
      setSaving(true);
      setErrorMessage("");
      const created = await onCreateCategory({
        name,
        emoji: draftEmoji.trim(),
      });
      onChange(created);
      setOpen(false);
      setSearch("");
      setDraftEmoji("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel criar a categoria.");
    } finally {
      setSaving(false);
    }
  }

  const triggerLabel = selectedCategory
    ? formatFinanceCategoryLabel(selectedCategory)
    : (fallbackLabel?.trim() || "Selecione uma categoria");

  return (
    <div className="space-y-2">
      <div className="relative" ref={rootRef}>
        <button
          className={`${modalInputClass} flex items-center justify-between gap-3 text-left ${selectedCategory ? "text-slate-800" : "text-slate-400"}`}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_48px_rgba(15,23,42,0.14)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                autoFocus
                className={`${modalInputClass} pl-10`}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar categoria"
                value={search}
              />
            </div>

            <div className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">
              {loading ? (
                <p className="px-2 py-3 text-sm text-slate-500">Carregando categorias...</p>
              ) : visibleCategories.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-500">Nenhuma categoria encontrada.</p>
              ) : (
                visibleCategories.map((category) => (
                  <button
                    key={category.id}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      category.id === valueCategoryId
                        ? "bg-[#4F7EF7]/10 text-[#2b5fe2]"
                        : "text-slate-700 hover:bg-slate-50"
                    } ${!category.active ? "opacity-70" : ""}`}
                    onClick={() => {
                      onChange(category);
                      setOpen(false);
                      setSearch("");
                    }}
                    type="button"
                  >
                    <span className="truncate">{formatFinanceCategoryLabel(category)}</span>
                    {!category.active ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Arquivada</span>
                    ) : null}
                  </button>
                ))
              )}
            </div>

            {!hasExactMatch && search.trim() ? (
              <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-3">
                <p className="text-sm font-semibold text-slate-700">Criar categoria "{search.trim()}"</p>
                <div className="mt-3 grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                  <input
                    className={modalInputClass}
                    maxLength={16}
                    onChange={(event) => setDraftEmoji(event.target.value)}
                    placeholder="Emoji"
                    value={draftEmoji}
                  />
                  <input
                    className={modalInputClass}
                    onChange={(event) => setSearch(event.target.value)}
                    value={search}
                  />
                </div>
                {errorMessage ? <p className="mt-2 text-xs text-red-500">{errorMessage}</p> : null}
                <div className="mt-3 flex justify-end">
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#4F7EF7] px-4 text-sm font-semibold text-white transition hover:bg-[#3b6ef0] disabled:opacity-60"
                    disabled={saving}
                    onClick={handleCreateCategory}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    {saving ? "Criando..." : "Criar e selecionar"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
        onClick={onManage}
        type="button"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Gerenciar categorias
      </button>
    </div>
  );
}

type FinanceCategoryManagerModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  categories: FinanceCategory[];
  onUpdateCategory: (id: string, input: { name?: string; emoji?: string }) => Promise<FinanceCategory>;
  onToggleArchive: (id: string, archived: boolean) => Promise<FinanceCategory>;
};

export function FinanceCategoryManagerModal({
  open,
  onClose,
  title,
  categories,
  onUpdateCategory,
  onToggleArchive,
}: FinanceCategoryManagerModalProps) {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [busyId, setBusyId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setSearch("");
      setEditingId("");
      setEditName("");
      setEditEmoji("");
      setBusyId("");
      setErrorMessage("");
    }
  }, [open]);

  const filteredCategories = useMemo(() => {
    const normalizedSearch = normalizeCategoryText(search);
    if (!normalizedSearch) {
      return categories;
    }

    return categories.filter((category) => (
      normalizeCategoryText(category.name).includes(normalizedSearch)
    ));
  }, [categories, search]);

  const activeCategories = filteredCategories.filter((category) => category.active);
  const archivedCategories = filteredCategories.filter((category) => !category.active);

  async function handleSaveEdition(categoryId: string) {
    try {
      setBusyId(categoryId);
      setErrorMessage("");
      await onUpdateCategory(categoryId, {
        name: editName.trim(),
        emoji: editEmoji.trim(),
      });
      setEditingId("");
      setEditName("");
      setEditEmoji("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel atualizar a categoria.");
    } finally {
      setBusyId("");
    }
  }

  async function handleArchiveToggle(categoryId: string, archived: boolean) {
    try {
      setBusyId(categoryId);
      setErrorMessage("");
      await onToggleArchive(categoryId, archived);
      if (editingId === categoryId) {
        setEditingId("");
        setEditName("");
        setEditEmoji("");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nao foi possivel atualizar a categoria.");
    } finally {
      setBusyId("");
    }
  }

  function startEditing(category: FinanceCategory) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditEmoji(category.emoji);
    setErrorMessage("");
  }

  function renderCategoryRow(category: FinanceCategory) {
    const isEditing = editingId === category.id;
    const isBusy = busyId === category.id;

    return (
      <div key={category.id} className="rounded-2xl border border-slate-200 bg-white p-3">
        {isEditing ? (
          <div className="grid gap-3 sm:grid-cols-[100px_minmax(0,1fr)_auto] sm:items-center">
            <input
              className={modalInputClass}
              maxLength={16}
              onChange={(event) => setEditEmoji(event.target.value)}
              placeholder="Emoji"
              value={editEmoji}
            />
            <input
              className={modalInputClass}
              maxLength={120}
              onChange={(event) => setEditName(event.target.value)}
              placeholder="Nome da categoria"
              value={editName}
            />
            <div className="flex gap-2">
              <button
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                onClick={() => {
                  setEditingId("");
                  setEditName("");
                  setEditEmoji("");
                }}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#4F7EF7] px-3 text-sm font-semibold text-white transition hover:bg-[#3b6ef0] disabled:opacity-60"
                disabled={isBusy}
                onClick={() => void handleSaveEdition(category.id)}
                type="button"
              >
                {isBusy ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-slate-800">{formatFinanceCategoryLabel(category)}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${category.isPreset ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                  {category.isPreset ? "Padrao" : "Custom"}
                </span>
                {!category.active ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Arquivada</span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!category.isPreset ? (
                <button
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  onClick={() => startEditing(category)}
                  type="button"
                >
                  <PencilLine className="h-3.5 w-3.5" />
                  Editar
                </button>
              ) : null}
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                disabled={isBusy}
                onClick={() => void handleArchiveToggle(category.id, category.active)}
                type="button"
              >
                {category.active ? <Archive className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {category.active ? "Arquivar" : "Reativar"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <ModalBase
      bodyClassName="space-y-4"
      footer={(
        <>
          <ModalBtnGhost onClick={onClose}>Fechar</ModalBtnGhost>
          <ModalBtnPrimary className="gap-2" onClick={onClose}>
            <Check className="h-4 w-4" />
            Concluir
          </ModalBtnPrimary>
        </>
      )}
      onClose={onClose}
      open={open}
      size="max-w-3xl"
      title={title}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input
          className={`${modalInputClass} pl-10`}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar categorias"
          value={search}
        />
      </div>

      {errorMessage ? <p className="text-sm text-red-500">{errorMessage}</p> : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Ativas</h4>
          <span className="text-xs font-semibold text-slate-400">{activeCategories.length} categoria(s)</span>
        </div>
        <div className="space-y-3">
          {activeCategories.length > 0 ? activeCategories.map(renderCategoryRow) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              Nenhuma categoria ativa encontrada.
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold uppercase tracking-wide text-slate-500">Arquivadas</h4>
          <span className="text-xs font-semibold text-slate-400">{archivedCategories.length} categoria(s)</span>
        </div>
        <div className="space-y-3">
          {archivedCategories.length > 0 ? archivedCategories.map(renderCategoryRow) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
              Nenhuma categoria arquivada.
            </div>
          )}
        </div>
      </section>
    </ModalBase>
  );
}
