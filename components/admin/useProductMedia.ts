'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  fileFingerprint,
  initialProductMedia,
  MAX_PRODUCT_IMAGES,
  mediaPayload,
  mediaSaveBlockReason,
  mediaSignature,
  PersistedProductMedia,
  ProductMediaItem,
  productMediaReducer,
} from '@/lib/product-media';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

function newClientId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `upload:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function useProductMedia() {
  const [state, dispatch] = useReducer(productMediaReducer, undefined, () => initialProductMedia([]));
  const stateRef = useRef(state);
  const controllers = useRef(new Map<string, AbortController>());
  stateRef.current = state;

  const upload = useCallback(async (clientId: string, file: File) => {
    const controller = new AbortController();
    controllers.current.set(clientId, controller);
    dispatch({ type: 'upload-start', clientId });
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('uploadId', clientId);
      const response = await fetch('/api/admin/upload', { method: 'POST', body: form, signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.id || !data?.url) throw new Error(data?.error ?? 'Téléversement impossible');
      dispatch({ type: 'upload-success', clientId, mediaId: String(data.id), url: String(data.url) });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        dispatch({ type: 'upload-failure', clientId, error: error instanceof Error ? error.message : 'Téléversement impossible' });
      }
    } finally {
      controllers.current.delete(clientId);
    }
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const current = stateRef.current.items.filter((item) => item.status !== 'removed');
    const fingerprints = new Set(current.map((item) => item.fingerprint).filter(Boolean));
    const accepted: ProductMediaItem[] = [];
    const errors: string[] = [];

    for (const file of files) {
      if (current.length + accepted.length >= MAX_PRODUCT_IMAGES) {
        errors.push(`Maximum ${MAX_PRODUCT_IMAGES} images par produit.`);
        break;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        errors.push(`${file.name} : format accepté JPEG, PNG ou WEBP.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        errors.push(`${file.name} : taille maximale 8 Mo.`);
        continue;
      }
      const fingerprint = fileFingerprint(file);
      if (fingerprints.has(fingerprint)) {
        errors.push(`${file.name} : image déjà sélectionnée.`);
        continue;
      }
      fingerprints.add(fingerprint);
      accepted.push({
        clientId: newClientId(), mediaId: null, url: '', previewUrl: URL.createObjectURL(file), file,
        fingerprint, position: current.length + accepted.length, isPrimary: current.length + accepted.length === 0,
        status: 'selected',
      });
    }

    if (accepted.length) {
      dispatch({ type: 'add', items: accepted });
      accepted.forEach((item) => void upload(item.clientId, item.file as File));
    }
    return errors;
  }, [upload]);

  const remove = useCallback((clientId: string) => {
    controllers.current.get(clientId)?.abort();
    const item = stateRef.current.items.find((candidate) => candidate.clientId === clientId);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    dispatch({ type: 'remove', clientId });
  }, []);

  const retry = useCallback((clientId: string) => {
    const item = stateRef.current.items.find((candidate) => candidate.clientId === clientId);
    if (!item?.file) return;
    dispatch({ type: 'retry', clientId });
    void upload(clientId, item.file);
  }, [upload]);

  const reset = useCallback((images: PersistedProductMedia[]) => dispatch({ type: 'reset', images }), []);
  const reorder = useCallback((clientIds: string[]) => dispatch({ type: 'reorder', clientIds }), []);
  const setPrimary = useCallback((clientId: string) => dispatch({ type: 'set-primary', clientId }), []);

  useEffect(() => () => {
    controllers.current.forEach((controller) => controller.abort());
    stateRef.current.items.forEach((item) => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); });
  }, []);

  const visibleItems = useMemo(() => state.items.filter((item) => item.status !== 'removed'), [state.items]);
  return {
    items: visibleItems,
    removedItems: state.items.filter((item) => item.status === 'removed'),
    payload: mediaPayload(state.items),
    isDirty: mediaSignature(state.items) !== state.initialSignature || state.items.some((item) => ['selected', 'uploading', 'failed'].includes(item.status)),
    saveBlockReason: mediaSaveBlockReason(state.items),
    addFiles,
    remove,
    retry,
    reset,
    reorder,
    setPrimary,
  };
}
