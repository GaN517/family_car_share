'use client';

import React from 'react';
import { Car } from 'lucide-react';

interface Vehicle {
  id: string;
  name: string;
  color: string;
}

interface VehicleTabsProps {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
}

export default function VehicleTabs({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
}: VehicleTabsProps) {
  // カラーバリエーションのマッピング
  const colorStyles: Record<string, { active: string; inactive: string }> = {
    indigo: {
      active: 'bg-indigo-100 text-indigo-700 border-indigo-300 ring-2 ring-indigo-500/20',
      inactive: 'bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 border-slate-200',
    },
    emerald: {
      active: 'bg-emerald-100 text-emerald-700 border-emerald-300 ring-2 ring-emerald-500/20',
      inactive: 'bg-slate-50 text-slate-600 hover:bg-emerald-50 hover:text-emerald-600 border-slate-200',
    },
    rose: {
      active: 'bg-rose-100 text-rose-700 border-rose-300 ring-2 ring-rose-500/20',
      inactive: 'bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-600 border-slate-200',
    },
    amber: {
      active: 'bg-amber-100 text-amber-700 border-amber-300 ring-2 ring-amber-500/20',
      inactive: 'bg-slate-50 text-slate-600 hover:bg-amber-50 hover:text-amber-600 border-slate-200',
    },
    sky: {
      active: 'bg-sky-100 text-sky-700 border-sky-300 ring-2 ring-sky-500/20',
      inactive: 'bg-slate-50 text-slate-600 hover:bg-sky-50 hover:text-sky-600 border-slate-200',
    },
    violet: {
      active: 'bg-violet-100 text-violet-700 border-violet-300 ring-2 ring-violet-500/20',
      inactive: 'bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-600 border-slate-200',
    },
  };

  if (vehicles.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none px-4">
      {vehicles.map((vehicle) => {
        const isSelected = selectedVehicleId === vehicle.id;
        const colorStyle = colorStyles[vehicle.color] || colorStyles.indigo;
        const currentStyle = isSelected ? colorStyle.active : colorStyle.inactive;

        return (
          <button
            key={vehicle.id}
            onClick={() => onSelectVehicle(vehicle.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl border text-xs font-bold transition-all duration-200 whitespace-nowrap ${currentStyle}`}
          >
            <Car className={`h-4 w-4 ${isSelected ? 'animate-bounce' : ''}`} />
            {vehicle.name}
          </button>
        );
      })}
    </div>
  );
}
