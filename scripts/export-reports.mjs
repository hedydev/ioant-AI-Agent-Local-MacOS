#!/usr/bin/env node
// Safe, one-time or repeatable export of legacy Markdown reports from LunaDrive to Desktop.
import { copyLegacyReports, defaultReportDir } from '../src/report-storage.mjs';

const dataDir = process.env.IOANT_AI_AUDIT_DATA_DIR;
const reportDir = process.env.IOANT_AI_AUDIT_REPORT_DIR ?? defaultReportDir();
if (!dataDir) {
  console.error('Run through scripts/dev-env.sh exec to use the verified LunaDrive audit cache.');
  process.exitCode = 1;
} else {
  copyLegacyReports(dataDir, reportDir).then(stats => {
    console.log('DESKTOP REPORTS: ' + stats.root);
    console.log('Copied: ' + stats.copied + ' | Already on desktop: ' + stats.already + ' | Non-report entries skipped: ' + stats.ignored);
    console.log('Original LunaDrive reports were not deleted; state and diagnostic logs remain on LunaDrive.');
  }).catch(error => {
    console.error('Report export failed: ' + error.message);
    process.exitCode = 1;
  });
}
