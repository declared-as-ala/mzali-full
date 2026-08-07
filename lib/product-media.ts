export const MAX_PRODUCT_IMAGES = 10;

export type ProductMediaStatus = 'saved' | 'selected' | 'uploading' | 'uploaded' | 'failed' | 'removed';

export type ProductMediaItem = {
  clientId: string;
  mediaId: string | null;
  url: string;
  previewUrl?: string;
  file?: File;
  fingerprint?: string;
  position: number;
  isPrimary: boolean;
  status: ProductMediaStatus;
  error?: string;
};

export type PersistedProductMedia = {
  id: string;
  url: string;
  position?: number;
  isPrimary?: boolean;
};

export type ProductMediaPayload = { mediaId: string; position: number; isPrimary: boolean };

export type ProductMediaState = { items: ProductMediaItem[]; initialSignature: string };

export type ProductMediaAction =
  | { type: 'reset'; images: PersistedProductMedia[] }
  | { type: 'add'; items: ProductMediaItem[] }
  | { type: 'upload-start'; clientId: string }
  | { type: 'upload-success'; clientId: string; mediaId: string; url: string }
  | { type: 'upload-failure'; clientId: string; error: string }
  | { type: 'remove'; clientId: string }
  | { type: 'retry'; clientId: string }
  | { type: 'reorder'; clientIds: string[] }
  | { type: 'set-primary'; clientId: string };

const active = (item: ProductMediaItem) => item.status !== 'removed';

function normalize(items: ProductMediaItem[]): ProductMediaItem[] {
  const visible = items.filter(active);
  const primaryId = visible.find((item) => item.isPrimary)?.clientId ?? visible[0]?.clientId;
  let position = 0;
  return items.map((item) => item.status === 'removed' ? { ...item, isPrimary: false } : {
    ...item,
    position: position++,
    isPrimary: item.clientId === primaryId,
  });
}

export function mediaPayload(items: ProductMediaItem[]): ProductMediaPayload[] {
  const seen = new Set<string>();
  return normalize(items)
    .filter((item) => active(item) && item.mediaId && (item.status === 'saved' || item.status === 'uploaded'))
    .filter((item) => {
      if (seen.has(item.mediaId as string)) return false;
      seen.add(item.mediaId as string);
      return true;
    })
    .map((item, position) => ({ mediaId: item.mediaId as string, position, isPrimary: item.isPrimary }));
}

export function mediaSignature(items: ProductMediaItem[]): string {
  return JSON.stringify(mediaPayload(items));
}

export function initialProductMedia(images: PersistedProductMedia[]): ProductMediaState {
  const seen = new Set<string>();
  const ordered = [...images]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .filter((image) => {
      const identity = image.id || image.url;
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .map((image, position): ProductMediaItem => ({
      clientId: `saved:${image.id || image.url}`,
      mediaId: image.id || null,
      url: image.url,
      position,
      isPrimary: image.isPrimary ?? position === 0,
      status: 'saved',
    }));
  const items = normalize(ordered);
  return { items, initialSignature: mediaSignature(items) };
}

export function productMediaReducer(state: ProductMediaState, action: ProductMediaAction): ProductMediaState {
  if (action.type === 'reset') return initialProductMedia(action.images);
  if (action.type === 'add') return { ...state, items: normalize([...state.items, ...action.items]) };

  if (action.type === 'upload-success') {
    const duplicate = state.items.some((item) => active(item) && item.clientId !== action.clientId && item.mediaId === action.mediaId);
    return {
      ...state,
      items: normalize(state.items.map((item) => item.clientId !== action.clientId || item.status === 'removed' ? item : duplicate
        ? { ...item, status: 'removed', mediaId: action.mediaId, url: action.url, file: undefined, error: undefined }
        : { ...item, status: 'uploaded', mediaId: action.mediaId, url: action.url, file: undefined, error: undefined })),
    };
  }

  if (action.type === 'reorder') {
    const byId = new Map(state.items.map((item) => [item.clientId, item]));
    const reordered = action.clientIds.map((id) => byId.get(id)).filter((item): item is ProductMediaItem => Boolean(item));
    const removed = state.items.filter((item) => item.status === 'removed');
    return { ...state, items: normalize([...reordered, ...removed]) };
  }

  return {
    ...state,
    items: normalize(state.items.map((item) => {
      if (item.clientId !== action.clientId) return action.type === 'set-primary' ? { ...item, isPrimary: false } : item;
      switch (action.type) {
        case 'upload-start': return item.status === 'removed' ? item : { ...item, status: 'uploading', error: undefined };
        case 'upload-failure': return item.status === 'removed' ? item : { ...item, status: 'failed', error: action.error };
        case 'remove': return { ...item, status: 'removed', isPrimary: false };
        case 'retry': return { ...item, status: 'selected', error: undefined };
        case 'set-primary': return item.status === 'removed' ? item : { ...item, isPrimary: true };
        default: return item;
      }
    })),
  };
}

export function fileFingerprint(file: File): string {
  return `${file.name.toLocaleLowerCase()}::${file.size}::${file.type}::${file.lastModified}`;
}

export function mediaSaveBlockReason(items: ProductMediaItem[]): string | null {
  if (items.some((item) => item.status === 'selected' || item.status === 'uploading')) return 'Attendez la fin des téléversements.';
  if (items.some((item) => item.status === 'failed')) return 'Réessayez ou retirez les images en échec.';
  if (items.filter(active).some((item) => !item.mediaId)) return 'Une image ne possède pas encore d’identifiant permanent.';
  return null;
}
