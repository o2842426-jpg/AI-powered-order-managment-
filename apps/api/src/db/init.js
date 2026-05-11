const path = require("path");
const { db, dbPath } = require("./client");

console.log(`Database ready at: ${path.resolve(dbPath)}`);
