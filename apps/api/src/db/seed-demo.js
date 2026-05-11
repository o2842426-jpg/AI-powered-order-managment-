const { db } = require("./client");

function seedDemoStore() {
  const insertStore = db.prepare(`
    INSERT OR IGNORE INTO stores (id, name, slug, phone, delivery_info)
    VALUES (1, 'Demo Store', 'demo-store', '+201000000000', 'Delivery in 2-4 days')
  `);

  insertStore.run();
  console.log("Demo store is ready with id=1");
}

seedDemoStore();
