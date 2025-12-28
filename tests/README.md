## Load Testing with K6

### API Endpoints

#### Health Check
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/` | Check application access (returns 200) | None |

#### User Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/users/setup` | Setup initial admin/owner user | None |
| `POST` | `/api/users/login` | User login (returns `auth_session` cookie) | None |
| `POST` | `/api/users/add` | Create a new user | Cookie: `auth_session` |

#### API Key Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/trpc/user.createApiKey?batch=1` | Generate API key for authenticated user | Cookie: `auth_session` |

#### Flight Management
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/flight/list` | List all user flights | Bearer Token |
| `GET` | `/api/flight/get/{id}` | Get specific flight details | Bearer Token |
| `POST` | `/api/flight/save` | Create or update a flight | Bearer Token |
| `POST` | `/api/flight/delete` | Delete a flight | Bearer Token |

### Authentication Flow

1. **Setup** - `POST /api/users/setup` with form data (`username`, `password`, `displayName`, `unit`)
2. **Login** - `POST /api/users/login` to get `auth_session` cookie
3. **Create API Key** - `POST /api/trpc/user.createApiKey?batch=1` using the session cookie
4. **Use API** - Access flight endpoints using `Authorization: Bearer <api_key>`

## Install K6

### Ubuntu/Debian
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```


## Run K6 Tests

### Stress Test (Health Check Endpoint)
```bash
k6 run tests/k6/stress-test.js
```

### Test Scenarios (Full API Flow)
```bash
k6 run tests/k6/test_scenarios.js
```

### With Custom Configuration
```bash
# Override BASE_URL
k6 run -e BASE_URL=http://YOUR_IP:3000 tests/k6/stress-test.js

# Output results to JSON file
k6 run --out json=results.json tests/k6/stress-test.js

# Output results to InfluxDB (for Grafana dashboards)
k6 run --out influxdb=http://localhost:8086/k6 tests/k6/stress-test.js
```

### Using Docker
```bash
docker run --rm -i grafana/k6 run - <tests/k6/stress-test.js
```

---

## Test Stages (stress-test.js)

The stress test targets `GET /` endpoint with parallel virtual users (VUs) ramping through these stages:

| Stage | VUs | Duration | Description |
|-------|-----|----------|-------------|
| 1 | 1 | 30s | Baseline single user |
| 2 | 10 | 30s | Light load |
| 3 | 50 | 30s | Moderate load |
| 4 | 100 | 30s | Standard load |
| 5 | 200 | 30s | Increased load |
| 6 | 400 | 30s | High load |
| 7 | 800 | 30s | Heavy load |
| 8 | 1000 | 30s | Very heavy load |
| 9 | 2500 | 30s | Stress load |
| 10 | 5000 | 30s | Extreme load |
| 11 | 10000 | 30s | Peak load |
| 12 | 150000 | 30s | Maximum stress |
| 13 | 0 | 30s | Ramp down |

**Total Duration:** ~6.5 minutes

### Thresholds
- 95% of requests must complete under 2 seconds
- Less than 10% failure rate

---

## Test Scenarios (test_scenarios.js)

The full API flow test executes:

1. **Setup User** - Creates admin/owner account
2. **Login** - Authenticates and captures `auth_session` cookie
3. **Create Test User** - Creates additional user via `/api/users/add`
4. **Create API Key** - Generates Bearer token for API access
5. **Add Flight** - Creates a new flight record
6. **Get Flight** - Retrieves the created flight details

---