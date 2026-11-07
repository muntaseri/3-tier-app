const express = require("express");
const helmet = require("helmet");
const { validateProduct } = require("./products");

function createApp(pool) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", async (_request, response) => {
    try {
      await pool.query("SELECT 1");
      response.json({ status: "ok", database: "connected" });
    } catch (error) {
      console.error("Database health check failed:", error.message);
      response.status(503).json({ status: "unavailable", database: "disconnected" });
    }
  });

  app.get("/api/products", async (_request, response) => {
    try {
      const { rows } = await pool.query(
        "SELECT id, name, description, price, created_at FROM products ORDER BY created_at DESC, id DESC",
      );
      response.json(rows);
    } catch (error) {
      console.error("Failed to fetch products:", error.message);
      response.status(503).json({ error: "Product storage is temporarily unavailable." });
    }
  });

  app.post("/api/products", async (request, response) => {
    const result = validateProduct(request.body);
    if (result.error) {
      return response.status(400).json({ error: result.error });
    }

    try {
      const { rows } = await pool.query(
        `INSERT INTO products (name, description, price)
         VALUES ($1, $2, $3)
         RETURNING id, name, description, price, created_at`,
        [result.value.name, result.value.description, result.value.price],
      );
      return response.status(201).json(rows[0]);
    } catch (error) {
      console.error("Failed to create product:", error.message);
      return response.status(503).json({ error: "Product storage is temporarily unavailable." });
    }
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && "body" in error) {
      return response.status(400).json({ error: "Request body must contain valid JSON." });
    }
    console.error("Unhandled request error:", error);
    return response.status(500).json({ error: "Internal server error." });
  });

  return app;
}

module.exports = { createApp };
