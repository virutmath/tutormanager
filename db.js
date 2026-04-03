// ==========================================================
// DATABASE LAYER - IndexedDB wrapper
// ==========================================================
const DB_NAME = 'TutorManagerDB';
const DB_VERSION = 4; // bumped for checklists, checklistReviews, roadmaps, settings stores
const STORES = ['classes', 'homework', 'fees', 'templates', 'syllabi', 'checklists', 'checklistReviews', 'roadmaps', 'settings'];

/** Open (or create) the IndexedDB database */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      STORES.forEach(name => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Generic helper – get all records from a store */
async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Put (insert / update) a record */
async function dbPut(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(data);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Delete a record by id */
async function dbDelete(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ==========================================================
// STATE – in-memory mirrors
// ==========================================================
let classes          = [];
let homework         = [];
let fees             = [];
let templates        = [];
let syllabi          = []; // array of { id, classId, startDate, roadmap, sessions: [{content}] }
let checklists       = [];
let checklistReviews = [];
let roadmaps         = [];
let appSettings      = null;

async function loadAll() {
  classes          = await dbGetAll('classes');
  homework         = await dbGetAll('homework');
  fees             = await dbGetAll('fees');
  templates        = await dbGetAll('templates');
  syllabi          = await dbGetAll('syllabi');
  checklists       = await dbGetAll('checklists');
  checklistReviews = await dbGetAll('checklistReviews');
  roadmaps         = await dbGetAll('roadmaps');
  const settingsArr = await dbGetAll('settings');
  appSettings      = settingsArr[0] || null;
}
