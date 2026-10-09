/**
 * FocusAI — File Upload Middleware
 * Handles multipart file uploads (PDF, PPTX, TXT, MD) using Multer memory storage.
 */
import multer from 'multer';
import { config } from '../config.js';

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  // Normalise mime types for common presentation formats
  const allowed = [
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
  ];

  const ext = file.originalname.toLowerCase().split('.').pop();
  const validExtensions = ['pdf', 'ppt', 'pptx', 'txt', 'md'];

  if (allowed.includes(file.mimetype) || validExtensions.includes(ext)) {
    cb(null, true);
  } else {
    const err = new Error(`Unsupported file type: ${file.mimetype || ext}. Supported formats: PDF, PPTX, TXT, MD.`);
    err.status = 400;
    cb(err, false);
  }
}

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSizeBytes, // default 50 MB
    files: 1,
  },
  fileFilter,
});
