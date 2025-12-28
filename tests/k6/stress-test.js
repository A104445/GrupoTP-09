import http from 'k6/http';
import { check, sleep, group } from 'k6';
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

// Stress test stages: ramp up through 1, 10, 50, 100, 200, 400, 800, 1000 VUs
export const options = {
  stages: [
    { duration: '30s', target: 1 },    // 1 client
    { duration: '30s', target: 10 },   // 10 clients
    { duration: '30s', target: 50 },   // 50 clients
    { duration: '30s', target: 100 },  // 100 clients
    { duration: '30s', target: 200 },  // 200 clients
    { duration: '30s', target: 400 },  // 400 clients
    { duration: '30s', target: 800 },  // 800 clients
    { duration: '1m', target: 1000 },  // 1000 clients (hold longer)
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should complete within 2s
    http_req_failed: ['rate<0.1'],     // Less than 10% failure rate
  },
};

// Setup function - runs once before the test to create user and get API key
export function setup() {
  const TEST_USERNAME = generateRandomUsername();
  console.info(`Starting stress test against ${BASE_URL}`);
  console.info(`Setting up test user: ${TEST_USERNAME}`);

  // Small delay for randomness
  sleep(0.1);

  // Task 0 - Check access to App
  const healthCheck = http.get(`${BASE_URL}/`);
  check(healthCheck, {
    'App is accessible': (r) => r.status === 200,
  });

  if (healthCheck.status !== 200) {
    console.error(`App health check failed with status ${healthCheck.status}`);
    return { apiKey: null, error: 'App not accessible' };
  }

  // Task 1 - Setup user (create account)
  const setupFormData = {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
    displayName: TEST_DISPLAY_NAME,
    unit: TEST_UNIT,
  };

  const setupResponse = http.post(`${BASE_URL}/api/users/setup`, setupFormData, {
    headers: {
      'Origin': BASE_URL,
    },
    redirects: 0, // Don't follow redirects to capture the response
  });

  console.info(`Setup user response status: ${setupResponse.status}`);
  console.info(`Setup user response body: ${setupResponse.body}`);

  // Check if owner already exists - need fresh database for new user creation
  if (setupResponse.status === 400 && setupResponse.body && setupResponse.body.includes('Owner already exists')) {
    console.error('Owner already exists! Reset the database to run tests with new random users.');
    return { apiKey: null, error: 'Owner already exists' };
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

  console.info(`Login response status: ${loginResponse.status}`);
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
      console.info(`Extracted auth_session: ${authSession.substring(0, 20)}...`);
    }
  }

  if (!authSession) {
    console.error('Failed to extract auth_session from login response');
    console.info('Response headers:', JSON.stringify(loginResponse.headers));
    return { apiKey: null, error: 'Failed to login' };
  }

  // Task 3 - Create API key
  const apiKeyResponse = http.post(
    `${BASE_URL}/api/trpc/user.createApiKey?batch=1`,
    JSON.stringify({ '0': '["k6testapikey"]' }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Origin': BASE_URL,
        'Cookie': `auth_session=${authSession}`,
      },
    }
  );

  console.info(`Create API key response status: ${apiKeyResponse.status}`);
  console.info(`Create API key response body: ${apiKeyResponse.body}`);

  let apiKey = null;
  if (apiKeyResponse.status === 200) {
    try {
      const responseData = JSON.parse(apiKeyResponse.body);
      console.info(`Parsed API key response: ${JSON.stringify(responseData)}`);

      // Extract API key from response: [{"result":{"data":"\"apikey\""}}]
      if (responseData[0] && responseData[0].result && responseData[0].result.data) {
        apiKey = responseData[0].result.data.replace(/"/g, '');
        console.info(`Created API key successfully: ${apiKey.substring(0, 10)}...`);
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
    return { apiKey: null, authSession, error: 'Failed to create API key' };
  }

  // Create a sample flight for testing GET operations
  let testFlightId = '1';
  const flightData = JSON.stringify({
    date: new Date().toISOString().split('T')[0],
    departure: 'LIS',
    arrival: 'OPO',
    departureTime: '10:00',
    arrivalTime: '11:00',
    flightNumber: 'K6-SETUP-001',
    aircraft: 'A320',
    seat: '12A',
    class: 'Economy',
    notes: 'K6 stress test setup flight',
  });

  const createFlightResponse = http.post(`${BASE_URL}/api/flight/save`, flightData, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Origin': BASE_URL,
    },
  });

  if (createFlightResponse.status === 200 || createFlightResponse.status === 201) {
    try {
      const body = JSON.parse(createFlightResponse.body);
      testFlightId = body.id || body.flightId || '1';
    } catch (e) {
      // Keep default
    }
  }

  console.info('Setup completed successfully!');
  return { apiKey, authSession, testFlightId };
}

// Common headers with API key authentication
function getHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Origin': BASE_URL,
  };
}

// Main test function - runs for each VU
export default function (data) {
  if (!data.apiKey) {
    console.error('No API key available, skipping test iteration');
    sleep(1);
    return;
  }

  // Randomly select an endpoint to test
  const endpoints = ['list', 'get', 'save', 'delete'];
  const selectedEndpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

  group('Flight API Stress Test', function () {
    switch (selectedEndpoint) {
      case 'list':
        testFlightList(data.apiKey);
        break;
      case 'get':
        testFlightGet(data.apiKey);
        break;
      case 'save':
        testFlightSave(data.apiKey);
        break;
      case 'delete':
        testFlightDelete(data.apiKey);
        break;
    }
  });

  // Small pause between requests
  sleep(Math.random() * 2 + 0.5); // 0.5 to 2.5 seconds
}

// GET /flight/list - List all flights
function testFlightList(apiKey) {
  const response = http.get(`${BASE_URL}/api/flight/list`, {
    headers: getHeaders(apiKey),
    tags: { endpoint: 'flight_list' },
  });

  check(response, {
    'flight list status is 200': (r) => r.status === 200,
    'flight list response time < 2000ms': (r) => r.timings.duration < 2000,
  });
}

// GET /flight/get/{id} - Get specific flight details
function testFlightGet(apiKey) {
  // Use incremental ID based on VU and iteration
  const flightId = exec.vu.idInTest * 10000 + exec.vu.iterationInScenario;

  const response = http.get(`${BASE_URL}/api/flight/get/${flightId}`, {
    headers: getHeaders(apiKey),
    tags: { name: 'flight_get', endpoint: 'flight_get' },
  });

  check(response, {
    'flight get status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'flight get response time < 2000ms': (r) => r.timings.duration < 2000,
  });
}

// POST /flight/save - Create or update a flight
function testFlightSave(apiKey) {
  // Generate incremental flight ID using VU id and iteration
  const flightId = exec.vu.idInTest * 10000 + exec.vu.iterationInScenario;

  const flightData = JSON.stringify({
    date: new Date().toISOString().split('T')[0],
    departure: 'LIS',
    arrival: 'OPO',
    departureTime: `${Math.floor(Math.random() * 24).toString().padStart(2, '0')}:00`,
    arrivalTime: `${Math.floor(Math.random() * 24).toString().padStart(2, '0')}:00`,
    flightNumber: `K6-${flightId}`,
    aircraft: 'A320',
    seat: `${Math.floor(Math.random() * 30) + 1}${String.fromCharCode(65 + Math.floor(Math.random() * 6))}`,
    class: ['Economy', 'Business', 'First'][Math.floor(Math.random() * 3)],
    notes: `K6 stress test - Flight ${flightId}`,
  });

  const response = http.post(`${BASE_URL}/api/flight/save`, flightData, {
    headers: getHeaders(apiKey),
    tags: { endpoint: 'flight_save' },
  });

  check(response, {
    'flight save status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'flight save response time < 2000ms': (r) => r.timings.duration < 2000,
  });
}

// POST /flight/delete - Delete a flight
function testFlightDelete(apiKey) {
  // Create a flight first, then delete it
  const flightData = JSON.stringify({
    date: new Date().toISOString().split('T')[0],
    departure: 'DEL',
    arrival: 'TST',
    flightNumber: `DEL-${Date.now()}`,
  });

  const createResponse = http.post(`${BASE_URL}/api/flight/save`, flightData, {
    headers: getHeaders(apiKey),
  });

  if (createResponse.status === 200 || createResponse.status === 201) {
    let flightId;
    try {
      const body = JSON.parse(createResponse.body);
      flightId = body.id || body.flightId;
    } catch (e) {
      return; // Skip delete if we can't parse the response
    }

    if (flightId) {
      const deleteResponse = http.post(
        `${BASE_URL}/api/flight/delete`,
        JSON.stringify({ id: flightId }),
        {
          headers: getHeaders(apiKey),
          tags: { endpoint: 'flight_delete' },
        }
      );

      check(deleteResponse, {
        'flight delete status is 200': (r) => r.status === 200,
        'flight delete response time < 2000ms': (r) => r.timings.duration < 2000,
      });
    }
  }
}

// Teardown function - runs once after the test
export function teardown(data) {
  console.info('Stress test completed');
  if (data.apiKey) {
    console.info(`Tests ran with API key: ${data.apiKey.substring(0, 10)}...`);
  }
}
