// Seeds Neon with one demo brand, its knowledge base, a customer, an order,
// and the conversation described in the assessment ("bottle arrived broken").
// Safe to re-run: it clears prior demo rows for this brand name first.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local and re-run: npm run seed");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log("Applying schema...");
  const schema = readFileSync(path.join(__dirname, "../db/schema.sql"), "utf8");
  // Neon's HTTP driver runs one statement per call, so split on ";\n"
  const statements = schema
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await sql(stmt + ";");
  }

  console.log("Clearing previous demo data for 'HydroBloom'...");
  await sql`delete from brands where name = 'HydroBloom'`;

  console.log("Seeding brand...");
  const [brand] = await sql`
    insert into brands (name, tone)
    values ('HydroBloom', 'Warm, empathetic, and solution-first. Sign off as "Team HydroBloom".')
    returning id
  `;
  const brandId = brand.id;

  console.log("Seeding knowledge base...");
  await sql`
    insert into knowledge_base (brand_id, category, title, content) values
    (${brandId}, 'return', 'Return Policy',
      'Items can be returned within 30 days of delivery if unused and in original packaging. Damaged, defective, or incorrect items can be returned regardless of packaging condition, as long as it is within 30 days of delivery.'),
    (${brandId}, 'refund', 'Refund Policy',
      'Refunds are only permitted within 7 days of delivery for change-of-mind requests. For items that arrive damaged or defective, customers are eligible for a full refund or free replacement within 30 days of delivery, and do not need to return the damaged item unless requested. Refunds are processed to the original payment method within 5-7 business days of approval.'),
    (${brandId}, 'shipping', 'Shipping Policy',
      'Standard shipping takes 3-5 business days. Express shipping takes 1-2 business days. Shipping is free on orders over ₹999. A tracking link is emailed once the order ships.'),
    (${brandId}, 'cancellation', 'Cancellation Policy',
      'Orders can be cancelled free of charge within 1 hour of purchase, or any time before the order ships. Once an order has shipped, it cannot be cancelled and must instead follow the return process after delivery.')
  `;

  console.log("Seeding customer...");
  const [customer] = await sql`
    insert into customers (brand_id, name, email)
    values (${brandId}, 'Priya Nair', 'priya.nair@example.com')
    returning id
  `;

  console.log("Seeding order (delivered 3 days ago, well within the damaged-item refund window)...");
  const [order] = await sql`
    insert into orders (brand_id, customer_id, order_number, product_name, status, delivered_at)
    values (${brandId}, ${customer.id}, 'HB-10492', 'HydroBloom Glass Water Bottle 1L', 'delivered', now() - interval '3 days')
    returning id
  `;

  console.log("Seeding conversation + opening customer message...");
  const [conversation] = await sql`
    insert into conversations (brand_id, customer_id, order_id, status)
    values (${brandId}, ${customer.id}, ${order.id}, 'open')
    returning id
  `;

  await sql`
    insert into messages (conversation_id, sender, content)
    values
    (${conversation.id}, 'customer', 'Hi, I ordered a water bottle and it arrived today.'),
    (${conversation.id}, 'agent', 'Hi Priya, thanks for reaching out! Sorry to hear something''s wrong — what''s going on with the order?'),
    (${conversation.id}, 'customer', 'My order was delivered but the bottle is broken. What can I do?')
  `;

  console.log("\nSeed complete.");
  console.log("Conversation ID:", conversation.id);
  console.log(`Open the app and load conversation ${conversation.id} (the app also has a "load demo conversation" shortcut on first load).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
