export type Platform = 'Instagram' | 'TikTok' | 'Link';
export type Status = 'To try' | 'Tried';

export interface Tag {
  id: number;
  name: string;
  ideaCount: number;
}

export interface Idea {
  id: number;
  url: string;
  platform: Platform;
  sourceHandle: string;
  note: string;
  hook: string;
  body: string;
  tagIds: number[];
  tags: string[];
  status: Status;
  savedAt: string;
  briefId: number | null;
  videoKey: string | null;
  videoUrl: string | null;
}

/** A stroke is a list of [x, y] points in a normalised 0-100 space. */
export type Stroke = [number, number][];

export interface Shot {
  id: number;
  briefId: number;
  position: number;
  timestamp: string;
  comment: string;
  imageKey: string | null;
  imageUrl: string | null;
  strokes: Stroke[];
}

export interface Brief {
  id: number;
  ideaId: number;
  title: string;
  creator: string;
  due: string;
  intro: string;
  createdAt: string;
  reference: {
    url: string;
    sourceHandle: string;
    platform: Platform;
    status: Status;
    tag: string;
    hook: string;
    body: string;
    videoUrl: string | null;
  };
  shots: Shot[];
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { 'content-type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new ApiError(res.status, detail?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const body = (data: unknown) => JSON.stringify(data);

export const api = {
  listTags: () => request<Tag[]>('/tags'),
  createTag: (name: string) => request<Tag>('/tags', { method: 'POST', body: body({ name }) }),
  deleteTag: (id: number) => request<{ clearedFrom: number }>(`/tags/${id}`, { method: 'DELETE' }),

  listIdeas: () => request<Idea[]>('/ideas'),
  createIdea: (input: { url: string; note?: string; tagIds?: number[] }) =>
    request<Idea>('/ideas', { method: 'POST', body: body(input) }),
  updateIdea: (
    id: number,
    patch: Partial<Pick<Idea, 'note' | 'hook' | 'body' | 'status'>> & { tagIds?: number[] },
  ) => request<Idea>(`/ideas/${id}`, { method: 'PATCH', body: body(patch) }),
  deleteIdea: (id: number) =>
    request<{ deletedBriefId: number | null }>(`/ideas/${id}`, { method: 'DELETE' }),
  uploadIdeaVideo: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<Idea>(`/ideas/${id}/video`, { method: 'POST', body: form });
  },
  clearIdeaVideo: (id: number) => request<Idea>(`/ideas/${id}/video`, { method: 'DELETE' }),

  listBriefs: () => request<Brief[]>('/briefs'),
  getBrief: (id: number) => request<Brief>(`/briefs/${id}`),
  /** Creates the brief for an idea, or returns the one that already exists. */
  openBrief: (ideaId: number) => request<Brief>('/briefs', { method: 'POST', body: body({ ideaId }) }),
  updateBrief: (id: number, patch: Partial<Pick<Brief, 'title' | 'creator' | 'due' | 'intro'>>) =>
    request<Brief>(`/briefs/${id}`, { method: 'PATCH', body: body(patch) }),
  deleteBrief: (id: number) => request<{ ok: true }>(`/briefs/${id}`, { method: 'DELETE' }),
  addShot: (briefId: number) => request<Shot>(`/briefs/${briefId}/shots`, { method: 'POST' }),

  updateShot: (id: number, patch: Partial<Pick<Shot, 'timestamp' | 'comment' | 'strokes'>>) =>
    request<Shot>(`/shots/${id}`, { method: 'PATCH', body: body(patch) }),
  deleteShot: (id: number) => request<{ ok: true }>(`/shots/${id}`, { method: 'DELETE' }),
  uploadShotImage: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<Shot>(`/shots/${id}/image`, { method: 'POST', body: form });
  },
  clearShotImage: (id: number) => request<Shot>(`/shots/${id}/image`, { method: 'DELETE' }),
};
