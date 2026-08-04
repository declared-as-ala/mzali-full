'use client';

import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** Modules of blank border on each side — without this a real scanner can't
 *  lock onto the finder patterns (the "quiet zone" is part of the QR spec,
 *  not just cosmetic padding). */
const QUIET_ZONE = 4;

export default function QRCodeSvg({ value, size = 120, className = '' }: { value: string; size?: number; className?: string }) {
  const { matrix, n } = useMemo(() => {
    // Type 0 = auto-select the smallest version that fits; 'M' = ~15% error
    // correction, enough margin for a slightly worn/creased receipt.
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const rows: boolean[][] = [];
    for (let r = 0; r < count; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < count; c++) row.push(qr.isDark(r, c));
      rows.push(row);
    }
    return { matrix: rows, n: count };
  }, [value]);

  const total = n + QUIET_ZONE * 2;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      className={`shape-rendering-crisp ${className}`}
      aria-label={`Code QR pour ${value}`}
    >
      <rect width={total} height={total} fill="#FFFFFF" />
      {matrix.map((row, r) =>
        row.map((cell, c) =>
          cell ? <rect key={`${r}-${c}`} x={c + QUIET_ZONE} y={r + QUIET_ZONE} width={1} height={1} fill="#000000" /> : null
        )
      )}
    </svg>
  );
}
