export interface ScanResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
  meta?: Record<string, unknown>;
}
