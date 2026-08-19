// Persistent local store for rendered lyric videos. Uses IndexedDB (not
// localStorage) because the clips are multi-MB binary blobs. Keyed per song so
// each release keeps its own library; nothing is lost on navigation or reload,
// and each one can be deleted individually.

const DB_NAME = "rollout";
const STORE = "lyricvideos";
const VERSION = 1;

export type SavedVideo = {
  id: string;
  song: string;      // slug: "{title}-{artist}"
  label: string;
  bg: string;        // "cover" | "broll"
  createdAt: number;
  blob: Blob;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveVideo(v: SavedVideo): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(v);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listVideos(song: string): Promise<SavedVideo[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out: SavedVideo[] = [];
    const tx = db.transaction(STORE, "readonly");
    const cursorReq = tx.objectStore(STORE).openCursor();
    cursorReq.onsuccess = () => {
      const c = cursorReq.result;
      if (c) {
        const val = c.value as SavedVideo;
        if (val.song === song) out.push(val);
        c.continue();
      } else {
        resolve(out.sort((a, b) => b.createdAt - a.createdAt));
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

export async function deleteVideo(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Wipe every saved clip. Called when a different account signs in on this
// browser, so one artist's videos never leak into another's workspace.
export async function clearAllVideos(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
