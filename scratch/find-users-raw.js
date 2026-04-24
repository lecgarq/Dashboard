const { Client } = require("pg");

const client = new Client({
  connectionString: "postgresql://postgres.mehehwxnhcsnugfkqyis:Xzmedt%2F4592@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
});

async function main() {
  await client.connect();
  const res = await client.query("SELECT email, role FROM \"User\" LIMIT 20");
  console.log("Users found:", JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(console.error);
