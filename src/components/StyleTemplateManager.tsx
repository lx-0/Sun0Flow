"use client";

import { useState, useEffect, useCallback } from "react";
import { TrashIcon, SwatchIcon, PencilIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useToast } from "./Toast";

interface StyleTemplate {
  id: string;
  name: string;
  tags: string;
  sourceSongId: string | null;
  createdAt: string;
}

export function StyleTemplateManager() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<StyleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/style-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
      }
    } catch {
      toast("Failed to load style templates", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  function startEdit(template: StyleTemplate) {
    setEditingId(template.id);
    setEditName(template.name);
    setEditTags(template.tags);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditTags("");
  }

  async function handleSave(id: string) {
    if (!editName.trim() || !editTags.trim()) {
      toast("Name and tags are required", "error");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/style-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), tags: editTags.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates((prev) => prev.map((t) => (t.id === id ? data.template : t)));
        cancelEdit();
        toast("Template updated", "success");
      } else {
        const data = await res.json();
        toast(data.error ?? "Failed to update template", "error");
      }
    } catch {
      toast("Failed to update template", "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/style-templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        toast("Template deleted", "success");
      } else {
        const data = await res.json();
        toast(data.error ?? "Failed to delete template", "error");
      }
    } catch {
      toast("Failed to delete template", "error");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Style Templates</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
          Manage your saved style templates for quick generation
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-12">
          <SwatchIcon className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No style templates yet. Save a style from any song using the &ldquo;Save Style&rdquo; action in the song menu.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4"
            >
              {editingId === template.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Template name"
                    maxLength={100}
                    autoFocus
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <textarea
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="Style tags"
                    rows={2}
                    maxLength={500}
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSave(template.id)}
                      disabled={isSaving}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg transition-colors"
                    >
                      <CheckIcon className="h-4 w-4" />
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      <XMarkIcon className="h-4 w-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
                      <SwatchIcon className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {template.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                        {template.tags}
                      </p>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 inline-block">
                        {new Date(template.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(template)}
                      className="p-2 text-gray-400 hover:text-violet-500 dark:hover:text-violet-400 transition-colors"
                      aria-label={`Edit ${template.name}`}
                      title="Edit template"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(template.id)}
                      disabled={deletingId === template.id}
                      className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                      aria-label={`Delete ${template.name}`}
                      title="Delete template"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        {templates.length} / 50 style templates
      </p>
    </div>
  );
}
