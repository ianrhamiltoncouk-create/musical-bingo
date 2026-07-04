export interface SavedPlaylist {
  id: string;
  name: string;
  timestamp: number;
  tracks: { id: number; name: string; file: File }[];
}

const DB_NAME = 'MusicalBingoDB';
const STORE_NAME = 'playlists';

const openIDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const savePlaylistToIDB = async (name: string, tracks: { id: number; name: string; file: File }[]): Promise<void> => {
  try {
    const db = await openIDB();
    const id = 'pl-' + Date.now();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Store tracks directly (IndexedDB handles File / Blob objects natively)
    store.put({
      id,
      name,
      timestamp: Date.now(),
      tracks
    });

    // Prune to keep only the last 3 items
    transaction.oncomplete = async () => {
      const all = await getPlaylistsFromIDB();
      if (all.length > 3) {
        const toDelete = all.slice(3);
        const delTx = db.transaction(STORE_NAME, 'readwrite');
        const delStore = delTx.objectStore(STORE_NAME);
        for (const item of toDelete) {
          delStore.delete(item.id);
        }
      }
    };
  } catch (e) {
    console.error('IndexedDB Save Error:', e);
  }
};

export const getPlaylistsFromIDB = async (): Promise<SavedPlaylist[]> => {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const sorted = (request.result || []).sort((a: any, b: any) => b.timestamp - a.timestamp);
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('IndexedDB Read Error:', e);
    return [];
  }
};

export const deletePlaylistFromIDB = async (id: string): Promise<void> => {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('IndexedDB Delete Error:', e);
  }
};
