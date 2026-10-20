'use client';

import React from 'react';
import { motion } from 'motion/react';
import type { Vehicle } from '@/lib/types';
import { vehicleColor } from '@/components/ui/primitives';

interface VehicleTabsProps {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
}

/** 車両の切り替え（選択中の背景が滑らかに移動するセグメント） */
export default function VehicleTabs({ vehicles, selectedVehicleId, onSelectVehicle }: VehicleTabsProps) {
  if (vehicles.length <= 1) return null;

  return (
    <div className="glass flex gap-1 overflow-x-auto scrollbar-none rounded-full p-1" role="tablist">
      {vehicles.map((vehicle) => {
        const isSelected = selectedVehicleId === vehicle.id;
        const c = vehicleColor(vehicle.color);
        return (
          <button
            key={vehicle.id}
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelectVehicle(vehicle.id)}
            className="relative flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 py-2.5 text-[14px] font-bold"
          >
            {isSelected && (
              <motion.span
                layoutId="vehicle-pill"
                className="absolute inset-0 rounded-full bg-white shadow-[0_4px_14px_-6px_rgba(15,23,42,0.3),inset_0_1px_0_rgba(255,255,255,1)]"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className={`relative h-2 w-2 rounded-full ${c.dot}`} />
            <span className={`relative transition-colors ${isSelected ? 'text-ink' : 'text-slate-500'}`}>{vehicle.name}</span>
          </button>
        );
      })}
    </div>
  );
}
