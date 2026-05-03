"use client";

import { useState } from "react";

interface StarPickerProps {
  value: number;
  onChange: (stars: number) => void;
}

export function StarPicker({ value, onChange }: StarPickerProps) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-1" role="group" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          className="text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center transition-transform hover:scale-110"
        >
          <span
            className={
              star <= (hovered || value) ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"
            }
          >
            ★
          </span>
        </button>
      ))}
    </div>
  );
}
