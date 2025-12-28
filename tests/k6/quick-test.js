import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

// Configuration from environment variables
const BASE_URL = __ENV.BASE_URL || 'http://34.168.251.157:3000';
const TEST_PASSWORD = 'ascn2526';
const TEST_DISPLAY_NAME = __ENV.TEST_DISPLAY_NAME || 'K6 Test User';
const TEST_UNIT = __ENV.TEST_UNIT || 'metric';
// Generate random username using timestamp (max 20 characters)
function generateRandomUsername() {
  const timestamp = Date.now().toString(36); // base36 timestamp
  const random = Math.random().toString(36).substring(2, 6);
  return `k6_${timestamp}_${random}`.substring(0, 20); // max 20 chars
}

// Quick test with fewer VUs for validation
export const options = {
  vus: 10,
  duration: '30s',
};

// Setup function - create user and get API key
export function setup() {
  const TEST_USERNAME = generateRandomUsername();
  console.info(`Quick test against ${BASE_URL}`);
  console.info(`Setting up test user: ${TEST_USERNAME}`);

  // Small delay for randomness
  sleep(0.1);

  // Task 0 - Check access to App
  const healthCheck = http.get(`${BASE_URL}/`);
  if (healthCheck.status !== 200) {
    console.error(`App not accessible: ${healthCheck.status}`);
    return { apiKey: null };
  }

  // Task 1 - Setup user (create account)
  const setupFormData = {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
    displayName: TEST_DISPLAY_NAME,
    unit: TEST_UNIT,
  };

  const setupResponse = http.post(`${BASE_URL}/api/users/setup`, setupFormData, {
    headers: { 'Origin': BASE_URL },
    redirects: 0,
  });

  console.info(`Setup user status: ${setupResponse.status}`);
  console.info(`Setup user response body: ${setupResponse.body}`);

  // Check if owner already exists - need fresh database for new user creation
  if (setupResponse.status === 400 && setupResponse.body && setupResponse.body.includes('Owner already exists')) {
    console.error('Owner already exists! Reset the database to run tests with new random users.');
    return { apiKey: null };
  }

  // Expect 303 redirect for successful setup
  if (setupResponse.status !== 303) {
    console.warn(`Setup user returned unexpected status: ${setupResponse.status} (expected 303)`);
  }

  // Task 2 - Login
  const loginBody = `username=${encodeURIComponent(TEST_USERNAME)}&password=${encodeURIComponent(TEST_PASSWORD)}`;

  const loginResponse = http.post(`${BASE_URL}/api/users/login`, loginBody, {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': BASE_URL,
    },
    redirects: 0,
  });

  console.info(`Login status: ${loginResponse.status}`);
  console.info(`Login response body: ${loginResponse.body}`);
  console.info(`Login response headers: ${JSON.stringify(loginResponse.headers)}`);

  // Extract auth_session cookie
  let authSession = null;
  const cookies = loginResponse.headers['Set-Cookie'];

  if (cookies) {
    const cookieStr = Array.isArray(cookies) ? cookies.join('; ') : cookies;
    const match = cookieStr.match(/auth_session=([^;]+)/);
    if (match) {
      authSession = match[1];
      console.info(`Got auth_session: ${authSession.substring(0, 20)}...`);
    }
  }

  if (!authSession) {
    console.error('Failed to get auth_session');
    return { apiKey: null };
  }

  // Task 3 - Create API key
  const apiKeyResponse = http.post(
    `${BASE_URL}/api/trpc/user.createApiKey?batch=1`,
    JSON.stringify({ '0': '["k6quicktest"]' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Origin': BASE_URL,
        'Cookie': `auth_session=${authSession}`,
      },
    }
  );

  console.info(`Create API key status: ${apiKeyResponse.status}`);

  let apiKey = null;
  console.info(`API key response body: ${apiKeyResponse.body}`);

  if (apiKeyResponse.status === 200) {
    try {
      const responseData = JSON.parse(apiKeyResponse.body);
      console.info(`Parsed API key response: ${JSON.stringify(responseData)}`);

      if (responseData[0] && responseData[0].result && responseData[0].result.data) {
        apiKey = responseData[0].result.data.replace(/"/g, '');
        console.info(`API key created successfully: ${apiKey.substring(0, 10)}...`);
      } else {
        console.error(`API key response structure unexpected: ${JSON.stringify(responseData)}`);
      }
    } catch (e) {
      console.error(`Failed to parse API key response: ${e.message}`);
      console.error(`Raw response body: ${apiKeyResponse.body}`);
    }
  } else {
    console.error(`API key creation failed with status: ${apiKeyResponse.status}`);
    console.error(`Response body: ${apiKeyResponse.body}`);
  }

  if (!apiKey) {
    console.error('No API key obtained - tests will fail');
  }

  return { apiKey };
}

function getHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Origin': BASE_URL,
  };
}

export default function (data) {
  if (!data.apiKey) {
    console.error('No API key, skipping');
    sleep(1);
    return;
  }

  // Generate incremental flight ID using VU id and iteration
  const flightId = exec.vu.idInTest * 10000 + exec.vu.iterationInScenario;

  // Test flight list endpoint
  const listResponse = http.get(`${BASE_URL}/api/flight/list`, {
    headers: getHeaders(data.apiKey),
  });

  check(listResponse, {
    'flight list status is 200': (r) => r.status === 200,
  });

  // Test flight save with incremental ID
  const flightData = JSON.stringify({
    date: new Date().toISOString().split('T')[0],
    departure: 'LIS',
    arrival: 'OPO',
    flightNumber: `K6-${flightId}`,
    notes: `Quick test - Flight ${flightId}`,
  });

  const saveResponse = http.post(`${BASE_URL}/api/flight/save`, flightData, {
    headers: getHeaders(data.apiKey),
  });

  check(saveResponse, {
    'flight save status is 200 or 201': (r) => r.status === 200 || r.status === 201,
  });

  sleep(1);
}

export function teardown() {
  console.info('Quick test completed');
}
