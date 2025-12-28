import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Custom metrics for latency tracking
const responseTime = new Trend('response_time');
const waitingTime = new Trend('waiting_time');      // TTFB (Time to First Byte)
const connectTime = new Trend('connect_time');
const requestsPerSecond = new Counter('requests_total');
const errorRate = new Rate('errors');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://35.230.98.150:3000';

export const options = {
    stages: [
        { duration: '30s', target: 1 },       // 1 user
        { duration: '30s', target: 10 },      // 10 users
        { duration: '30s', target: 50 },      // 50 users
        { duration: '30s', target: 100 },     // 100 users
        // { duration: '30s', target: 200 },     // 200 users
        // { duration: '30s', target: 400 },     // 400 users
        // { duration: '30s', target: 800 },     // 800 users
        // { duration: '30s', target: 1000 },    // 1000 users
        // { duration: '30s', target: 2500 },    // 2500 users
        // { duration: '30s', target: 5000 },    // 5000 users
        // { duration: '30s', target: 10000 },   // 10000 users
        // { duration: '30s', target: 25000 },  // 25000 users
        { duration: '30s', target: 0 },       // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(50)<500', 'p(90)<1000', 'p(95)<2000', 'p(99)<3000'],
        http_req_failed: ['rate<0.1'],
        response_time: ['p(95)<2000'],
        waiting_time: ['p(95)<1500'],         // TTFB threshold
        errors: ['rate<0.1'],
    },
};

export default function () {
    const res = http.get(`${BASE_URL}/`);

    // Record custom latency metrics
    responseTime.add(res.timings.duration);           // Total response time
    waitingTime.add(res.timings.waiting);             // TTFB - Time to First Byte
    connectTime.add(res.timings.connecting);          // TCP connection time
    requestsPerSecond.add(1);
    errorRate.add(res.status !== 200);

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
        'response time < 1000ms': (r) => r.timings.duration < 1000,
        'TTFB < 500ms': (r) => r.timings.waiting < 500,
    });

    sleep(1);
}
