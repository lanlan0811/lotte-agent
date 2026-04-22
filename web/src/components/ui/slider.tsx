import * as React from "react";
import { cn } from "@/lib/utils";

const Slider = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    value?: number[];
    min?: number;
    max?: number;
    step?: number;
    onValueChange?: (value: number[]) => void;
  }
>(({ className, value = [0], min = 0, max = 100, step = 1, onValueChange, ...props }, ref) => {
  const percentage = ((value[0] - min) / (max - min)) * 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    onValueChange?.([v]);
  };

  return (
    <div
      ref={ref}
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    >
      <div className="relative h-2 w-full grow overflow-hidden rounded-full bg-primary/20">
        <div
          className="absolute h-full bg-primary rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={handleChange}
        className="absolute w-full h-2 opacity-0 cursor-pointer"
      />
      <div
        className="absolute h-5 w-5 rounded-full border-2 border-primary bg-background shadow-sm pointer-events-none"
        style={{ left: `calc(${percentage}% - 10px)` }}
      />
    </div>
  );
});
Slider.displayName = "Slider";

export { Slider };
