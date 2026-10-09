/**
 * FocusAI — Class Routes
 *
 * Teacher endpoints:
 *   POST   /api/v1/classes                       — create class
 *   GET    /api/v1/classes                       — list own classes
 *   GET    /api/v1/classes/:classId              — get class + members
 *   PATCH  /api/v1/classes/:classId/settings     — update threshold/settings
 *   DELETE /api/v1/classes/:classId/members/:sid — remove student
 *
 * Student endpoints:
 *   POST   /api/v1/classes/join                  — join via class_code
 *   GET    /api/v1/classes/my                    — list enrolled classes
 */
import { Router } from 'express';
import { ClassService } from '../services/classService.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

export const classRouter = Router();

// All class routes require authentication
classRouter.use(authenticateToken);

// ─── Teacher: Create Class ─────────────────────────────────────────────────────
classRouter.post('/', requireRole('teacher'), async (req, res, next) => {
  try {
    const { name, subject, expectedStudents } = req.body;
    const cls = await ClassService.createClass(req.userId, { name, subject, expectedStudents });
    return res.status(201).json({ data: cls, request_id: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── Teacher: List Own Classes ─────────────────────────────────────────────────
classRouter.get('/', requireRole('teacher'), async (req, res, next) => {
  try {
    const classes = await ClassService.listTeacherClasses(req.userId);
    return res.json({ data: classes, request_id: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── Teacher: Get Class Detail ─────────────────────────────────────────────────
classRouter.get('/:classId', requireRole('teacher'), async (req, res, next) => {
  try {
    const cls = await ClassService.getClass(req.params.classId, req.userId);
    return res.json({ data: cls, request_id: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── Teacher: Update Class Settings ───────────────────────────────────────────
classRouter.patch('/:classId/settings', requireRole('teacher'), async (req, res, next) => {
  try {
    const updated = await ClassService.updateClassSettings(
      req.params.classId,
      req.userId,
      req.body
    );
    return res.json({ data: updated, request_id: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── Teacher: Remove Student ───────────────────────────────────────────────────
classRouter.delete('/:classId/members/:studentId', requireRole('teacher'), async (req, res, next) => {
  try {
    const result = await ClassService.removeStudent(
      req.params.classId,
      req.userId,
      req.params.studentId
    );
    return res.json({ data: result, request_id: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── Student: Join Class via Code ──────────────────────────────────────────────
classRouter.post('/join', requireRole('student'), async (req, res, next) => {
  try {
    const { class_code } = req.body;
    const result = await ClassService.joinClass(req.userId, class_code);
    return res.status(201).json({ data: result, request_id: req.id });
  } catch (err) {
    next(err);
  }
});

// ─── Student: List Enrolled Classes ───────────────────────────────────────────
classRouter.get('/my', requireRole('student'), async (req, res, next) => {
  try {
    const classes = await ClassService.listStudentClasses(req.userId);
    return res.json({ data: classes, request_id: req.id });
  } catch (err) {
    next(err);
  }
});
