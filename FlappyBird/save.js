// Wait for Godot's engine to initialize the database first
// Don't open the database immediately on page load

let isAuthenticated = false;

// Helper function to safely access storage
function getStorageItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.warn("localStorage access denied, using sessionStorage:", e);
        try {
            return sessionStorage.getItem(key);
        } catch (e2) {
            console.error("Both localStorage and sessionStorage blocked:", e2);
            return null;
        }
    }
}

function setStorageItem(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn("localStorage access denied, using sessionStorage:", e);
        try {
            sessionStorage.setItem(key, value);
        } catch (e2) {
            console.error("Both localStorage and sessionStorage blocked:", e2);
        }
    }
}

// Function to wait for Godot engine initialization
function waitForGodotInit() {
    return new Promise((resolve) => {
        const originalLog = console.log;
        console.log = function (...args) {
            originalLog.apply(console, args);
            const message = args.join(' ');
            if (message.includes('OpenGL API OpenGL ES 3.0 (WebGL 2.0)') ||
                message.includes('Using Device: WebKit - WebKit WebGL')) {
                console.log = originalLog; // Restore original console.log
                resolve();
            }
        };
    });
}

// Function to access the database after Godot initializes it
async function TestOpenDatabase() {
    const request = indexedDB.databases().then((dbs) => {
        const dbInfo = dbs.find(db => db.name === '/userfs');
        if (dbInfo) {
            console.log("Database '/userfs' found:", dbInfo);
        } else {
            window.location.href = '/SaveGen?redirect=/FlappyBird/';
        }
    })
}

(async () => {
    const firstTimeFlag = getStorageItem('flappybirdfirsttime');
    
    if (!firstTimeFlag || firstTimeFlag === 'yes') {
        console.log("Waiting for Godot engine to initialize...");
        await TestOpenDatabase();
        await waitForGodotInit();
        setStorageItem('flappybirdfirsttime', 'no');
        console.log("Godot engine initialized, proceeding with database operations...");
        window.location.reload();
        return;
    } else {

        function waitForflappbird() {
            return new Promise((resolve) => {
                const originalLog = console.log;
                console.log = function (...args) {
                    originalLog.apply(console, args);
                    const message = args.join(' ');
                    if (message.includes('HELLO')) {
                        console.log = originalLog; // Restore original console.log
                        setTimeout(() => {
                            window.location.reload();
                        }, 10000);
                    }
                };
            });
        }

        const request = indexedDB.open('/userfs', 21);

        request.onerror = (event) => {
            console.error("Database error:", event.target.error);
        };

        request.onsuccess = async (event) => {
            const db = event.target.result;
            console.log("Database opened successfully:", db);

            if (!db.objectStoreNames.contains('FILE_DATA')) {
                window.location.href = '/Test?redirect=/FlappyBird/';
            }

            const transaction = db.transaction('FILE_DATA', 'readwrite');
            const fileDataStore = transaction.objectStore('FILE_DATA');
            const filePath2 = "/userfs/godot/app_userdata/Flappy Bird Remake";
            let E = new Date().toISOString()
            fileDataStore.put({
                timestamp: new Date(E),
                mode: 16893
            }, filePath2);
            // Load save data from server if authenticated
            fetch('/api/auth/status')
                .then(response => response.json())
                .then(authData => {
                    isAuthenticated = authData.authenticated;

                    if (authData.authenticated) {
                        return fetch('/api/load?gameName=FlappyBird');
                    }
                    throw new Error('Not authenticated');
                })
                .then(response => response.json())
                .then(result => {
                    if (result.success && result.data) {
                        console.log("Loaded save data from server:", result.data);

                        const filePath = "/userfs/godot/app_userdata/Flappy Bird Remake/highscore.save";
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

            // Save to server every 15 seconds if authenticated
            setInterval(() => {
                if (!isAuthenticated) {
                    return;
                }

                if (db && db.objectStoreNames.contains('FILE_DATA')) {
                    const transaction = db.transaction('FILE_DATA', 'readonly');
                    const fileDataStore = transaction.objectStore('FILE_DATA');
                    const filePath = "/userfs/godot/app_userdata/Flappy Bird Remake/highscore.save";
                    const getRequest = fileDataStore.get(filePath);

                    getRequest.onsuccess = () => {
                        if (getRequest.result && getRequest.result.contents) {
                            const data = JSON.stringify({
                                gameName: 'FlappyBird',
                                data: getRequest.result
                            });

                            fetch('/api/save', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: data
                            }).then(() => {
                                console.log('Save data synced to server');
                            }).catch(error => {
                                console.error('Failed to sync save data:', error);
                            });
                        }
                    };
                }
            }, 15000);
        };
    }
})();