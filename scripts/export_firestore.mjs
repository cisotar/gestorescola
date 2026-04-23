import admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

async function exportData() {
  console.log('=== EXPORT FIRESTORE DATA ===\n');

  const collections = ['teachers', 'schedules', 'absences', 'history', 'pending_teachers'];
  const summary = {};

  for (const col of collections) {
    try {
      const snap = await db.collection(col).get();
      summary[col] = snap.size;
      console.log(`✓ ${col}: ${snap.size} documents`);
    } catch (e) {
      summary[col] = `ERROR: ${e.message}`;
      console.log(`✗ ${col}: ${e.message}`);
    }
  }

  // Meta/config
  try {
    const metaSnap = await db.collection('meta').doc('config').get();
    if (metaSnap.exists()) {
      const data = metaSnap.data();
      console.log('\n✓ meta/config exists:');
      console.log(`  - segments: ${data.segments?.length || 0}`);
      console.log(`  - areas: ${data.areas?.length || 0}`);
      console.log(`  - subjects: ${data.subjects?.length || 0}`);
      console.log(`  - periodConfigs: ${Object.keys(data.periodConfigs || {}).length} periods`);
      console.log(`  - sharedSeries: ${data.sharedSeries?.length || 0}`);
      summary['meta/config'] = 'exists';
    } else {
      console.log('\n✗ meta/config: NOT FOUND');
      summary['meta/config'] = 'not found';
    }
  } catch (e) {
    console.log(`\n✗ meta/config: ${e.message}`);
    summary['meta/config'] = `ERROR: ${e.message}`;
  }

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  process.exit(0);
}

exportData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
