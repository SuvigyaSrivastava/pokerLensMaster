import React, { useRef, useState, useEffect, useCallback } from 'react';

export default function CameraCapture({
  onCapture,
  capturedB64,
  isAnalyzing,
  isLiveMode,
  streetBadge = null
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [cameraAvailable, setCameraAvailable] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  useEffect(() => {
    let stream = null;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'environment'
          }
        })
        .then((s) => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play().catch(() => {});
          }
          setCameraAvailable(true);
        })
        .catch(() => {
          setCameraAvailable(false);
          setCameraError('Camera access unavailable or denied. Use file upload below.');
        });
    } else {
      setCameraAvailable(false);
      setCameraError('Camera not supported in this browser. Please upload an image.');
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const grabCurrentFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState < 2) return null;

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return dataUrl.split(',')[1];
  }, []);

  // Continuous auto-sampling when Live Mode is active
  useEffect(() => {
    if (!isLiveMode || !cameraAvailable) return;

    // Immediate first capture
    const firstB64 = grabCurrentFrame();
    if (firstB64 && !isAnalyzing) {
      onCapture(firstB64, true);
    }

    // Interval every 3.2 seconds (balances Gemini 15 RPM free tier rate limit + real-time reaction)
    const interval = setInterval(() => {
      if (!isAnalyzing) {
        const b64 = grabCurrentFrame();
        if (b64) {
          onCapture(b64, true);
        }
      }
    }, 3200);

    return () => clearInterval(interval);
  }, [isLiveMode, cameraAvailable, isAnalyzing, grabCurrentFrame, onCapture]);

  const handleManualCapture = () => {
    const b64 = grabCurrentFrame();
    if (b64) {
      onCapture(b64, false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const b64 = result.split(',')[1];
        onCapture(b64, false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-4 flex flex-col gap-4 shadow-xl relative overflow-hidden">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
          <span>📹</span> Table Vision
        </h2>
        <div className="flex items-center gap-2">
          {isLiveMode ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300 bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-500/50 shadow-sm animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              Auto-Scanning (Live)
            </span>
          ) : cameraAvailable ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#00C853] bg-[#00C853]/10 px-2 py-0.5 rounded-full border border-[#00C853]/30">
              <span className="w-2 h-2 rounded-full bg-[#00C853]"></span>
              Camera Ready
            </span>
          ) : null}
        </div>
      </div>

      {/* Video Viewport with HUD overlay */}
      {cameraAvailable ? (
        <div
          className={`relative rounded-lg overflow-hidden bg-black/50 aspect-[4/3] flex items-center justify-center border-2 transition-all ${
            isLiveMode ? 'border-[#00C853] shadow-[0_0_20px_rgba(0,200,83,0.3)]' : 'border-[#2a452d]'
          }`}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          {/* Target alignment guidelines */}
          <div className="absolute inset-0 border-2 border-dashed border-[#00C853]/25 pointer-events-none rounded-lg m-4 flex flex-col justify-between p-2">
            <div className="flex justify-between items-start">
              <span className="text-[10px] text-[#00C853] font-mono bg-black/70 px-2 py-0.5 rounded">
                [TABLE DETECT]
              </span>
              {streetBadge && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-black/80 text-yellow-300 border border-yellow-500/40 px-2 py-0.5 rounded">
                  {streetBadge}
                </span>
              )}
            </div>

            {/* Radar Scanning Line Animation in Live Mode */}
            {isLiveMode && (
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#00C853] to-transparent opacity-80 animate-bounce pointer-events-none" />
            )}

            <div className="text-center">
              <span className="text-[11px] text-white/70 bg-black/70 px-2.5 py-1 rounded backdrop-blur-sm">
                {isLiveMode ? 'Watching hole cards & board cards...' : 'Position hole cards and community cards in view'}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-black/30 border border-dashed border-gray-600 rounded-lg p-6 text-center flex flex-col items-center justify-center gap-2 min-h-[220px]">
          <span className="text-3xl">📷</span>
          <p className="text-sm text-gray-300 font-medium">Camera not active</p>
          {cameraError && (
            <p className="text-xs text-yellow-400 max-w-xs">{cameraError}</p>
          )}
        </div>
      )}

      {/* Hidden canvas for taking snapshot */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2 items-center">
        {cameraAvailable && (
          <button
            type="button"
            onClick={handleManualCapture}
            disabled={isAnalyzing}
            className="flex-1 bg-[#0D1B0F] hover:bg-[#142817] text-gray-200 border border-[#2a452d] hover:border-[#00C853] font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            <span>📷</span> Single Snap
          </button>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isAnalyzing}
          className={`${
            cameraAvailable ? 'flex-initial' : 'flex-1'
          } bg-[#0D1B0F] hover:bg-[#142817] text-gray-300 border border-[#2a452d] font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-xs`}
        >
          <span>📁</span> Upload Photo
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      {/* Small Captured Image Thumbnail */}
      {capturedB64 && (
        <div className="mt-1 pt-2.5 border-t border-[#2a452d] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img
              src={`data:image/jpeg;base64,${capturedB64}`}
              alt="Live frame"
              className="w-12 h-12 object-cover rounded-md border border-[#00C853]/40 shadow"
            />
            <div>
              <p className="text-xs font-semibold text-gray-200">
                {isLiveMode ? 'Live stream sampling' : 'Snapshot captured'}
              </p>
              <p className="text-[10px] text-gray-400">
                Vision stream feeding AI coach
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
