import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, type Idea, type Tag } from './api';

/**
 * The whole library in one place.
 *
 * The board loads every idea rather than asking the server to filter, because
 * the tag chips show counts scoped to the *other two* filters — deriving those
 * from one in-memory list is both simpler and correct, and this is a small
 * team's reading list, not a feed.
 */
interface Library {
  ideas: Idea[];
  tags: Tag[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  replaceIdea: (idea: Idea) => void;
  addIdea: (input: { url: string; note?: string; tagIds?: number[] }) => Promise<void>;
  patchIdea: (id: number, patch: Parameters<typeof api.updateIdea>[1]) => Promise<void>;
  removeIdea: (id: number) => Promise<void>;
  downloadIdeaVideo: (id: number) => Promise<void>;
  createTag: (name: string) => Promise<Tag | null>;
  removeTag: (id: number) => Promise<void>;
}

const Ctx = createContext<Library | null>(null);

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextIdeas, nextTags] = await Promise.all([api.listIdeas(), api.listTags()]);
      setIdeas(nextIdeas);
      setTags(nextTags);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const replaceIdea = useCallback((idea: Idea) => {
    setIdeas((list) => list.map((x) => (x.id === idea.id ? idea : x)));
  }, []);

  const value = useMemo<Library>(
    () => ({
      ideas,
      tags,
      loading,
      error,
      refresh,
      replaceIdea,

      addIdea: async (input) => {
        const created = await api.createIdea(input);
        setIdeas((list) => [created, ...list]);
        // Tag counts move whenever an idea does.
        setTags(await api.listTags());
      },

      // Card edits are frequent and independent, so patch the one row in place
      // rather than refetching the board on every keystroke.
      patchIdea: async (id, patch) => {
        const updated = await api.updateIdea(id, patch);
        replaceIdea(updated);
        if ('tagIds' in patch) setTags(await api.listTags());
      },

      removeIdea: async (id) => {
        await api.deleteIdea(id);
        setIdeas((list) => list.filter((x) => x.id !== id));
        setTags(await api.listTags());
      },

      // Server-side download; the video attaches to the idea (used in the brief),
      // the card preview is unaffected. Throws so the caller can fall back.
      downloadIdeaVideo: async (id) => {
        const updated = await api.downloadIdeaVideo(id);
        replaceIdea(updated);
      },

      createTag: async (name) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const tag = await api.createTag(trimmed);
        setTags(await api.listTags());
        return tag;
      },

      // Deleting a tag clears it off every idea using it, so the board is stale
      // afterwards no matter what — refetch both.
      removeTag: async (id) => {
        await api.deleteTag(id);
        await refresh();
      },
    }),
    [ideas, tags, loading, error, refresh, replaceIdea],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLibrary(): Library {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLibrary must be used inside a LibraryProvider');
  return ctx;
}
