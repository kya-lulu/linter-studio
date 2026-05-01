'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export default function Modal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.back();
    }
    document.addEventListener('keydown', onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = original;
    };
  }, [router]);

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) router.back();
      }}
      className="fixed inset-0 z-50 overflow-y-auto bg-canvas/25 backdrop-blur-2xl backdrop-saturate-150 animate-[fadeIn_220ms_ease-out]"
      role="dialog"
      aria-modal="true"
    >
      <button
        onClick={() => router.back()}
        aria-label="Close"
        className="fixed top-5 right-5 lg:top-8 lg:right-8 z-10 w-10 h-10 flex items-center justify-center text-ink hover:opacity-60 transition-opacity"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25">
          <path d="M4 4 L16 16 M16 4 L4 16" />
        </svg>
      </button>
      <div className="min-h-full px-6 py-16 lg:px-16 lg:py-20">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
