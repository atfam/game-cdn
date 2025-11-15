// Wait for Godot's engine to initialize the database first
// Don't open the database immediately on page load

let isAuthenticated = false;

const request = window.indexedDB.open('/userfs', 21);

request.onerror = (event) => {
    console.error("Database error:", event.target.error);
};

request.onsuccess = (event) => {
    const db = event.target.result;
    console.log("Database opened successfully:", db);

    // Check if FILE_DATA exists before trying to use it
    if (!db.objectStoreNames.contains('FILE_DATA')) {
        console.warn("FILE_DATA object store not found - Godot hasn't initialized yet");
        return;
    }

    // Load save data from server if authenticated
    fetch('/api/auth/status')
        .then(response => response.json())
        .then(authData => {
            isAuthenticated = authData.authenticated;

            if (authData.authenticated) {
                return fetch('/api/load?gameName=Buckshot');
            }
            throw new Error('Not authenticated');
        })
        .then(response => response.json())
        .then(result => {
            if (result.success && result.data) {
                console.log("Loaded save data from server:", result.data);

                const filePath = "/userfs/godot/app_userdata/Buckshot Roulette/buckshotroulette_playerstats.shell";
                const transaction = db.transaction('FILE_DATA', 'readwrite');
                const fileDataStore = transaction.objectStore('FILE_DATA');

                let restoredData = result.data;

                // Convert contents back to Int8Array
                if (restoredData.contents) {
                    if (restoredData.contents instanceof Int8Array) {
                        // Already Int8Array
                    } else if (Array.isArray(restoredData.contents)) {
                        restoredData.contents = new Int8Array(restoredData.contents);
                    } else if (typeof restoredData.contents === 'object' && restoredData.contents !== null) {
                        const length = Object.keys(restoredData.contents).length;
                        const arr = new Int8Array(length);
                        for (let i = 0; i < length; i++) {
                            arr[i] = restoredData.contents[i];
                        }
                        restoredData.contents = arr;
                    }
                }

                // Convert timestamp string to Date object
                if (restoredData.timestamp && typeof restoredData.timestamp === 'string') {
                    restoredData.timestamp = new Date(restoredData.timestamp);
                }

                const putRequest = fileDataStore.put(restoredData, filePath);

                putRequest.onsuccess = () => {
                    console.log("Save data restored to IndexedDB");
                };

                putRequest.onerror = () => {
                    console.error("Error restoring save data:", putRequest.error);
                };
            }
        })
        .catch(error => {
            console.log("No save data to load or not authenticated:", error.message);
        });
};




// Save to API before page closes
window.addEventListener('beforeunload', (event) => {
    if (!isAuthenticated) {
        return;
    }

    const request = window.indexedDB.open('/userfs');

    request.onsuccess = (event) => {
        const db = event.target.result;

        if (db && db.objectStoreNames.contains('FILE_DATA')) {
            const transaction = db.transaction('FILE_DATA', 'readonly');
            const fileDataStore = transaction.objectStore('FILE_DATA');
            const filePath = "/userfs/godot/app_userdata/Buckshot Roulette/buckshotroulette_playerstats.shell";
            const getRequest = fileDataStore.get(filePath);

            getRequest.onsuccess = () => {
                if (getRequest.result && getRequest.result.contents) {
                    const data = JSON.stringify({
                        gameName: 'Buckshot',
                        data: getRequest.result
                    });

                    const blob = new Blob([data], { type: 'application/json' });
                    navigator.sendBeacon('/api/save', blob);
                }
            };
        }
    };
});

// Global functions for console testing
window.dbTest = {
    read: function (filePath = "/userfs/godot/app_userdata/Buckshot Roulette/buckshotroulette_playerstats.shell") {
        const request = window.indexedDB.open('/userfs');
        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction('FILE_DATA', 'readonly');
            const store = transaction.objectStore('FILE_DATA');
            const getRequest = store.get(filePath);
            getRequest.onsuccess = () => console.log("Data:", getRequest.result);
        };
    },

    listAll: function () {
        const request = window.indexedDB.open('/userfs');
        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction('FILE_DATA', 'readonly');
            const store = transaction.objectStore('FILE_DATA');
            const getAllRequest = store.getAllKeys();
            getAllRequest.onsuccess = () => console.log("All keys:", getAllRequest.result);
        };
    }
};

console.log("Save system initialized. Use dbTest.read() or dbTest.listAll() to inspect data.");
