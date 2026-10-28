require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const Student = require('./models/Student');
const studentRoutes = require('./routes/students');
const statsRoutes = require('./routes/stats');

const PORT = process.env.PORT || 5001;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is missing. Create backend/.env (see .env.example).');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ---- Connect to MongoDB Atlas (unchanged) ----
mongoose
  .connect(MONGODB_URI, {
    dbName: 'student_test_db',
    serverSelectionTimeoutMS: 10000,
  })
  .then(async () => {
    console.log('Connected to MongoDB Atlas (database: student_test_db)');
    await ensureIndexes();
  })
  .catch((err) => console.error('MongoDB connection failed:', err.message));

mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

function dbIsConnected() {
  return mongoose.connection.readyState === 1;
}

// Unique indexes are added carefully: if your test data already has duplicates,
// creation fails, we log a warning, and the app-level duplicate checks still work.
async function ensureIndexes() {
  try {
    await Student.collection.createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
    await Student.collection.createIndex(
      { studentId: 1 },
      { unique: true, name: 'studentId_unique', partialFilterExpression: { studentId: { $type: 'string' } } }
    );
    console.log('Unique indexes ready (email, studentId)');
  } catch (err) {
    console.warn('Could not create unique indexes (duplicate data may exist):', err.message);
  }
}

function requireDb(req, res, next) {
  if (!dbIsConnected()) {
    return res.status(503).json({ error: 'Database is not connected. Check /api/health.' });
  }
  next();
}

// ---- Health check (unchanged) ----
app.get('/api/health', async (req, res) => {
  if (!dbIsConnected()) {
    return res.status(503).json({
      status: 'error',
      database: 'disconnected',
      message: 'Backend is running but NOT connected to MongoDB Atlas. Check the server terminal for details.',
    });
  }
  try {
    await mongoose.connection.db.admin().ping();
    res.json({
      status: 'ok',
      database: 'connected',
      dbName: mongoose.connection.name,
      message: 'Backend is connected to MongoDB Atlas.',
    });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable', message: err.message });
  }
});

app.use('/api/students', requireDb, studentRoutes);
app.use('/api/stats', requireDb, statsRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

// ---- Error handler ----
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON in request.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});