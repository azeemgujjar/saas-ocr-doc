// Tesseract OCR microservice — a thin HTTP wrapper around the tesseract CLI.
// The worker POSTs an image to /ocr and gets back text + metadata as JSON.
// No DB, no queue, no persistent disk (just per-request temp files).

const express = require('express');
const multer = require('multer');
const { execFile } = require('child_process');
const { promises: fs } = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '4000', 10);
const LANG = process.env.OCR_LANG || 'eng';
// Hard cap on a single OCR run so a pathological image cannot wedge a worker.
const TESSERACT_TIMEOUT_MS = parseInt(process.env.TESSERACT_TIMEOUT_MS || '110000', 10);
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || '20971520', 10); // 20 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const app = express();

// Runs tesseract, writing <outBase>.txt and <outBase>.tsv.
function runTesseract(inputPath, outBase) {
  return new Promise((resolve, reject) => {
    execFile(
      'tesseract',
      [inputPath, outBase, '-l', LANG, 'txt', 'tsv'],
      { timeout: TESSERACT_TIMEOUT_MS },
      (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`tesseract failed: ${stderr || err.message}`));
          return;
        }
        resolve();
      },
    );
  });
}

// Averages the per-word confidence column from the TSV into a single 0-1
// score. Tesseract puts -1 on non-text rows, so skip those.
function parseConfidence(tsv) {
  const confidences = [];
  for (const line of tsv.split('\n').slice(1)) {
    const cols = line.split('\t');
    if (cols.length < 12) continue;
    const conf = parseFloat(cols[10]);
    const word = cols[11];
    if (!Number.isNaN(conf) && conf >= 0 && word && word.trim()) {
      confidences.push(conf);
    }
  }
  if (confidences.length === 0) return 0;
  const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  return Number((avg / 100).toFixed(4));
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', engine: 'tesseract', language: LANG });
});

app.post('/ocr', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Multipart field "file" is required' });
    return;
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ocr-'));
  const inputPath = path.join(tmpDir, `in-${crypto.randomUUID()}`);
  const outBase = path.join(tmpDir, 'out');
  const startedAt = Date.now();

  try {
    await fs.writeFile(inputPath, req.file.buffer);
    await runTesseract(inputPath, outBase);

    const text = (await fs.readFile(`${outBase}.txt`, 'utf8')).trim();

    let confidence = 0;
    try {
      confidence = parseConfidence(await fs.readFile(`${outBase}.tsv`, 'utf8'));
    } catch {
      // TSV is best-effort; absence just means confidence stays 0.
    }

    const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

    res.json({
      text,
      language: LANG,
      confidence,
      pageCount: 1, // images are single-page; PDFs are rejected upstream
      wordCount,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error(`OCR failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  } finally {
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

// Surface multer errors (e.g. file too large) as clean 400s.
app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`OCR service listening on :${PORT} (engine=tesseract lang=${LANG})`);
});
