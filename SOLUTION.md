## Solution

This solution implements a robust ping tree API using Node.js and Redis, fulfilling all challenge requirements with validated routing, persistent storage, and complete test coverage.

### 1. API Endpoints

#### Target Management
- `POST /api/targets` – Create a target with validation
- `GET /api/targets` – Retrieve all targets
- `GET /api/target/:id` – Fetch target by ID
- `POST /api/target/:id` – Update target with validation

#### Routing
- `POST /route` – Route visitors based on geoState, hour, and value

### 2. Validation & Error Handling

- `value`: Must be a non-negative number
- `maxAcceptsPerDay`: Must be a non-negative integer
- `timestamp`: Valid timestamp
- Handles 400/404/405/500 with clear messages

### 3. Routing Logic

- Case-insensitive `geoState` match
- UTC hour-based filtering
- Daily limits with auto reset
- Highest `value` target selection (order-biased)

### 4. Testing

- 48 tests in `test/endpoints.js`
- Covers: validation, routing, limits, edge cases
- Redis flushed before each test for isolation

### 5. Code Structure

- `controllers/` – HTTP layer
- `services/` – Business logic
- `utils/` – Helpers (validation, parsing)
- `lib/redis.js` – Shared Redis client

This system is modular, reliable, and production-ready.
