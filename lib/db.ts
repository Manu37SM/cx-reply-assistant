import { neon } from "@neondatabase/serverless";

// Neon's HTTP driver — works in serverless/edge runtimes without connection
// pooling headaches. One query = one HTTP call, which is the right trade-off
// for a low-QPS agent-assist tool like this.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string."
  );
}

export const sql = neon(process.env.DATABASE_URL);
