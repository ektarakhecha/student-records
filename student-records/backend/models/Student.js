const mongoose = require('mongoose');

const STATUSES = ['Active', 'Inactive', 'Graduated'];

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name must be 100 characters or fewer'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      maxlength: [254, 'Email must be 254 characters or fewer'],
      match: [/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/, 'Please enter a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, 'Phone must be 20 characters or fewer'],
      default: undefined,
    },
    studentId: {
      type: String,
      trim: true,
      maxlength: [30, 'Student ID must be 30 characters or fewer'],
      default: undefined,
    },
    course: {
      type: String,
      trim: true,
      maxlength: [100, 'Course must be 100 characters or fewer'],
      default: undefined,
    },
    semester: {
      type: Number,
      min: [1, 'Semester must be between 1 and 12'],
      max: [12, 'Semester must be between 1 and 12'],
      validate: {
        validator: (v) => v == null || Number.isInteger(v),
        message: 'Semester must be a whole number',
      },
      default: undefined,
    },
    enrollmentDate: {
      type: Date,
      default: undefined,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'Active',
    },
  },
  { timestamps: true }
);

// Keep the existing collection name so existing records remain accessible.
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema, 'students');
Student.STATUSES = STATUSES;

module.exports = Student;
