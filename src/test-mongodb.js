#!/usr/bin/env node

/**
 * MongoDB Connection Test
 * Quick script to test MongoDB connection and schema
 */

import 'dotenv/config';
import mongoDb from './services/mongodb-database.js';

async function testMongoDB() {
  console.log('Testing MongoDB connection...\n');
  
  // Test connection
  console.log('1. Connecting to MongoDB...');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gold-provenance';
  console.log(`   URI: ${mongoUri.replace(/:[^:@]+@/, ':***@')}`); // Hide password
  
  const result = await mongoDb.connect(mongoUri);
  if (!result.success) {
    console.error('   FAILED:', result.error);
    console.log('\nMake sure MongoDB is running:');
    console.log('   brew services start mongodb-community  (macOS)');
    console.log('   sudo systemctl start mongodb           (Linux)');
    process.exit(1);
  }
  console.log('   SUCCESS: Connected to MongoDB\n');
  
  // Test create party
  console.log('2. Testing Party creation...');
  const testParty = {
    partyId: 'test-party-' + Date.now(),
    legalName: 'Test Mining Corp',
    partyType: 'MineOperator',
    country: 'TestCountry'
  };
  
  const party = await mongoDb.saveParty(testParty);
  console.log('   Created:', party.legalName);
  
  // Test retrieve
  console.log('3. Testing Party retrieval...');
  const retrieved = await mongoDb.getParty(party.partyId);
  console.log('   Retrieved:', retrieved.legalName);
  
  // Test facility
  console.log('4. Testing Facility creation...');
  const testFacility = {
    facilityId: 'test-facility-' + Date.now(),
    facilityName: 'Test Mine Site',
    facilityType: 'Mine',
    ownerPartyId: party.partyId,
    location: {
      country: 'TestCountry',
      region: 'TestRegion'
    }
  };
  
  const facility = await mongoDb.saveFacility(testFacility);
  console.log('   Created:', facility.facilityName);
  
  // Test batch
  console.log('5. Testing Batch creation...');
  const testBatch = {
    batchId: 'test-batch-' + Date.now(),
    externalReferenceNumber: 'TEST-' + Date.now(),
    commodityType: 'Gold Doré',
    originFacilityId: facility.facilityId,
    ownerPartyId: party.partyId,
    quantity: {
      weight: 25.5,
      unit: 'kg'
    },
    status: 'Created'
  };
  
  const batch = await mongoDb.saveBatch(testBatch);
  console.log('   Created batch:', batch.externalReferenceNumber);
  
  // Get stats
  console.log('\n6. Database statistics:');
  const stats = await mongoDb.getStats();
  console.log('   Parties:', stats.parties);
  console.log('   Facilities:', stats.facilities);
  console.log('   Batches:', stats.batches);
  console.log('   Events:', stats.events);
  console.log('   Documents:', stats.documents);
  
  // Test audit log
  console.log('\n7. Testing Audit Log...');
  const auditLogs = await mongoDb.getAuditLog();
  console.log(`   Found ${auditLogs.length} audit entries`);
  
  console.log('\nAll tests passed!');
  console.log('MongoDB is ready to use.');
  
  // Disconnect
  await mongoDb.disconnect();
  process.exit(0);
}

testMongoDB().catch(error => {
  console.error('\nTest failed:', error.message);
  process.exit(1);
});
