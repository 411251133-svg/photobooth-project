const express = require('express');
const path = require('path');
const fs = require('fs');
const fsProm = fs.promises;
const multer = require('multer');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// ensure uploads dir exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '20mb' }));

// serve client files
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(UPLOAD_DIR));

// multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const safeName = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, safeName);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/photos -> list saved photos
app.get('/api/photos', async (req, res) => {
  try {
    const files = await fsProm.readdir(UPLOAD_DIR);
    const list = await Promise.all(files.map(async (f) => {
      const stat = await fsProm.stat(path.join(UPLOAD_DIR, f));
      return {
        filename: f,
        url: `/uploads/${encodeURIComponent(f)}`,
        size: stat.size,
        createdAt: stat.birthtime
      };
    }));
    list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membaca folder uploads' });
  }
});

// POST /api/upload (multipart form-data) — field 'photo'
app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded (field: photo)' });
  res.json({ filename: req.file.filename, url: `/uploads/${encodeURIComponent(req.file.filename)}` });
});

// POST /api/upload-base64 -> { image: dataUrl }
app.post('/api/upload-base64', async (req, res) => {
  try {
    const { image, filename } = req.body;
    if (!image || typeof image !== 'string') return res.status(400).json({ error: 'Image data missing' });

    const matches = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) return res.status(400).json({ error: 'Invalid image data' });

    const ext = matches[1].split('/')[1] || 'png';
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');

    const safeName = (filename && path.basename(filename)) || `${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const outPath = path.join(UPLOAD_DIR, safeName);

    await fsProm.writeFile(outPath, buffer);
    res.json({ filename: safeName, url: `/uploads/${encodeURIComponent(safeName)}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menyimpan gambar' });
  }
});

// DELETE /api/photos/:filename -> remove file
app.delete('/api/photos/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const target = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'File not found' });
    await fsProm.unlink(target);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus file' });
  }
});

app.listen(PORT, () => {
  console.log(`PhotoBooth backend running at http://localhost:${PORT}`);
});
