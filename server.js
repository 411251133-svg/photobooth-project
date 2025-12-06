const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static("."));

// Ensure uploads directory exists
const uploadsDir = "./uploads";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Upload base64 image
app.post("/api/upload-base64", (req, res) => {
  const { image } = req.body;
  const base64Data = image.replace(/^data:image\/png;base64,/, "");
  const filename = `photo_${Date.now()}.png`;
  const filepath = path.join(uploadsDir, filename);

  fs.writeFile(filepath, base64Data, "base64", (err) => {
    if (err) {
      return res.status(500).json({ error: "Upload failed" });
    }
    res.json({ success: true, filename, url: `/uploads/${filename}` });
  });
});

// Get photos list
app.get("/api/photos", (req, res) => {
  fs.readdir(uploadsDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "Failed to list photos" });
    }

    const photos = files
      .filter((file) => file.startsWith("photo_"))
      .map((filename) => ({
        filename,
        url: `/uploads/${filename}`,
        createdAt: fs.statSync(path.join(uploadsDir, filename)).birthtime,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(photos);
  });
});

// Delete photo
app.delete("/api/photos/:filename", (req, res) => {
  const filepath = path.join(uploadsDir, req.params.filename);
  fs.unlink(filepath, (err) => {
    if (err) {
      return res.status(500).json({ error: "Delete failed" });
    }
    res.status(204).send();
  });
});

// Serve uploads
app.use("/uploads", express.static(uploadsDir));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
