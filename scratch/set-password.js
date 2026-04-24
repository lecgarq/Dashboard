const { Client } = require("pg");
const bcrypt = require("bcryptjs");

const client = new Client({
  connectionString: "postgresql://postgres.mehehwxnhcsnugfkqyis:Xzmedt%2F4592@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
});

async function main() {
  await client.connect();
  const email = "test-editor@hermosillo.com";
  const password = "password123";
  const hash = await bcrypt.hash(password, 10);
  
  const res = await client.query(
    "UPDATE \"User\" SET password = $1 WHERE email = $2 RETURNING *",
    [hash, email]
  );
  console.log("Editor user password set:", JSON.stringify(res.rows[0], null, 2));
  await client.end();
}

main().catch(console.error);
