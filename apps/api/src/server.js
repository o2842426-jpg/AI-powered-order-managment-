const dotenv = require("dotenv");
const path = require("path");
const { app } = require("./app");

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
