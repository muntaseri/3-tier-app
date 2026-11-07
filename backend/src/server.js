const { Pool } = require("pg");
const { createApp } = require("./app");

const port = Number(process.env.PORT || 3000);
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "shoplite",
  user: process.env.DB_USER || "shoplite",
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

async function start() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(1000) NOT NULL DEFAULT '',
      price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const app = createApp(pool);
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`ShopLite API listening on port ${port}`);
  });

  const shutdown = () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

start().catch(async (error) => {
  console.error("Failed to start ShopLite API:", error);
  await pool.end();
  process.exit(1);
});
