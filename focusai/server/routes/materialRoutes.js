/**
 * FocusAI — Material Routes
 * POST /api/v1/materials/upload       — upload and extract document (teacher only)
 * GET  /api/v1/materials/:id          — get material with pages & content blocks
 * GET  /api/v1/classes/:classId/materials — list materials for a class
 */
import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { uploadMiddleware } from '../middleware/upload.js';
import { DocumentService } from '../services/documentService.js';

export const materialRoutes = Router();

// Upload document (teacher only)
materialRoutes.post(
  '/upload',
  authenticateToken,
  requireRole('teacher'),
  uploadMiddleware.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: {
            code: 'file_required',
            message: 'No file uploaded. Please upload a PDF, PPTX, or text file.',
            request_id: req.id,
          },
        });
      }

      const { class_id, session_id } = req.body;
      if (!class_id) {
        return res.status(400).json({
          error: {
            code: 'class_id_required',
            message: 'class_id is required for uploading materials.',
            request_id: req.id,
          },
        });
      }

      const material = await DocumentService.uploadAndProcessMaterial({
        classId: class_id,
        sessionId: session_id || null,
        teacherId: req.user.id,
        file: req.file,
      });

      res.status(201).json({
        data: material,
        request_id: req.id,
      });
    } catch (err) {
      console.error('Material upload error:', err);
      res.status(err.status || 500).json({
        error: {
          code: 'upload_failed',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);

// Get material with full page & paragraph content
materialRoutes.get(
  '/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const material = await DocumentService.getMaterialWithContent(req.params.id);
      res.json({
        data: material,
        request_id: req.id,
      });
    } catch (err) {
      res.status(err.status || 404).json({
        error: {
          code: 'not_found',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);

// List materials for class
materialRoutes.get(
  '/class/:classId',
  authenticateToken,
  async (req, res) => {
    try {
      const materials = await DocumentService.listMaterialsByClass(req.params.classId);
      res.json({
        data: materials,
        request_id: req.id,
      });
    } catch (err) {
      res.status(err.status || 500).json({
        error: {
          code: 'materials_fetch_error',
          message: err.message,
          request_id: req.id,
        },
      });
    }
  }
);
