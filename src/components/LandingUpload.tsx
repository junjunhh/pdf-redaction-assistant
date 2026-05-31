import type { DragEvent } from 'react';
import { Upload, FileText, ScanSearch, ShieldCheck, Zap } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useTheme } from '../lib/useTheme';

type LandingUploadProps = {
  error: string | null;
  isLoading: boolean;
  onFilesSelected: (files: FileList | null) => void;
};

function LandingUpload({
  error,
  isLoading,
  onFilesSelected,
}: LandingUploadProps) {
  const { theme, toggleTheme } = useTheme();

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();

    if (isLoading) {
      return;
    }

    onFilesSelected(event.dataTransfer.files);
  };

  return (
    <main className="min-h-screen flex flex-col bg-gray-50">
      <header className="px-6 py-3 bg-blue-500 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="grid place-items-center w-10 h-10 rounded-lg bg-white/20 text-white text-xs font-black backdrop-blur-sm"
              aria-hidden="true"
            >
              PDF
            </div>
            <div>
              <h1 id="landing-title" className="text-lg font-semibold text-white leading-tight">
                PDF Redaction Assistant
              </h1>
              <p className="text-sm text-blue-50">
                Automatically detect dates and person names in selectable-text PDFs
              </p>
            </div>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
      </header>

      <section
        className="min-h-0 flex-1 flex flex-col items-center justify-center gap-4 p-4"
        aria-labelledby="landing-title"
      >
        <div className="max-w-2xl w-full grid gap-4">
          <label
            className="flex flex-col items-center justify-center w-full h-[300px] border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-white hover:bg-gray-50 transition-all duration-300 hover:border-blue-400 aria-disabled:cursor-wait aria-disabled:opacity-75"
            aria-disabled={isLoading}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <div className="mb-3 p-5 bg-blue-50 rounded-full">
                <Upload className="w-10 h-10 text-blue-500" />
              </div>
              <p className="mb-1 text-lg font-semibold text-gray-700">
                Upload PDF Document
              </p>
              <p className="text-sm text-gray-500 mb-3">
                Drag and drop or click to browse
              </p>
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-600">Supports PDF files only</span>
              </div>
              <div className="mt-4 inline-grid place-items-center min-w-[140px] min-h-10 px-4 rounded-md bg-blue-600 text-white text-sm font-semibold shadow-md shadow-blue-600/20">
                {isLoading ? 'Loading PDF...' : 'Choose PDF'}
              </div>
            </div>
            <input
              aria-label="Choose PDF files"
              accept="application/pdf,.pdf"
              disabled={isLoading}
              multiple
              type="file"
              className="hidden"
              onChange={(event) => {
                onFilesSelected(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
            />
          </label>

          {error && (
            <p className="justify-self-center rounded-md bg-red-50 text-red-700 px-3 py-2.5 text-sm font-semibold">
              {error}
            </p>
          )}
        </div>

        <div
          className="max-w-2xl w-full grid grid-cols-1 sm:grid-cols-3 gap-3"
          aria-label="Key capabilities"
        >
          <article className="grid justify-items-start gap-2 border border-gray-200 rounded-xl bg-white p-4 shadow-sm">
            <span className="grid place-items-center w-9 h-9 rounded-lg bg-blue-50 text-blue-600">
              <ScanSearch className="w-5 h-5" />
            </span>
            <h2 className="text-base font-semibold text-gray-800">Auto Detection</h2>
            <p className="text-sm text-gray-600 leading-snug">
              Automatically identifies dates and person names throughout your document.
            </p>
          </article>
          <article className="grid justify-items-start gap-2 border border-gray-200 rounded-xl bg-white p-4 shadow-sm">
            <span className="grid place-items-center w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h2 className="text-base font-semibold text-gray-800">100% Private</h2>
            <p className="text-sm text-gray-600 leading-snug">
              All processing happens in your browser. No data is sent to any server.
            </p>
          </article>
          <article className="grid justify-items-start gap-2 border border-gray-200 rounded-xl bg-white p-4 shadow-sm">
            <span className="grid place-items-center w-9 h-9 rounded-lg bg-purple-50 text-purple-600">
              <Zap className="w-5 h-5" />
            </span>
            <h2 className="text-base font-semibold text-gray-800">Instant Preview</h2>
            <p className="text-sm text-gray-600 leading-snug">
              Open the review workspace with thumbnails, pages, and detected entities.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

export default LandingUpload;
