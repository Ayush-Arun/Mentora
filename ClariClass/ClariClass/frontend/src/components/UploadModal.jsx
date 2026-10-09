import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Loader2,
  Sparkles,
  Presentation
} from 'lucide-react';
import { apiRequest } from '../api/client';

export default function UploadModal({ isOpen, onClose, onUploadSuccess, sessionRoomCode }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    setError(null);
    const validExtensions = ['.pdf', '.pptx', '.ppt'];
    const hasValidExt = validExtensions.some(ext => selectedFile.name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      setError('Please select a valid PDF (.pdf) or PowerPoint (.pptx, .ppt) presentation.');
      return;
    }

    setFile(selectedFile);
    if (!title) {
      // Clean up extension from name for default title
      const cleanName = selectedFile.name.replace(/\.[^/.]+$/, "");
      setTitle(cleanName);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a document file to upload.');
      return;
    }

    setUploading(true);
    setProgress(15);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title || file.name);

    try {
      // Progress simulation for smooth UX
      const progressTimer = setInterval(() => {
        setProgress(prev => (prev < 85 ? prev + 15 : prev));
      }, 200);

      const res = await apiRequest('/documents/upload', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressTimer);
      setProgress(100);
      setIsSuccess(true);

      setTimeout(() => {
        setUploading(false);
        setIsSuccess(false);
        setFile(null);
        setTitle('');
        onUploadSuccess(res);
        onClose();
      }, 600);

    } catch (err) {
      setUploading(false);
      setError(err.message || 'Failed to upload and parse the document. Please try again.');
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 30, 22, 0.45)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'modalBackdropFade 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '540px',
          background: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(10, 77, 60, 0.25), 0 0 0 1px rgba(10, 77, 60, 0.08)',
          overflow: 'hidden',
          animation: 'modalPop 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px 28px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f5f2'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              backgroundColor: '#e6f7ee',
              color: '#0a4d3c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <UploadCloud size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#111827', margin: 0 }}>
                Upload Lecture Material
              </h3>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, marginTop: '2px' }}>
                Upload PDF or PPT slides for live gaze & difficulty tracking
              </p>
            </div>
          </div>

          <button 
            type="button" 
            onClick={onClose}
            disabled={uploading}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: uploading ? 'not-allowed' : 'pointer',
              color: '#9ca3af',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s'
            }}
            onMouseEnter={(e) => { if (!uploading) e.currentTarget.style.color = '#111827'; }}
            onMouseLeave={(e) => { if (!uploading) e.currentTarget.style.color = '#9ca3af'; }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 28px 28px' }}>
          {error && (
            <div style={{
              marginBottom: '18px',
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fee2e2',
              color: '#dc2626',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Title input */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '13px', 
              fontWeight: 600, 
              color: '#374151', 
              marginBottom: '6px' 
            }}>
              Lecture / Topic Title
            </label>
            <input 
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Physics 101 — Newton's Laws"
              disabled={uploading}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1.5px solid #e5e7eb',
                fontSize: '14px',
                color: '#111827',
                outline: 'none',
                transition: 'border-color 0.2s',
                backgroundColor: '#ffffff'
              }}
              onFocus={(e) => e.target.style.borderColor = '#0a4d3c'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${isDragging ? '#0a4d3c' : file ? '#10b981' : '#cbd5e1'}`,
              backgroundColor: isDragging ? '#e6f7ee' : file ? '#f0fdf4' : '#fafcfb',
              borderRadius: '16px',
              padding: '30px 20px',
              textAlign: 'center',
              cursor: uploading ? 'wait' : 'pointer',
              transition: 'all 0.2s ease',
              marginBottom: '20px'
            }}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange}
              accept=".pdf,.pptx,.ppt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
              style={{ display: 'none' }}
              disabled={uploading}
            />

            {file ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  backgroundColor: '#dcfce7',
                  color: '#15803d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {file.name.endsWith('.pdf') ? <FileText size={26} /> : <Presentation size={26} />}
                </div>
                <p style={{ fontSize: '15px', fontWeight: 700, color: '#111827', margin: 0 }}>
                  {file.name}
                </p>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                  {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready to analyze
                </p>
                <span style={{ fontSize: '12px', color: '#0a4d3c', fontWeight: 600, textDecoration: 'underline' }}>
                  Click to replace file
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <UploadCloud size={24} />
                </div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', margin: 0 }}>
                  Drop your PDF or PowerPoint here, or <span style={{ color: '#0a4d3c', textDecoration: 'underline' }}>browse</span>
                </p>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                  Supports .PDF, .PPTX, and .PPT files (up to 50MB)
                </p>
              </div>
            )}
          </div>

          {/* Uploading progress */}
          {uploading && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={14} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                  Parsing lecture slides and semantic concepts...
                </span>
                <span>{progress}%</span>
              </div>
              <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    width: `${progress}%`, 
                    height: '100%', 
                    backgroundColor: '#0a4d3c', 
                    borderRadius: '999px',
                    transition: 'width 0.2s ease'
                  }} 
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                border: '1.5px solid #e5e7eb',
                backgroundColor: '#ffffff',
                color: '#374151',
                fontSize: '14px',
                fontWeight: 600,
                cursor: uploading ? 'not-allowed' : 'pointer'
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!file || uploading}
              style={{
                padding: '10px 24px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: !file || uploading ? '#94a3b8' : '#0a4d3c',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 700,
                cursor: !file || uploading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: !file || uploading ? 'none' : '0 4px 12px rgba(10, 77, 60, 0.25)',
                transition: 'all 0.2s ease'
              }}
            >
              {uploading ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Processing...
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 size={16} />
                  Done!
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Start Live Session
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
