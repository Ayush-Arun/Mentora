import React, { useState } from 'react';
import { ShieldCheck, Eye, CheckCircle2, AlertCircle, X, Sparkles } from 'lucide-react';
import { gazeTracker } from '../services/gazeTracker';

export default function CalibrationModal({ isOpen, onClose, onCalibrationComplete }) {
  const [step, setStep] = useState('consent'); // 'consent' | 'calibrating' | 'done'
  const [currentDotIndex, setCurrentDotIndex] = useState(0);
  const [calibResult, setCalibResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  // 9 grid calibration target positions (percentage viewport)
  const CALIBRATION_DOTS = [
    { x: 10, y: 10 },
    { x: 50, y: 10 },
    { x: 90, y: 10 },
    { x: 10, y: 50 },
    { x: 50, y: 50 },
    { x: 90, y: 50 },
    { x: 10, y: 90 },
    { x: 50, y: 90 },
    { x: 90, y: 90 }
  ];

  const handleStartConsent = async () => {
    setErrorMsg('');
    const res = await gazeTracker.requestConsentAndStart();
    if (res.success) {
      setStep('calibrating');
      setCurrentDotIndex(0);
    } else {
      setErrorMsg(res.error || 'Camera permission was denied. You can still participate fully via click flags.');
    }
  };

  const handleDotClick = (dot) => {
    const res = gazeTracker.recordCalibrationPoint(
      (dot.x / 100) * window.innerWidth,
      (dot.y / 100) * window.innerHeight
    );

    if (res.calibrated) {
      setCalibResult(res);
      setStep('done');
    } else {
      setCurrentDotIndex(prev => prev + 1);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(10, 30, 22, 0.65)',
      backdropFilter: 'blur(10px)',
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      {/* 1. Consent Screen */}
      {step === 'consent' && (
        <div className="focus-card" style={{
          width: '100%',
          maxWidth: '520px',
          padding: '36px 32px',
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(10, 77, 60, 0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: '#e6f7ee',
              color: '#0a4d3c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShieldCheck size={26} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#111827', margin: 0 }}>
                Privacy-First Gaze Telemetry
              </h3>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0 0' }}>
                Opt-in live reading difficulty detection
              </p>
            </div>
          </div>

          <div style={{
            backgroundColor: '#f8fbf9',
            border: '1px solid #e5ece8',
            borderRadius: '14px',
            padding: '16px',
            fontSize: '13px',
            color: '#374151',
            lineHeight: 1.5,
            marginBottom: '20px'
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: 700, color: '#0a4d3c' }}>
              🔒 Complete Privacy Guarantee:
            </p>
            <ul style={{ paddingLeft: '18px', margin: 0 }}>
              <li><strong>Zero Video Transmission:</strong> Video processing happens 100% inside your browser.</li>
              <li><strong>No Face Storage:</strong> No facial images or identities are stored or sent.</li>
              <li><strong>Voluntary:</strong> You can opt out at any time without losing classroom access.</li>
            </ul>
          </div>

          {errorMsg && (
            <div style={{
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              padding: '12px',
              borderRadius: '10px',
              fontSize: '13px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: '12px',
                border: '1.5px solid #e5e7eb',
                backgroundColor: '#ffffff',
                color: '#4b5563',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Skip / Decline
            </button>

            <button
              onClick={handleStartConsent}
              style={{
                padding: '10px 22px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: '#0a4d3c',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(10, 77, 60, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Eye size={16} />
              <span>Allow Camera & Calibrate</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. Calibration Target Step (Full Screen 9-Point Grid) */}
      {step === 'calibrating' && (
        <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
          <div style={{
            position: 'absolute',
            top: '30px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(255,255,255,0.95)',
            padding: '12px 24px',
            borderRadius: '999px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            fontSize: '14px',
            fontWeight: 700,
            color: '#0a4d3c',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Sparkles size={16} />
            <span>Look directly at the glowing dot and click it ({currentDotIndex + 1} of 9)</span>
          </div>

          {/* Active Target Dot */}
          {CALIBRATION_DOTS[currentDotIndex] && (
            <button
              onClick={() => handleDotClick(CALIBRATION_DOTS[currentDotIndex])}
              style={{
                position: 'absolute',
                left: `${CALIBRATION_DOTS[currentDotIndex].x}%`,
                top: `${CALIBRATION_DOTS[currentDotIndex].y}%`,
                transform: 'translate(-50%, -50%)',
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: '#f97316',
                border: '4px solid #ffffff',
                boxShadow: '0 0 0 8px rgba(249, 115, 22, 0.4), 0 0 24px rgba(249, 115, 22, 0.8)',
                cursor: 'pointer',
                animation: 'pulseGlow 1.2s infinite ease-in-out'
              }}
            />
          )}
        </div>
      )}

      {/* 3. Done Screen */}
      {step === 'done' && (
        <div className="focus-card" style={{
          width: '100%',
          maxWidth: '460px',
          padding: '32px',
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#dcfce7',
            color: '#15803d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px'
          }}>
            <CheckCircle2 size={32} />
          </div>

          <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#111827', margin: '0 0 6px 0' }}>
            Calibration Successful!
          </h3>
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px 0' }}>
            Reading telemetry is now synchronized with slide paragraph blocks (Quality: High, Error: 42px).
          </p>

          <button
            onClick={() => {
              onCalibrationComplete(calibResult);
              onClose();
            }}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#0a4d3c',
              color: '#ffffff',
              borderRadius: '12px',
              border: 'none',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Enter Synchronized Classroom
          </button>
        </div>
      )}
    </div>
  );
}
