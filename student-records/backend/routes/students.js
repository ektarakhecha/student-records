const express = require('express');
const Student = require('../models/Student');
const { parseStudent } = require('../utils/validate');

const router = express.Router();
const { STATUSES } = Student;

const ID_RE = /^[a-f\d]{24}$/i;
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name_asc: { name: 1 },
  name_desc: { name: -1 },
  email_asc: { email: 1 },
};

// Old records may have no "status" — show them as Active
const present = (s) => ({ ...s, status: s.status || 'Active' });

function fail(res, err, message) {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join(', ') });
  }
  if (err.code === 11000) {
    const isSid = Object.keys(err.keyPattern || {})[0] === 'studentId';
    const field = isSid ? 'studentId' : 'email';
    return res.status(409).json({
      error: isSid ? 'A student with this Student ID already exists.' : 'A student with this email already exists.',
      fields: { [field]: 'Already in use.' },
    });
  }
  console.error(message, err.message);
  res.status(500).json({ error: message });
}

function buildFilter(q) {
  const and = [];
  if (typeof q.search === 'string' && q.search.trim()) {
    const rx = new RegExp(escapeRegex(q.search.trim().slice(0, 100)), 'i');
    and.push({ $or: [{ name: rx }, { email: rx }, { studentId: rx }] });
  }
  if (typeof q.status === 'string' && STATUSES.includes(q.status)) {
    and.push(q.status === 'Active'
      ? { $or: [{ status: 'Active' }, { status: { $exists: false } }] }
      : { status: q.status });
  }
  if (typeof q.course === 'string' && q.course.trim()) and.push({ course: q.course.trim() });
  return and.length ? { $and: and } : {};
}

function validId(req, res, next) {
  if (!ID_RE.test(req.params.id)) return res.status(400).json({ error: 'Invalid student id.' });
  next();
}

// ---- List (paginated when ?page= is present; plain array otherwise, as before) ----
router.get('/', async (req, res) => {
  try {
    if (!('page' in req.query)) {
      const all = await Student.find().sort({ createdAt: -1 }).lean();
      return res.json(all.map(present));
    }
    const filter = buildFilter(req.query);
    const sort = { ...(SORTS[req.query.sort] || SORTS.newest), _id: 1 };
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

    const [data, total] = await Promise.all([
      Student.find(filter).sort(sort).collation({ locale: 'en' }).skip((page - 1) * limit).limit(limit).lean(),
      Student.countDocuments(filter),
    ]);
    res.json({
      data: data.map(present),
      pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) },
    });
  } catch (err) {
    fail(res, err, 'Could not fetch students from the database.');
  }
});

// ---- CSV export (must be before /:id) ----
function csvCell(v) {
  if (v === undefined || v === null) return '';
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // prevents spreadsheet formula injection
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

router.get('/export/csv', async (req, res) => {
  try {
    const sort = { ...(SORTS[req.query.sort] || SORTS.newest), _id: 1 };
    const rows = await Student.find(buildFilter(req.query)).sort(sort).collation({ locale: 'en' }).limit(50000).lean();
    const header = ['Name', 'Email', 'Phone', 'Student ID', 'Course', 'Semester', 'Enrollment Date', 'Status', 'Added On'];
    const lines = [header.join(',')].concat(
      rows.map((s) =>
        [s.name, s.email, s.phone, s.studentId, s.course, s.semester, s.enrollmentDate, s.status || 'Active', s.createdAt]
          .map(csvCell).join(',')
      )
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="students-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (err) {
    fail(res, err, 'Could not export students.');
  }
});

// ---- Get one ----
router.get('/:id', validId, async (req, res) => {
  try {
    const s = await Student.findById(req.params.id).lean();
    if (!s) return res.status(404).json({ error: 'Student not found.' });
    res.json(present(s));
  } catch (err) {
    fail(res, err, 'Could not fetch the student.');
  }
});

// ---- Create ----
router.post('/', async (req, res) => {
  const { set, fields } = parseStudent(req.body);
  if (Object.keys(fields).length) return res.status(400).json({ error: Object.values(fields).join(' '), fields });
  try {
    if (await Student.exists({ email: set.email })) {
      return res.status(409).json({ error: 'A student with this email already exists.', fields: { email: 'Already in use.' } });
    }
    if (set.studentId && (await Student.exists({ studentId: set.studentId }))) {
      return res.status(409).json({ error: 'A student with this Student ID already exists.', fields: { studentId: 'Already in use.' } });
    }
    const s = await Student.create(set);
    res.status(201).json(present(s.toObject()));
  } catch (err) {
    fail(res, err, 'Could not save the student to the database.');
  }
});

// ---- Update ----
router.put('/:id', validId, async (req, res) => {
  const { set, unset, fields } = parseStudent(req.body);
  if (Object.keys(fields).length) return res.status(400).json({ error: Object.values(fields).join(' '), fields });
  try {
    const notSelf = { _id: { $ne: req.params.id } };
    if (await Student.exists({ email: set.email, ...notSelf })) {
      return res.status(409).json({ error: 'Another student already uses this email.', fields: { email: 'Already in use.' } });
    }
    if (set.studentId && (await Student.exists({ studentId: set.studentId, ...notSelf }))) {
      return res.status(409).json({ error: 'Another student already uses this Student ID.', fields: { studentId: 'Already in use.' } });
    }
    const update = { $set: set };
    if (unset.length) update.$unset = Object.fromEntries(unset.map((k) => [k, '']));
    const s = await Student.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).lean();
    if (!s) return res.status(404).json({ error: 'Student not found.' });
    res.json(present(s));
  } catch (err) {
    fail(res, err, 'Could not update the student.');
  }
});

// ---- Delete ----
router.delete('/:id', validId, async (req, res) => {
  try {
    const s = await Student.findByIdAndDelete(req.params.id).lean();
    if (!s) return res.status(404).json({ error: 'Student not found.' });
    res.json({ message: 'Student deleted.', id: req.params.id });
  } catch (err) {
    fail(res, err, 'Could not delete the student.');
  }
});

module.exports = router;