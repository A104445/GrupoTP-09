## Load test using K6

API ENDPOINTS:

```bash
GET /flight/list: Lista todos os voos do utilizador.

GET /flight/get/{id}: Obtém detalhes de um voo específico.

POST /flight/save: Permite criar um novo voo ou atualizar um existente.

POST /flight/delete: Remove um voo da base de dados.
```

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

### Quick Test (10 VUs, 30 seconds)
```bash
k6 run tests/k6/quick-test.js
```

### Full Stress Test (1 to 1000 VUs)
```bash
k6 run tests/k6/stress-test.js
```

### With custom configuration
```bash
# Override BASE_URL and test user credentials
k6 run -e BASE_URL=http://YOUR_IP:3000 \
       -e TEST_USERNAME=myuser \
       -e TEST_PASSWORD=mypass123 \
       tests/k6/stress-test.js

# Output results to JSON file
k6 run --out json=results.json tests/k6/stress-test.js

# Output results to InfluxDB (for Grafana dashboards)
k6 run --out influxdb=http://localhost:8086/k6 tests/k6/stress-test.js
```

### Environment Variables
The tests use these environment variables (with defaults):
| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://34.83.85.235:3000` | App URL |
| `TEST_PASSWORD` | `ascn2526` | Test user password (fixed) |
| `TEST_DISPLAY_NAME` | `K6 Test User` | Display name |
| `TEST_UNIT` | `metric` | Unit preference |

**Note:** Username is generated randomly as `k6user_<timestamp>_<random>` for each test run.

A `.env` file is available at `tests/k6/.env` for reference.

### Using Docker
```bash
docker run --rm -i grafana/k6 run - <tests/k6/stress-test.js
```

## Test Stages (stress-test.js)

The stress test ramps through these client counts:
- 1 VU for 30s
- 10 VUs for 30s
- 50 VUs for 30s
- 100 VUs for 30s
- 200 VUs for 30s
- 400 VUs for 30s
- 800 VUs for 30s
- 1000 VUs for 1 minute
- Ramp down to 0 over 30s

---

## Setup Prerequisites

Going to test for 1,10,50,100,200,400,800,1000 clients and random API endpoints. But first needs to use the other endpoints like.

- name: Task 0 - Check access to App (HTTP GET should return 200)
  ansible.builtin.uri:
    url: "http://{{ app_ip }}:{{ app_port }}/"

- name: Task 1 - Setup user
  ansible.builtin.uri:
    url: "http://{{ app_ip }}:{{ app_port }}/api/users/setup"
    method: POST
    headers:
      Origin: "http://{{ app_ip }}:{{ app_port }}"
    body_format: form-multipart
    body:
      username: "{{ app_admin }}"
      password: "{{ app_admin_password }}"
      displayName: "{{ app_admin_display_name }}"
      unit: "{{ app_admin_unit }}"
    status_code: 303
    return_content: true
  register: setup_user_response

- name: Task 2 - Login
  ansible.builtin.uri:
    url: "http://{{ app_ip }}:{{ app_port }}/api/users/login"
    method: POST
    headers:
      Accept: "application/json"
      Content-Type: "application/x-www-form-urlencoded"
      Origin: "http://{{ app_ip }}:{{ app_port }}"
    body: "username={{ app_admin }}&password={{ app_admin_password }}"
    body_format: raw
    return_content: true
    status_code: [200, 303]
    follow_redirects: all
  register: login_response

- name: Extract auth_session value from login response
  ansible.builtin.set_fact:
    auth_session: "{{ (login_response.set_cookie | regex_findall('auth_session=([^;]+)'))[0] }}"

- name: Show extracted auth_session
  ansible.builtin.debug:
    var: auth_session

- name: Task 3 - Create API key
  ansible.builtin.uri:
    url: "http://{{ app_ip }}:{{ app_port }}/api/trpc/user.createApiKey?batch=1"
    method: POST
    headers:
      Content-Type: "application/json"
      Origin: "http://{{ app_ip }}:{{ app_port }}"
      Cookie: "auth_session={{ auth_session }}"
    body: '{"0":"[\"myapikey\"]"}'
    body_format: raw
    return_content: true
    status_code: 200
  register: create_apikey_response

- name: Extract API key from response
  ansible.builtin.set_fact:
    api_key: "{{ create_apikey_response.json[0].result.data | regex_replace('\"', '') }}"

- name: Debug API key
  ansible.builtin.debug:
    var: api_key

- name: Update API key in inventory
  ansible.builtin.lineinfile:
    path: inventory/gcp.yml
    regexp: '^(\s*)app_admin_api_key:.*$'
    line: '\1app_admin_api_key: "{{ api_key }}"'
    backrefs: true

Then it can use the endpoints..I gave in the beggining.
Be aware of Bearer tokens and cookies and to use the API KEY that was created.