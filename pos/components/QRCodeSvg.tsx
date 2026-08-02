'use client';

import { useMemo } from 'react';
import { generateQrMatrix } from '@/lib/qr';

export default function QRCodeSvg({ value, size = 120, className = '' }: { value: string; size?: number; className?: string }) {
  const matrix = useMemo(() => generateQrMatrix(value), [value]);
  const n = matrix.length;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      className={`shape-rendering-crisp ${className}`}
      aria-label={`Code QR pour ${value}`}
    >
      <rect width={n} height={n} fill="#FFFFFF" />
      {matrix.map((row, r) =>
        row.map((cell, c) =>
          cell ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#000000" /> : null
        )
      )}
    </svg>
  );
}
