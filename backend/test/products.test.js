const test = require("node:test");
const assert = require("node:assert/strict");
const { validateProduct } = require("../src/products");

test("validates and normalizes a product", () => {
  assert.deepEqual(validateProduct({
    name: "  Tea  ",
    description: "  Green tea  ",
    price: "3.50",
  }), {
    value: { name: "Tea", description: "Green tea", price: 3.5 },
  });
});

test("rejects missing names and non-positive prices", () => {
  assert.match(validateProduct({ name: " ", price: 2 }).error, /Name is required/);
  assert.match(validateProduct({ name: "Tea", price: 0 }).error, /greater than zero/);
  assert.match(validateProduct({ name: "Tea", price: 100000000 }).error, /at most/);
});

test("rejects oversized fields and non-object input", () => {
  assert.match(validateProduct(null).error, /must be an object/);
  assert.match(validateProduct({ name: "x".repeat(121), price: 2 }).error, /120 characters/);
  assert.match(validateProduct({ name: "Tea", description: "x".repeat(1001), price: 2 }).error, /1000 characters/);
});
