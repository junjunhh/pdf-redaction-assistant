import { useState } from 'react';
import { Info, X } from 'lucide-react';

function InfoBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) {
    return null;
  }

  return (
    <section className="bg-blue-50 border-b border-blue-200 p-3" aria-label="Usage tips">
      <div className="flex items-start gap-3 max-w-7xl mx-auto">
        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 text-sm text-blue-900">
          <p className="font-medium mb-1">How to use:</p>
          <ul className="space-y-1 text-blue-800">
            <li>• Click thumbnails on the left to navigate pages</li>
            <li>• Click any date or name in the right panel to highlight it</li>
            <li>• Review detected entities before deciding what to redact</li>
          </ul>
        </div>
        <button
          className="p-1 hover:bg-blue-100 rounded-lg transition-colors"
          type="button"
          aria-label="Dismiss usage tips"
          onClick={() => setIsVisible(false)}
        >
          <X className="w-4 h-4 text-blue-600" />
        </button>
      </div>
    </section>
  );
}

export default InfoBanner;
