const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../src/app");

async function startTestServer(t, pool) {
  const server = createApp(pool).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("GET /api/products returns persisted products", async (t) => {
  const products = [{ id: "1", name: "Tea", description: "", price: "3.50" }];
  const baseUrl = await startTestServer(t, {
    query: async () => ({ rows: products }),
  });

  const response = await fetch(`${baseUrl}/api/products`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), products);
});

test("POST /api/products validates input and inserts with query parameters", async (t) => {
  let inserted;
  const product = { id: "2", name: "Tea", description: "Green", price: "3.50" };
  const baseUrl = await startTestServer(t, {
    query: async (_sql, params) => {
      inserted = params;
      return { rows: [product] };
    },
  });

  const response = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: " Tea ", description: " Green ", price: "3.50" }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), product);
  assert.deepEqual(inserted, ["Tea", "Green", 3.5]);
});

test("POST /api/products rejects invalid input without querying the database", async (t) => {
  let queryCalled = false;
  const baseUrl = await startTestServer(t, {
    query: async () => {
      queryCalled = true;
      return { rows: [] };
    },
  });

  const response = await fetch(`${baseUrl}/api/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", price: 0 }),
  });

  assert.equal(response.status, 400);
  assert.equal(queryCalled, false);
});

test("GET /api/health verifies database connectivity", async (t) => {
  const baseUrl = await startTestServer(t, {
    query: async () => ({ rows: [{ "?column?": 1 }] }),
  });

  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", database: "connected" });
});
