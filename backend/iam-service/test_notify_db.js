const { Client } = require('pg');

async function test() {
  const client = new Client({
    host: 'localhost',
    port: 5446,
    user: 'ev_user',
    password: 'ev_secret',
    database: 'ev_notification_db',
  });

  try {
    await client.connect();
    console.log("Connected to ev_notification_db successfully!");

    console.log("\n=== Tables in ev_notification_db ===");
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log(tables.rows);

    console.log("\n=== Migrations in typeorm_migrations ===");
    try {
      const migrations = await client.query("SELECT * FROM typeorm_migrations");
      console.log(migrations.rows);
    } catch (e) {
      console.log("No typeorm_migrations table or error reading it:", e.message);
    }

  } catch (err) {
    console.error("Connection failed:", err.message);
  } finally {
    await client.end();
  }
}

test();
