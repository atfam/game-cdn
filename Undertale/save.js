// --- Undertale Cloud Save Sync ---
// Works with IndexedDB path: _savedata → FILE_DATA → timestamp
// Automatically syncs every 15s and fills missing save files.

const SAVE_DB_NAME = "/_savedata";
const STORE_NAME = "FILE_DATA";
const KEY_NAME = "timestamp";
const GAME_NAME = "Undertale";
const SYNC_INTERVAL_MS = 15000;

const EXPECTED_FILES = [
  "file0",
  "file8",
  "file9",
  "config.ini",
  "undertale.ini",
  "trophies.ini",
  "decomp_vars.ini",
];

// ---------- DB Helpers ----------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SAVE_DB_NAME);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function readSaveObject(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(KEY_NAME);
    req.onsuccess = async () => {
      let obj = req.result || {};

      // Ensure all expected files exist and are Uint8Array
      let changed = false;
      for (const name of EXPECTED_FILES) {
        if (!obj[name] || !(obj[name] instanceof Uint8Array)) {
          obj[name] = new Uint8Array(); // blank placeholder
          changed = true;
        }
      }

      if (changed) {
        try {
          await writeSaveObject(db, obj);
          console.log("[Save] Initialized missing files in IndexedDB.");
        } catch (err) {
          console.error("[Save] Failed to write initial files:", err);
        }
      }

      resolve(obj);
    };
    req.onerror = () => reject(req.error);
  });
}


async function writeSaveObject(db, obj) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(obj, KEY_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- Network Helpers ----------

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, { ...options, credentials: "include" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// ---------- Server Sync Logic ----------

async function sendToServer(db) {
  try {
    const obj = await readSaveObject(db);
    if (!obj || Object.keys(obj).length === 0) {
      console.log("[Save] No local save found to upload.");
      return false;
    }

    const files = {};
    for (const name of EXPECTED_FILES) {
      const val = obj[name];
      if (val instanceof Uint8Array || val instanceof ArrayBuffer) {
        files[name] =
          "data:application/octet-stream;base64," +
          btoa(String.fromCharCode(...new Uint8Array(val)));
      } else if (typeof val === "string") {
        files[name] = val;
      } else if (val) {
        files[name] = JSON.stringify(val);
      }
    }

    const res = await fetch("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ gameName: GAME_NAME, files }),
    });

    const json = await res.json();
    if (res.ok && json.success) {
      console.log("[Save] ✅ Uploaded", Object.keys(files).length, "files.");
      return true;
    } else {
      console.warn("[Save] ⚠️ Upload failed", json);
      return false;
    }
  } catch (err) {
    console.error("[Save] Upload error:", err);
    return false;
  }
}

async function loadFromServerToDB() {
  try {
    const res = await fetch(
      `/api/load?gameName=${encodeURIComponent(GAME_NAME)}&multipleFiles=true`,
      { credentials: "include" }
    );
    if (!res.ok) {
      console.warn("[Save] No saves found on server.");
      return false;
    }

    const json = await res.json();
    if (!json.success || !json.data) {
      console.warn("[Save] Invalid response from server:", json);
      return false;
    }

    const serverFiles = json.data;
    const db = await openDB();
    let local = await readSaveObject(db);

    // Fill in or overwrite with server files
    for (const name of EXPECTED_FILES) {
      let value = serverFiles[name];
      if (typeof value === "string" && value.startsWith("data:")) {
        const base64 = value.split(",")[1];
        const bytes = atob(base64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        value = arr;
      } else if (!value) {
        value = new Uint8Array(); // blank placeholder
      }
      local[name] = value;
    }

    await writeSaveObject(db, local);
    db.close();
    console.log("[Save] ✅ Loaded files into IndexedDB:", Object.keys(local));
    return true;
  } catch (err) {
    console.error("[Save] Error loading from server:", err);
    return false;
  }
}

// ---------- Sync Flow ----------

async function performSyncOnce() {
  try {
    const db = await openDB();
    const obj = await readSaveObject(db);
    const hasLocal = obj && Object.keys(obj).length > 0;

    if (hasLocal) {
      await sendToServer(db);
    } else {
      console.log("[Save] No local data found, attempting download...");
      await loadFromServerToDB();
    }

    db.close();
  } catch (err) {
    console.error("[Save] Sync failed:", err);
  }
}

// ---------- Startup Loop ----------

(async function startSyncLoop() {
  console.log("[Save] Undertale save sync initialized.");

  // Ensure DB has all files immediately on page load
  const db = await openDB();
  await readSaveObject(db);
  db.close();

  setTimeout(() => {
    performSyncOnce();
    setInterval(performSyncOnce, SYNC_INTERVAL_MS);
  }, 2000);
})();
