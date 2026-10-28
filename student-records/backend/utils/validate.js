const STATUSES = ['Active', 'Inactive', 'Graduated'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-()\s]{6,20}$/;
const SID_RE = /^[A-Za-z0-9\-_/]{1,30}$/;

// Strip control characters and trim
const clean = (v) => String(v).replace(/[\u0000-\u001F\u007F]/g, '').trim();
const isEmpty = (v) => v === undefined || v === null || v === '';

// Whitelists fields (never passes req.body straight to Mongoose).
// Returns { set, unset, fields } where `fields` holds per-field error messages.
function parseStudent(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const set = {};
  const unset = [];
  const fields = {};

  // name
  const name = typeof b.name === 'string' ? clean(b.name) : '';
  if (!name) fields.name = 'Name is required.';
  else if (name.length > 100) fields.name = 'Name must be 100 characters or fewer.';
  else set.name = name;

  // email
  const email = typeof b.email === 'string' ? clean(b.email).toLowerCase() : '';
  if (!email) fields.email = 'Email is required.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) fields.email = 'Please enter a valid email address.';
  else set.email = email;

  // optional text fields
  const optionalText = (key, max, re, msg) => {
    const raw = b[key];
    if (isEmpty(raw)) return unset.push(key);
    if (typeof raw !== 'string') return (fields[key] = 'Must be text.');
    const v = clean(raw);
    if (!v) return unset.push(key);
    if (v.length > max) return (fields[key] = `Must be ${max} characters or fewer.`);
    if (re && !re.test(v)) return (fields[key] = msg);
    set[key] = v;
  };
  optionalText('phone', 20, PHONE_RE, 'Use 6–20 digits, spaces, + - ( ).');
  optionalText('studentId', 30, SID_RE, 'Letters, numbers, - _ / only (max 30).');
  optionalText('course', 100);

  // semester
  if (isEmpty(b.semester)) unset.push('semester');
  else {
    const n = Number(b.semester);
    if (!Number.isInteger(n) || n < 1 || n > 12) fields.semester = 'Enter a whole number from 1 to 12.';
    else set.semester = n;
  }

  // enrollment date
  if (isEmpty(b.enrollmentDate)) unset.push('enrollmentDate');
  else {
    const d = typeof b.enrollmentDate === 'string' ? new Date(b.enrollmentDate) : null;
    if (!d || isNaN(d.getTime())) fields.enrollmentDate = 'Enter a valid date.';
    else set.enrollmentDate = d;
  }

  // status
  if (!isEmpty(b.status)) {
    if (!STATUSES.includes(b.status)) fields.status = 'Status must be Active, Inactive or Graduated.';
    else set.status = b.status;
  }

  return { set, unset, fields };
}

module.exports = { parseStudent };