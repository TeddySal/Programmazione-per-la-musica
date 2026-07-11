function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("audioApp", 1);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains("tracks")) {
                db.createObjectStore("tracks");
            }
        }

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveAudio(audio) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction("tracks", "readwrite");
        const store = tx.objectStore("tracks");

        store.put(audio, "current");

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

async function getAudio() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction("tracks", "readonly");
        const store = tx.objectStore("tracks");

        const request = store.get("current");

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function deleteAudio() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction("tracks", "readwrite");
        const store = tx.objectStore("tracks");

        store.delete("current");

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}