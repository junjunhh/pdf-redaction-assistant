import { Calendar, User } from 'lucide-react';

function ColorLegend() {
  return (
    <div className="flex items-center gap-4 text-xs" aria-label="Entity color legend">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-amber-300 rounded border border-amber-400" />
          <Calendar className="w-3 h-3 text-white/90" />
        </div>
        <span className="text-white/90 font-medium">Dates</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-lg backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-blue-300 rounded border border-blue-400" />
          <User className="w-3 h-3 text-white/90" />
        </div>
        <span className="text-white/90 font-medium">Names</span>
      </div>
    </div>
  );
}

export default ColorLegend;
