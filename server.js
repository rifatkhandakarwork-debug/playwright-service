const express = require("express");

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "playwright-service" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "healthy" });
});

const port = Number(process.env.PORT || 10000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Listening on ${port}`);
});
