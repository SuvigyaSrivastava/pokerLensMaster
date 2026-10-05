import React, { useRef, useState, useEffect } from 'react';

export default function CameraCapture({ onCapture, capturedB64, isAnalyzing }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [cameraAvailable, setCameraAvailable] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [streamActive, setStreamActive] = useState(false);

  useEffect(() => {
    let stream = null;

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' } })
        .then((s) => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play().catch(() => {});
          }
          setCameraAvailable(true);
          setStreamActive(true);
        })
        .catch((err) => {
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

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const b64 = dataUrl.split(',')[1];
    onCapture(b64);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const b64 = result.split(',')[1];
        onCapture(b64);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-[#1A2E1C] border border-[#2a452d] rounded-xl p-4 flex flex-col gap-4 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
          <span>📹</span> Table Vision
        </h2>
        {cameraAvailable && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[#00C853] bg-[#00C853]/10 px-2 py-0.5 rounded-full border border-[#00C853]/30">
            <span className="w-2 h-2 rounded-full bg-[#00C853] animate-pulse"></span>
            Live Feed
          </span>
        )}
      </div>

      {cameraAvailable ? (
        <div className="relative rounded-lg overflow-hidden bg-black/40 aspect-[4/3] flex items-center justify-center border border-[#2a452d]">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 border-2 border-dashed border-[#00C853]/30 pointer-events-none rounded-lg m-4 flex items-center justify-center">
            <span className="text-xs text-white/40 bg-black/60 px-2 py-1 rounded">
              Position cards inside frame
            </span>
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
            onClick={handleCapture}
            disabled={isAnalyzing}
            className="flex-1 bg-[#00C853] hover:bg-[#00b34a] text-black font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>📷</span> Snap Table
          </button>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isAnalyzing}
          className={`${
            cameraAvailable ? 'flex-initial' : 'flex-1'
          } bg-[#0D1B0F] hover:bg-[#132817] text-gray-200 border border-[#2a452d] hover:border-[#00C853]/50 font-semibold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50`}
        >
          <span>📁</span> {cameraAvailable ? 'Upload File' : 'Upload Card Photo'}
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

      {/* Captured Image Preview */}
      {capturedB64 && (
        <div className="mt-1 pt-3 border-t border-[#2a452d] flex items-center gap-3">
          <img
            src={`data:image/jpeg;base64,${capturedB64}`}
            alt="Captured poker scene"
            className="w-16 h-16 object-cover rounded-md border border-[#00C853]/40 shadow"
          />
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-200">Frame captured</p>
            <p className="text-[11px] text-gray-400">
              Ready to analyze cards with Gemini Vision
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
