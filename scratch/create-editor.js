const { Client } = require("pg");

const client = new Client({
  connectionString: "postgresql://postgres.mehehwxnhcsnugfkqyis:Xzmedt%2F4592@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
});

async function main() {
  await client.connect();
  const email = "test-editor@hermosillo.com";
  // Insert a test user with EDITOR role
  // We don't need a password since we can't easily use next-auth's credentials provider from here without knowing the hash logic,
  // but we can check if it exists or create it.
  const res = await client.query(
    "INSERT INTO \"User\" (id, email, role) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET role = $3 RETURNING *",
    ["test-editor-id", email, "EDITOR"]
  );
  console.log("Editor user created/updated:", JSON.stringify(res.rows[0], null, 2));
  await client.end();
}

main().catch(console.error);
