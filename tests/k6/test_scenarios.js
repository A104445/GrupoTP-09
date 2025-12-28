import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
    vus: 1,
    duration: '10s',
    noConnectionReuse: false,
    // Create new cookie jar per iteration
    nocookiesreset: false,
};

// Configuration
const APP_IP = '34.168.251.157';
const APP_PORT = __ENV.APP_PORT || '3000';
const BASE_URL = `http://${APP_IP}:${APP_PORT}`;

// Helper for random string
function randomString(length) {
    const charset = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let res = '';
    for (let i = 0; i < length; i++) {
        res += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return res;
}

const APP_ADMIN = __ENV.APP_ADMIN || `user${randomString(8)}`;  // e.g. "usera1b2c3d4" - 12 chars, matches ^\w+$
const APP_ADMIN_PASSWORD = __ENV.APP_ADMIN_PASSWORD || `password${randomString(4)}`;  // e.g. "passworda1b2" - 12 chars, min 8
const APP_ADMIN_DISPLAY_NAME = __ENV.APP_ADMIN_DISPLAY_NAME || `Admin${randomString(5)}`;  // e.g. "Adminabc12" - 10 chars, min 3
const APP_ADMIN_UNIT = __ENV.APP_ADMIN_UNIT || 'metric';  // Must be 'metric' or 'imperial'

console.log(`Admin Username: ${APP_ADMIN}`);
console.log(`Admin Password: ${APP_ADMIN_PASSWORD}`);

export default function () {
    let authSession;
    let apiKey;
    let flightId;

    group('Setup User', function () {
        const url = `${BASE_URL}/api/users/setup`;

        // Use form-urlencoded instead of JSON (matching what SvelteKit forms expect)
        const payload = `username=${encodeURIComponent(APP_ADMIN)}&password=${encodeURIComponent(APP_ADMIN_PASSWORD)}&displayName=${encodeURIComponent(APP_ADMIN_DISPLAY_NAME)}&unit=${encodeURIComponent(APP_ADMIN_UNIT)}`;

        const params = {
            headers: {
                'Origin': BASE_URL,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            redirects: 0,
        };

        const res = http.post(url, payload, params);

        console.log(`Setup response status: ${res.status}`);

        // Check if owner already exists - this is OK since setup always creates owner role
        const ownerExists = res.body && res.body.includes('Owner already exists');

        if (ownerExists) {
            console.log('Owner already exists - proceeding to login');
        } else if (res.status !== 303 && res.status !== 200) {
            console.log(`Setup failed: ${res.body}`);
        }

        check(res, {
            'setup succeeded or owner exists': (r) => r.status === 303 || r.status === 200 || ownerExists,
        });
    });

    group('Login', function () {
        const url = `${BASE_URL}/api/users/login`;
        const payload = `username=${encodeURIComponent(APP_ADMIN)}&password=${encodeURIComponent(APP_ADMIN_PASSWORD)}`;

        const params = {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': BASE_URL,
            },
        };

        const res = http.post(url, payload, params);

        check(res, {
            'login status is 200 or 303': (r) => r.status === 200 || r.status === 303,
        });

        // Extract auth_session value from login response manually
        // Ansible: regex_findall('auth_session=([^;]+)')
        // k6 headers are case-insensitive usually, but strict referencing is good.
        // 'Set-Cookie' might be an array or string.

        // Note: K6 might handle cookies automatically, but we want to capture the value explicitly
        // to pass it in the next request strictly as requested.

        // Check if Set-Cookie header exists
        // Depending on k6 version/behavior, we might need to look at res.headers['Set-Cookie']
        // It could be a string or array.

        const setCookie = res.headers['Set-Cookie'] || res.headers['set-cookie'];

        if (setCookie) {
            // Simple regex to find auth_session value
            // Note: Set-Cookie might contain multiple cookies.
            let match;
            if (Array.isArray(setCookie)) {
                match = setCookie.join(';').match(/auth_session=([^;]+)/);
            } else {
                match = setCookie.match(/auth_session=([^;]+)/);
            }

            if (match && match[1]) {
                authSession = match[1];
                console.log(`Extracted auth_session: ${authSession}`);
            } else {
                console.log('auth_session cookie not found in Set-Cookie header');
            }
        }
    })

    group('Create Test User via /api/users/add', function () {
        if (!authSession) {
            console.log('Skipping user creation - no auth session');
            return;
        }

        // Create a unique test user for this VU/iteration
        const testUsername = `testuser_${randomString(8)}`;
        const testPassword = `testpass${randomString(8)}`;

        const url = `${BASE_URL}/api/users/add`;
        const payload = JSON.stringify({
            username: testUsername,
            password: testPassword,
            displayName: `Test User ${randomString(4)}`,
            unit: 'metric',
            role: 'user'
        });

        const params = {
            headers: {
                'Content-Type': 'application/json',
                'Origin': BASE_URL,
                'Cookie': `auth_session=${authSession}`,
            },
        };

        const res = http.post(url, payload, params);

        console.log(`Create user response status: ${res.status}`);
        if (res.status !== 200) {
            console.log(`Create user failed: ${res.body}`);
        } else {
            console.log(`Created test user: ${testUsername}`);
        }

        check(res, {
            'create user status is 200': (r) => r.status === 200,
        });
    });

    group('Create API Key', function () {
        const url = `${BASE_URL}/api/trpc/user.createApiKey?batch=1`;
        const payload = JSON.stringify({ "0": "[\"myapikey\"]" });
        const params = {
            headers: {
                'Content-Type': 'application/json',
                'Origin': BASE_URL,
                'Cookie': `auth_session=${authSession}`, // Manually set cookie
            },
        };

        const res = http.post(url, payload, params);

        check(res, {
            'create api key status is 200': (r) => r.status === 200,
        });

        if (res.status === 200) {
            try {
                const json = res.json();
                const data = json[0].result.data;
                // Ansible: regex_replace('\"', '')
                apiKey = data.replace(/"/g, '');
                console.log(`API Key: ${apiKey}`);
            } catch (e) {
                console.error('Failed to parse create API key response', e);
            }
        }
    });

    group('Add New Flight', function () {
        if (!apiKey) {
            console.log('Skipping Add New Flight because no API Key');
            return;
        }

        const url = `${BASE_URL}/api/flight/save`;
        const payload = JSON.stringify({
            from: "KJFK",
            to: "EGLL",
            departure: "2022-01-01",
            seats: [
                { userId: "<USER_ID>" } // Hardcoded as per ansible
            ]
        });

        const params = {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        };

        const res = http.post(url, payload, params);

        check(res, {
            'save flight status is 200': (r) => r.status === 200,
        });

        if (res.status === 200) {
            try {
                flightId = res.json().id;
                console.log(`Flight ID: ${flightId}`);
            } catch (e) {
                console.error('Failed to parse save flight response', e);
            }
        }
    });

    group('Get Flight Information', function () {
        if (!apiKey || !flightId) {
            console.log('Skipping Get Flight because no API Key or Flight ID');
            return;
        }

        const url = `${BASE_URL}/api/flight/get/${flightId}`;
        const params = {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json',
            },
        };

        const res = http.get(url, params);

        check(res, {
            'get flight status is 200': (r) => r.status === 200,
        });
    });

    sleep(1);
}
