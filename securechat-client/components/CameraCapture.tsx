"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async (facing: "environment" | "user") => {
    stopStream();
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError(
        "Could not access camera. Please check your browser permissions and try again."
      );
    }
  }, [stopStream]);

  useEffect(() => {
    startCamera(facingMode);

    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      setHasMultipleCameras(videoInputs.length > 1);
    });

    return () => {
      stopStream();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFlipCamera = () => {
    const newFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newFacing);
    startCamera(newFacing);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        stopStream();
        onCapture(file);
      },
      "image/jpeg",
      0.85
    );
  };

  const handleClose = () => {
    stopStream();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Close button */}
      <div className="absolute left-4 top-4 z-10">
        <button
          onClick={handleClose}
          className="rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
          title="Close camera"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Video preview */}
      <div className="flex flex-1 items-center justify-center">
        {error ? (
          <div className="px-8 text-center">
            <svg className="mx-auto mb-4 h-16 w-16 text-dc-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-lg text-dc-text-secondary">{error}</p>
            <button
              onClick={handleClose}
              className="mt-6 rounded bg-dc-brand px-6 py-2 font-medium text-white transition-colors hover:bg-dc-brand-hover"
            >
              Close
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>

      {/* Controls */}
      {!error && (
        <div className="flex items-center justify-center gap-8 pb-10 pt-4">
          {hasMultipleCameras ? (
            <button
              onClick={handleFlipCamera}
              className="rounded-full bg-white/15 p-3 text-white transition-colors hover:bg-white/25"
              title="Flip camera"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          ) : (
            <div className="w-12" />
          )}

          <button
            onClick={handleCapture}
            className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-colors hover:bg-white/40"
            title="Take photo"
          >
            <div className="h-12 w-12 rounded-full bg-white" />
          </button>

          <div className="w-12" />
        </div>
      )}
    </div>
  );
}
