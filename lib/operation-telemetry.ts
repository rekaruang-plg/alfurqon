type Operation = 'login' | 'start_exam' | 'autosave' | 'submit_exam';
type Outcome = 'ok' | 'rejected' | 'rate_limited' | 'database_error' | 'write_conflict' | 'server_error' | 'not_confirmed';
const fastAutosaveSampleRate = 0.05;
const slowAutosaveMs = 1000;

export type OperationTelemetry = {
  identify(action: unknown): void;
  failure(error: unknown): void;
  notConfirmed(): void;
};

export async function observeOperation(
  endpoint: 'auth' | 'cbt',
  handle: (telemetry: OperationTelemetry) => Promise<Response>,
): Promise<Response> {
  const start = performance.now();
  let operation: Operation | undefined;
  let outcome: Outcome | undefined;
  const telemetry: OperationTelemetry = {
    identify(action) {
      if (endpoint === 'auth') {
        if (action === 'login') operation = 'login';
      } else {
        if (action === 'enter') operation = 'start_exam';
        if (action === 'saveAnswers') operation = 'autosave';
        if (action === 'submit') operation = 'submit_exam';
      }
    },
    failure(error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'Operasi database gagal. Muat ulang dan coba kembali.' ||
          message === 'Database production belum dikonfigurasi.' ||
          message === 'Database belum tersedia') outcome = 'database_error';
      if (message === 'Jawaban sedang diperbarui. Coba kembali.' ||
          message === 'Sesi ujian sedang diperbarui. Coba masuk kembali.' ||
          message === 'Banyak siswa sedang mulai bersamaan. Silakan tekan mulai kembali; jawaban tetap aman.') outcome = 'write_conflict';
    },
    notConfirmed() { outcome = 'not_confirmed'; },
  };

  let statusCode = 500;
  try {
    const response = await handle(telemetry);
    statusCode = response.status;
    return response;
  } finally {
    if (operation) {
      const result = outcome ?? (statusCode === 429 ? 'rate_limited' :
        statusCode >= 500 ? 'server_error' : statusCode >= 400 ? 'rejected' : 'ok');
      const durationMs = Math.round(performance.now() - start);
      const sampleRate = operation === 'autosave' && result === 'ok' && durationMs < slowAutosaveMs
        ? fastAutosaveSampleRate : 1;
      if (sampleRate === 1 || Math.random() < sampleRate) {
        console.info(JSON.stringify({
          event: 'cbt_operation', operation, durationMs,
          statusCode, outcome: result, sampleRate,
        }));
      }
    }
  }
}
