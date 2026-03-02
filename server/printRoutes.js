const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const logger = require('./logger');

const router = express.Router();

// ── Print API Key ───────────────────────────────────────────────────
// Shared secret used by the dashboard and print client as an
// alternative to JWT tokens.  Set PRINT_API_KEY env var in production
// or use the default below (change it for your deployment).
const PRINT_API_KEY = process.env.PRINT_API_KEY || 'QL-print-2026-a7f3b9c1d4e8';
const JWT_SECRET    = process.env.JWT_SECRET    || 'your-secret-key';

/**
 * Flexible auth middleware for print routes.
 * Accepts ANY of the following (checked in order):
 *   1. Valid JWT in  Authorization: Bearer <token>
 *   2. Print API key in  X-Print-Key: <key>
 *   3. Print API key in  Authorization: PrintKey <key>
 * If none match → 401.
 */
const printAuth = (req, res, next) => {
  // --- Try JWT first ------------------------------------------------
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearerToken) {
    try {
      const decoded = jwt.verify(bearerToken, JWT_SECRET);
      req.user = decoded;          // attach user info like authenticateToken does
      return next();
    } catch (_e) {
      // JWT invalid/expired — fall through to API-key check
    }
  }

  // --- Try X-Print-Key header ---------------------------------------
  const printKeyHeader = req.headers['x-print-key'];
  if (printKeyHeader && printKeyHeader === PRINT_API_KEY) {
    req.user = { email: 'print-api-key', name: 'Print API Key', role: 'PrintClient' };
    return next();
  }

  // --- Try "Authorization: PrintKey <key>" --------------------------
  if (authHeader.startsWith('PrintKey ')) {
    const key = authHeader.slice(9);
    if (key === PRINT_API_KEY) {
      req.user = { email: 'print-api-key', name: 'Print API Key', role: 'PrintClient' };
      return next();
    }
  }

  return res.status(401).json({ error: 'Authentication required — provide JWT or X-Print-Key' });
};

// ── Database files ──────────────────────────────────────────────────
const PRINT_JOBS_DB   = path.join(__dirname, 'print-jobs.json');
const PRINTERS_DB     = path.join(__dirname, 'print-printers.json');
const PRINT_CLIENTS_DB = path.join(__dirname, 'print-clients.json');

// ── Initialize DB files ─────────────────────────────────────────────
const initDB = async (filePath, defaultData) => {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, JSON.stringify(defaultData, null, 2));
    logger.info(`✅ Initialized ${path.basename(filePath)}`);
  }
};

const readJSON = async (filePath, fallback) => {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return fallback;
  }
};

const writeJSON = async (filePath, data) => {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
};

// Initialize all databases
(async () => {
  await initDB(PRINT_JOBS_DB,    { jobs: [] });
  await initDB(PRINTERS_DB,      { printers: [] });
  await initDB(PRINT_CLIENTS_DB, { clients: [] });
})();

// ────────────────────────────────────────────────────────────────────
//  HEALTH / STATS
// ────────────────────────────────────────────────────────────────────

// GET /api/print/stats/polling — print-system health (used by print client)
router.get('/stats/polling', async (_req, res) => {
  try {
    const jobsDB = await readJSON(PRINT_JOBS_DB, { jobs: [] });
    const pending  = jobsDB.jobs.filter(j => j.status === 'pending').length;
    const printing = jobsDB.jobs.filter(j => j.status === 'printing').length;
    const completed = jobsDB.jobs.filter(j => j.status === 'completed').length;
    const failed   = jobsDB.jobs.filter(j => j.status === 'failed').length;

    res.json({
      status: 'ok',
      queue: { pending, printing, completed, failed, total: jobsDB.jobs.length },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Print stats error:', err);
    res.status(500).json({ error: 'Failed to get print stats' });
  }
});

// ────────────────────────────────────────────────────────────────────
//  PRINT JOBS
// ────────────────────────────────────────────────────────────────────

// POST /api/print/jobs — create a new print job (called from dashboard)
router.post('/jobs', async (req, res) => {
  try {
    const { templateName, printer, copies, pdfData, labelData, paperSize, locationId } = req.body;

    if (!pdfData) {
      return res.status(400).json({ error: 'pdfData is required' });
    }

    const job = {
      id: uuidv4(),
      templateName: templateName || 'Unnamed',
      printer: printer || null,
      copies: copies || 1,
      pdfData,                      // base64-encoded PDF
      labelData: labelData || {},
      paperSize: paperSize || 'Brother-QL800',
      locationId: locationId || null,
      status: 'pending',
      createdBy: req.user ? req.user.email : 'unknown',
      createdAt: new Date().toISOString(),
      claimedBy: null,
      claimedAt: null,
      completedAt: null,
      failedAt: null,
      errorMessage: null,
      retryCount: 0
    };

    const db = await readJSON(PRINT_JOBS_DB, { jobs: [] });
    db.jobs.push(job);
    await writeJSON(PRINT_JOBS_DB, db);

    logger.info(`🖨️  Print job created: ${job.id} — ${templateName} → ${printer || 'any'}`);
    res.status(201).json({ id: job.id, status: 'pending', message: 'Print job queued' });
  } catch (err) {
    logger.error('Create print job error:', err);
    res.status(500).json({ error: 'Failed to create print job' });
  }
});

// GET /api/print/jobs/pending — poll for pending jobs (used by print client)
router.get('/jobs/pending', async (req, res) => {
  try {
    const { clientId, locationId, limit } = req.query;
    const db = await readJSON(PRINT_JOBS_DB, { jobs: [] });

    let pending = db.jobs.filter(j => j.status === 'pending');

    // Filter by locationId if the client provided one
    if (locationId) {
      pending = pending.filter(j => !j.locationId || j.locationId === locationId);
    }

    // Sort oldest first, apply limit
    pending.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const max = parseInt(limit, 10) || 10;
    pending = pending.slice(0, max);

    res.json(pending);
  } catch (err) {
    logger.error('Poll pending jobs error:', err);
    res.status(500).json({ error: 'Failed to fetch pending jobs' });
  }
});

// GET /api/print/jobs — list all jobs (dashboard view)
router.get('/jobs', async (req, res) => {
  try {
    const db = await readJSON(PRINT_JOBS_DB, { jobs: [] });
    const { status } = req.query;
    let jobs = db.jobs;

    if (status) {
      jobs = jobs.filter(j => j.status === status);
    }

    // Return jobs without the potentially large pdfData payload
    const summary = jobs.map(j => ({
      id: j.id,
      templateName: j.templateName,
      printer: j.printer,
      copies: j.copies,
      paperSize: j.paperSize,
      status: j.status,
      createdBy: j.createdBy,
      createdAt: j.createdAt,
      claimedBy: j.claimedBy,
      claimedAt: j.claimedAt,
      completedAt: j.completedAt,
      failedAt: j.failedAt,
      errorMessage: j.errorMessage
    }));

    res.json(summary);
  } catch (err) {
    logger.error('List jobs error:', err);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// POST /api/print/jobs/:id/claim — print client claims a job
router.post('/jobs/:id/claim', async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId } = req.body;
    const db = await readJSON(PRINT_JOBS_DB, { jobs: [] });
    const job = db.jobs.find(j => j.id === id);

    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'pending') {
      return res.status(409).json({ error: 'Job already claimed', status: job.status });
    }

    job.status = 'printing';
    job.claimedBy = clientId || 'unknown';
    job.claimedAt = new Date().toISOString();
    await writeJSON(PRINT_JOBS_DB, db);

    logger.info(`🖨️  Job ${id} claimed by ${clientId}`);
    // Return full job including pdfData so the client can print
    res.json({ message: 'Job claimed', job });
  } catch (err) {
    logger.error('Claim job error:', err);
    res.status(500).json({ error: 'Failed to claim job' });
  }
});

// POST /api/print/jobs/:id/complete — mark a job as completed
router.post('/jobs/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId, printDetails } = req.body;
    const db = await readJSON(PRINT_JOBS_DB, { jobs: [] });
    const job = db.jobs.find(j => j.id === id);

    if (!job) return res.status(404).json({ error: 'Job not found' });

    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.printDetails = printDetails || {};
    // Strip pdfData to save space
    job.pdfData = null;
    await writeJSON(PRINT_JOBS_DB, db);

    logger.info(`✅ Job ${id} completed by ${clientId}`);
    res.json({ message: 'Job completed' });
  } catch (err) {
    logger.error('Complete job error:', err);
    res.status(500).json({ error: 'Failed to complete job' });
  }
});

// POST /api/print/jobs/:id/fail — mark a job as failed
router.post('/jobs/:id/fail', async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId, errorMessage, shouldRetry } = req.body;
    const db = await readJSON(PRINT_JOBS_DB, { jobs: [] });
    const job = db.jobs.find(j => j.id === id);

    if (!job) return res.status(404).json({ error: 'Job not found' });

    const willRetry = shouldRetry !== false && job.retryCount < 3;
    if (willRetry) {
      job.status = 'pending';      // put back in queue
      job.retryCount = (job.retryCount || 0) + 1;
      job.claimedBy = null;
      job.claimedAt = null;
    } else {
      job.status = 'failed';
      job.failedAt = new Date().toISOString();
    }
    job.errorMessage = errorMessage || 'Unknown error';
    await writeJSON(PRINT_JOBS_DB, db);

    logger.info(`💥 Job ${id} failed — ${willRetry ? 'will retry' : 'permanent'}`);
    res.json({ message: willRetry ? 'Job will be retried' : 'Job failed permanently', willRetry });
  } catch (err) {
    logger.error('Fail job error:', err);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// ────────────────────────────────────────────────────────────────────
//  PRINT CLIENTS
// ────────────────────────────────────────────────────────────────────

// POST /api/print/clients/register — register a print client
router.post('/clients/register', async (req, res) => {
  try {
    const { clientId, name, locationId, description } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const db = await readJSON(PRINT_CLIENTS_DB, { clients: [] });
    const existing = db.clients.findIndex(c => c.clientId === clientId);

    const client = {
      clientId,
      name: name || `Client ${clientId.substring(0, 8)}`,
      locationId: locationId || null,
      description: description || '',
      lastSeen: new Date().toISOString(),
      registeredAt: existing >= 0 ? db.clients[existing].registeredAt : new Date().toISOString()
    };

    if (existing >= 0) {
      db.clients[existing] = { ...db.clients[existing], ...client };
    } else {
      db.clients.push(client);
    }
    await writeJSON(PRINT_CLIENTS_DB, db);

    logger.info(`📋 Print client registered: ${name} (${clientId})`);
    res.json({ message: 'Client registered', client });
  } catch (err) {
    logger.error('Register client error:', err);
    res.status(500).json({ error: 'Failed to register client' });
  }
});

// ────────────────────────────────────────────────────────────────────
//  PRINTERS
// ────────────────────────────────────────────────────────────────────

// GET /api/print/printers — list registered printers
router.get('/printers', async (_req, res) => {
  try {
    const db = await readJSON(PRINTERS_DB, { printers: [] });
    res.json(db.printers);
  } catch (err) {
    logger.error('List printers error:', err);
    res.status(500).json({ error: 'Failed to list printers' });
  }
});

// POST /api/print/client/register-printers — register printers from a client
router.post('/client/register-printers', async (req, res) => {
  try {
    const { clientId, printers } = req.body;
    if (!clientId || !Array.isArray(printers)) {
      return res.status(400).json({ error: 'clientId and printers array required' });
    }

    const db = await readJSON(PRINTERS_DB, { printers: [] });

    for (const p of printers) {
      const idx = db.printers.findIndex(
        x => x.systemPrinterName === p.systemPrinterName && x.clientId === clientId
      );
      const record = {
        id: idx >= 0 ? db.printers[idx].id : uuidv4(),
        clientId,
        name: p.name,
        type: p.type || 'Generic',
        connectionType: p.connectionType || 'network',
        status: p.status || 'online',
        systemPrinterName: p.systemPrinterName || p.name,
        lastSeen: new Date().toISOString()
      };
      if (idx >= 0) {
        db.printers[idx] = record;
      } else {
        db.printers.push(record);
      }
    }

    await writeJSON(PRINTERS_DB, db);
    logger.info(`🖨️  ${printers.length} printer(s) registered from client ${clientId}`);
    res.json({ message: `${printers.length} printer(s) registered` });
  } catch (err) {
    logger.error('Register printers error:', err);
    res.status(500).json({ error: 'Failed to register printers' });
  }
});

// PUT /api/print/client/printer-status — update printer statuses
router.put('/client/printer-status', async (req, res) => {
  try {
    const { clientId, printerStatuses } = req.body;
    if (!clientId || !Array.isArray(printerStatuses)) {
      return res.status(400).json({ error: 'clientId and printerStatuses array required' });
    }

    const db = await readJSON(PRINTERS_DB, { printers: [] });

    for (const update of printerStatuses) {
      const printer = db.printers.find(
        p => p.name === update.name && p.clientId === clientId
      );
      if (printer) {
        printer.status = update.status;
        printer.lastSeen = new Date().toISOString();
      }
    }

    await writeJSON(PRINTERS_DB, db);
    res.json({ message: `Updated ${printerStatuses.length} printer statuses` });
  } catch (err) {
    logger.error('Update printer status error:', err);
    res.status(500).json({ error: 'Failed to update printer status' });
  }
});

// DELETE /api/print/printers/all — clear all printers
router.delete('/printers/all', async (_req, res) => {
  try {
    const db = await readJSON(PRINTERS_DB, { printers: [] });
    const deletedCount = db.printers.length;
    db.printers = [];
    await writeJSON(PRINTERS_DB, db);

    logger.info(`🗑️  Cleared ${deletedCount} printers from server`);
    res.json({ message: 'All printers cleared', deletedCount });
  } catch (err) {
    logger.error('Clear printers error:', err);
    res.status(500).json({ error: 'Failed to clear printers' });
  }
});

// ────────────────────────────────────────────────────────────────────
//  PRINT CLIENT TOKENS (informational)
// ────────────────────────────────────────────────────────────────────

// GET /api/print-client-tokens — list permanent tokens (public info only)
router.get('/print-client-tokens', async (_req, res) => {
  // Return empty list — permanent token management is optional
  res.json([]);
});

module.exports = router;
module.exports.printAuth = printAuth;
