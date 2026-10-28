const express = require('express');
const Student = require('../models/Student');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const monthStart = new Date(Date.UTC(y, m, 1));
    const trendStart = new Date(Date.UTC(y, m - 5, 1));

    const [total, thisMonth, statusAgg, courseAgg, trendAgg, recent, courses] = await Promise.all([
      Student.countDocuments(),
      Student.countDocuments({ createdAt: { $gte: monthStart } }),
      Student.aggregate([{ $group: { _id: { $ifNull: ['$status', 'Active'] }, count: { $sum: 1 } } }]),
      Student.aggregate([
        { $group: { _id: { $ifNull: ['$course', 'Not specified'] }, count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 10 },
      ]),
      Student.aggregate([
        { $match: { createdAt: { $gte: trendStart } } },
        { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, count: { $sum: 1 } } },
      ]),
      Student.find().sort({ createdAt: -1 }).limit(5).lean(),
      Student.distinct('course'),
    ]);

    const byStatus = { Active: 0, Inactive: 0, Graduated: 0 };
    statusAgg.forEach((r) => { if (r._id in byStatus) byStatus[r._id] = r.count; });

    const counts = new Map(trendAgg.map((r) => [`${r._id.y}-${r._id.m}`, r.count]));
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - i, 1));
      const yy = d.getUTCFullYear();
      const mm = d.getUTCMonth() + 1;
      trend.push({
        year: yy,
        month: mm,
        label: d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
        count: counts.get(`${yy}-${mm}`) || 0,
      });
    }

    res.json({
      total,
      thisMonth,
      byStatus,
      byCourse: courseAgg.map((r) => ({ course: r._id, count: r.count })),
      trend,
      recent: recent.map((s) => ({ ...s, status: s.status || 'Active' })),
      courses: courses.filter(Boolean).sort((a, b) => a.localeCompare(b)),
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: 'Could not load dashboard statistics.' });
  }
});

module.exports = router;