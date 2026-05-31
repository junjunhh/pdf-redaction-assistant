export function isPdfCancellationError(error: unknown) {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name)
      : '';
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message)
      : typeof error === 'string'
        ? error
        : '';

  return (
    name === 'RenderingCancelledException' ||
    name === 'AbortException' ||
    message.toLowerCase().includes('cancel')
  );
}
