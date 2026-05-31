type FileUploadProps = {
  fileName: string | null;
  pageCount: number;
  isLoading: boolean;
  error: string | null;
  onFilesSelected: (files: FileList | null) => void;
};

function FileUpload({
  fileName,
  isLoading,
  error,
  onFilesSelected,
}: FileUploadProps) {
  return (
    <aside className="upload-card" aria-label="PDF upload">
      <label className="upload-action">
        <span>{isLoading ? 'Loading...' : fileName ? 'Upload More PDFs' : 'Choose PDFs'}</span>
        <input
          aria-label="Choose PDF files"
          accept="application/pdf,.pdf"
          disabled={isLoading}
          multiple
          type="file"
          onChange={(event) => {
            onFilesSelected(event.currentTarget.files);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {error && <p className="upload-status">{error}</p>}
    </aside>
  );
}

export default FileUpload;
