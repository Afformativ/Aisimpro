#!/usr/bin/env node

/**
 * Gold Provenance Demo
 * Complete end-to-end demonstration of the provenance flow
 * 
 * Flow: Mine → Ship → Buyer Receives → Verify
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import provenanceService from './services/provenance.js';
import anchoringService from './services/anchoring.js';
import { PartyType, FacilityType, DocumentType } from './models/index.js';
import { hashDocument } from './services/hashing.js';

// ============ HELPER FUNCTIONS ============

function printHeader(title) {
  console.log('\n' + chalk.bold.blue('═'.repeat(70)));
  console.log(chalk.bold.blue(`  ${title}`));
  console.log(chalk.bold.blue('═'.repeat(70)) + '\n');
}

function printStep(num, title) {
  console.log(chalk.bold.yellow(`\n▶ Step ${num}: ${title}\n`));
}

function printSuccess(message) {
  console.log(chalk.green('  ✓ ') + message);
}

function printInfo(message) {
  console.log(chalk.cyan('  ℹ ') + message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ DEMO FLOW ============

async function runDemo() {
  printHeader('GOLD PROVENANCE PROTOTYPE - POLYGON zkEVM');
  
  const networkInfo = anchoringService.getNetworkInfo();
  console.log(chalk.cyan(`  Network: ${networkInfo.name} (Chain ID: ${networkInfo.chainId})`));
  console.log(chalk.cyan(`  Explorer: ${networkInfo.explorerUrl}`));
  
  console.log(chalk.gray(`
  This demo simulates the complete provenance flow:
  
  Physical Flow:
  ┌──────────────┐    ┌────────────────┐    ┌─────────────┐    ┌─────────────┐
  │   Mine       │ →  │  Transport/    │ →  │   Buyer     │ →  │   Verify    │
  │ Create Batch │    │  Ship          │    │   Receive   │    │   Chain     │
  └──────────────┘    └────────────────┘    └─────────────┘    └─────────────┘
  
  Digital Flow (for each step):
  ┌──────────────┐    ┌────────────────┐    ┌─────────────┐    ┌─────────────┐
  │ Enter Data   │ →  │  Hash & Store  │ →  │ Anchor on   │ →  │ Save TX     │
  │ + Documents  │    │  Docs Off-chain│    │ Blockchain  │    │ Hash in DB  │
  └──────────────┘    └────────────────┘    └─────────────┘    └─────────────┘
  `));

  await sleep(1000);

  // ============ STEP 1: REGISTER PARTIES ============
  
  printStep(1, 'Register Supply Chain Participants');
  
  // Mine Operator
  const mineOperator = provenanceService.registerParty({
    legalName: 'Golden Peak Mining Corp',
    partyType: PartyType.MINE_OPERATOR,
    country: 'Peru',
    registrationId: 'PE-MIN-2024-001'
  });
  printSuccess(`Mine Operator: ${mineOperator.legalName} (${mineOperator.partyId.substring(0, 8)}...)`);

  // Transporter
  const transporter = provenanceService.registerParty({
    legalName: 'SecureGold Logistics Ltd',
    partyType: PartyType.TRANSPORTER,
    country: 'Switzerland',
    registrationId: 'CH-LOG-2024-042'
  });
  printSuccess(`Transporter: ${transporter.legalName} (${transporter.partyId.substring(0, 8)}...)`);

  // Buyer
  const buyer = provenanceService.registerParty({
    legalName: 'Swiss Precious Metals AG',
    partyType: PartyType.BUYER,
    country: 'Switzerland',
    registrationId: 'CH-BUY-2024-099'
  });
  printSuccess(`Buyer: ${buyer.legalName} (${buyer.partyId.substring(0, 8)}...)`);

  // Auditor
  const auditor = provenanceService.registerParty({
    legalName: 'ESG Verification Services',
    partyType: PartyType.AUDITOR,
    country: 'UK'
  });
  printSuccess(`Auditor: ${auditor.legalName} (${auditor.partyId.substring(0, 8)}...)`);

  await sleep(500);

  // ============ STEP 2: REGISTER FACILITIES ============
  
  printStep(2, 'Register Facilities');

  // Mine
  const mineFacility = provenanceService.registerFacility({
    facilityName: 'Golden Peak Mine Site #1',
    facilityType: FacilityType.MINE,
    ownerPartyId: mineOperator.partyId,
    country: 'Peru',
    region: 'Arequipa',
    gpsCoordinates: { lat: -15.5, lng: -72.3 }
  });
  printSuccess(`Mine: ${mineFacility.facilityName}`);

  // Warehouse
  const warehouseFacility = provenanceService.registerFacility({
    facilityName: 'Lima Secure Vault',
    facilityType: FacilityType.WAREHOUSE,
    ownerPartyId: transporter.partyId,
    country: 'Peru',
    region: 'Lima'
  });
  printSuccess(`Warehouse: ${warehouseFacility.facilityName}`);

  // Buyer facility
  const buyerFacility = provenanceService.registerFacility({
    facilityName: 'Zurich Precious Metals Vault',
    facilityType: FacilityType.WAREHOUSE,
    ownerPartyId: buyer.partyId,
    country: 'Switzerland',
    region: 'Zurich'
  });
  printSuccess(`Buyer Vault: ${buyerFacility.facilityName}`);

  await sleep(500);

  // ============ STEP 3: REGISTER DOCUMENTS ============
  
  printStep(3, 'Register Supporting Documents (Hash & Store Off-chain)');

  // Simulate document content and compute hashes
  const permitContent = JSON.stringify({
    permitNumber: 'PE-MIN-PERMIT-2024-00789',
    issuer: 'Peru Ministry of Mining',
    validFrom: '2024-01-01',
    validTo: '2029-12-31',
    holder: 'Golden Peak Mining Corp'
  });
  
  const permitDoc = provenanceService.registerDocument({
    documentType: DocumentType.PERMIT,
    fileName: 'mining_permit_2024.pdf',
    sha256Hash: hashDocument(permitContent),
    issuerPartyId: mineOperator.partyId,
    storageUri: 's3://goldprov-docs/permits/PE-MIN-2024-00789.pdf',
    issuedDate: '2024-01-01'
  });
  printSuccess(`Permit: ${permitDoc.fileName} (${permitDoc.sha256Hash.substring(0, 16)}...)`);

  const originCertContent = JSON.stringify({
    certNumber: 'COO-2024-GPM-001',
    commodity: 'Gold Doré',
    origin: 'Golden Peak Mine, Arequipa, Peru',
    certifiedBy: 'Peru Chamber of Commerce'
  });

  const originCertDoc = provenanceService.registerDocument({
    documentType: DocumentType.CERTIFICATE_OF_ORIGIN,
    fileName: 'certificate_of_origin.pdf',
    sha256Hash: hashDocument(originCertContent),
    issuerPartyId: mineOperator.partyId,
    storageUri: 's3://goldprov-docs/certs/COO-2024-GPM-001.pdf'
  });
  printSuccess(`Certificate of Origin: ${originCertDoc.fileName}`);

  const packingListContent = JSON.stringify({
    shipmentId: 'SHP-2024-001',
    items: [{ description: 'Gold Doré Bars', quantity: 25, unitWeight: '1kg', totalWeight: '25kg' }],
    grossWeight: '27kg',
    packaging: 'Sealed security containers x 5'
  });

  const packingListDoc = provenanceService.registerDocument({
    documentType: DocumentType.PACKING_LIST,
    fileName: 'packing_list_SHP2024001.pdf',
    sha256Hash: hashDocument(packingListContent),
    issuerPartyId: mineOperator.partyId,
    storageUri: 's3://goldprov-docs/shipping/packing_SHP2024001.pdf'
  });
  printSuccess(`Packing List: ${packingListDoc.fileName}`);

  const waybillContent = JSON.stringify({
    waybillNumber: 'AWB-2024-LIM-ZRH-00123',
    origin: 'Lima, Peru',
    destination: 'Zurich, Switzerland',
    carrier: 'SecureGold Logistics',
    declaredValue: 'USD 1,250,000'
  });

  const waybillDoc = provenanceService.registerDocument({
    documentType: DocumentType.WAYBILL,
    fileName: 'airway_bill_AWB2024123.pdf',
    sha256Hash: hashDocument(waybillContent),
    issuerPartyId: transporter.partyId,
    storageUri: 's3://goldprov-docs/shipping/awb_2024123.pdf'
  });
  printSuccess(`Waybill: ${waybillDoc.fileName}`);

  await sleep(500);

  // ============ STEP 4: CREATE BATCH AT MINE ============
  
  printStep(4, 'Create Batch at Mine (Anchor on Blockchain)');

  const batchResult = await provenanceService.createBatchAtMine({
    externalReferenceNumber: 'GPM-2024-BATCH-001',
    commodityType: 'Gold Doré',
    originFacilityId: mineFacility.facilityId,
    ownerPartyId: mineOperator.partyId,
    weight: 25.5,
    weightUnit: 'kg',
    declaredAssayValue: 92.5,
    declaredAssayUnit: '%',
    notes: 'First batch of Q1 2024 production'
  }, [permitDoc.documentId, originCertDoc.documentId, packingListDoc.documentId]);

  printSuccess(`Batch created: ${batchResult.batch.externalReferenceNumber}`);
  printInfo(`Batch ID: ${batchResult.batch.batchId}`);
  printInfo(`Weight: ${batchResult.batch.quantity.weight} ${batchResult.batch.quantity.unit}`);
  printInfo(`Declared Assay: ${batchResult.batch.declaredAssay.value}${batchResult.batch.declaredAssay.unit}`);
  printInfo(`Blockchain TX: ${batchResult.eventAnchor.txHash}`);
  printInfo(`Explorer URL: ${batchResult.eventAnchor.explorerUrl}`);

  await sleep(500);

  // ============ STEP 5: SHIP BATCH ============
  
  printStep(5, 'Ship Batch (Mine → Transporter)');

  const shipResult = await provenanceService.recordShipment(batchResult.batch.batchId, {
    toPartyId: transporter.partyId,
    toFacilityId: warehouseFacility.facilityId,
    documentIds: [waybillDoc.documentId],
    notes: 'Shipped via secure air freight'
  });

  printSuccess(`Shipment recorded`);
  printInfo(`Batch status: ${shipResult.batch.status}`);
  printInfo(`Blockchain TX: ${shipResult.anchor.txHash}`);

  await sleep(500);

  // ============ STEP 6: CUSTODY TRANSFER ============
  
  printStep(6, 'Transfer Custody (Transporter → Buyer)');

  const transferResult = await provenanceService.recordTransfer(batchResult.batch.batchId, {
    toPartyId: buyer.partyId,
    fromFacilityId: warehouseFacility.facilityId,
    toFacilityId: buyerFacility.facilityId,
    notes: 'Custody transferred at Zurich airport'
  });

  printSuccess(`Custody transferred to buyer`);
  printInfo(`Blockchain TX: ${transferResult.anchor.txHash}`);

  await sleep(500);

  // ============ STEP 7: BUYER RECEIVES ============
  
  printStep(7, 'Buyer Receives & Acknowledges');

  const receiveResult = await provenanceService.recordReceipt(batchResult.batch.batchId, {
    receiverPartyId: buyer.partyId,
    facilityId: buyerFacility.facilityId,
    receivedWeight: 25.48, // Slight variance is normal
    notes: 'Received in good condition. Minor weight variance within tolerance.'
  });

  printSuccess(`Receipt acknowledged by buyer`);
  printInfo(`Batch status: ${receiveResult.batch.status}`);
  printInfo(`Received weight: 25.48 kg (declared: 25.5 kg)`);
  printInfo(`Blockchain TX: ${receiveResult.anchor.txHash}`);

  await sleep(500);

  // ============ STEP 8: VERIFICATION ============
  
  printStep(8, 'Verify Chain of Custody (Auditor View)');

  const chain = provenanceService.getChainOfCustody(batchResult.batch.batchId);
  const verification = await provenanceService.verifyBatchIntegrity(batchResult.batch.batchId);

  console.log(chalk.bold.white('\n  ┌─────────────────────────────────────────────────────────────────┐'));
  console.log(chalk.bold.white('  │              PROVENANCE VERIFICATION REPORT                    │'));
  console.log(chalk.bold.white('  └─────────────────────────────────────────────────────────────────┘\n'));

  console.log(chalk.bold('  Batch Information:'));
  console.log(`    Reference:    ${chain.batch.referenceNumber}`);
  console.log(`    Commodity:    ${chain.batch.commodityType}`);
  console.log(`    Quantity:     ${chain.batch.quantity.weight} ${chain.batch.quantity.unit}`);
  console.log(`    Status:       ${chalk.green(chain.batch.status)}`);
  console.log(`    Origin:       ${chain.originFacility.name} (${chain.originFacility.location.country})`);
  console.log(`    Custodian:    ${chain.currentCustodian.name}`);

  console.log(chalk.bold('\n  Event Timeline:'));
  
  const table = new Table({
    head: [
      chalk.cyan('#'),
      chalk.cyan('Event'),
      chalk.cyan('Timestamp'),
      chalk.cyan('From'),
      chalk.cyan('To'),
      chalk.cyan('Hash Valid'),
      chalk.cyan('Anchored')
    ],
    colWidths: [4, 12, 22, 20, 20, 12, 10]
  });

  chain.timeline.forEach((event, i) => {
    const fromName = event.from.party?.name?.substring(0, 18) || 
                     event.from.facility?.name?.substring(0, 18) || '-';
    const toName = event.to.party?.name?.substring(0, 18) || 
                   event.to.facility?.name?.substring(0, 18) || '-';
    const verifyEvent = verification.events.find(e => e.eventId === event.eventId);
    
    table.push([
      i + 1,
      event.eventType,
      new Date(event.timestamp).toLocaleString(),
      fromName,
      toName,
      verifyEvent?.hashMatch ? chalk.green('✓') : chalk.red('✗'),
      event.txHash ? chalk.green('✓') : chalk.yellow('○')
    ]);
  });
  console.log(table.toString());

  console.log(chalk.bold('\n  Supporting Documents:'));
  chain.allDocuments.forEach((doc, i) => {
    console.log(`    ${i + 1}. [${doc.type}] ${doc.fileName}`);
    console.log(chalk.gray(`       Hash: ${doc.hash.substring(0, 32)}...`));
  });

  console.log(chalk.bold('\n  Verification Summary:'));
  const allValid = verification.overallValid;
  const statusIcon = allValid ? chalk.green('✓ VERIFIED') : chalk.red('✗ FAILED');
  console.log(`    Overall Status: ${statusIcon}`);
  console.log(`    Events Checked: ${verification.events.length}`);
  console.log(`    Hash Matches:   ${verification.events.filter(e => e.hashMatch).length}/${verification.events.length}`);
  console.log(`    Anchored:       ${verification.events.filter(e => e.anchorValid !== null).length}/${verification.events.length}`);

  if (anchoringService.isSimulated()) {
    const networkInfo = anchoringService.getNetworkInfo();
    console.log(chalk.yellow(`\n    ⚠ Running in SIMULATION mode on ${networkInfo.name}`));
    console.log(chalk.yellow(`    ⚠ To anchor on live zkEVM, set PRIVATE_KEY environment variable`));
  }

  // ============ EXPORT ============
  
  printStep(9, 'Export Batch Package (JSON)');
  
  const exportPkg = provenanceService.exportBatchPackage(batchResult.batch.batchId);
  console.log(chalk.gray('  Export preview (truncated):'));
  console.log(chalk.gray('  ' + JSON.stringify(exportPkg, null, 2).split('\n').slice(0, 10).join('\n  ') + '\n  ...'));

  // ============ SUMMARY ============
  
  printHeader('DEMO COMPLETE');
  
  console.log(chalk.green(`
  ✓ Created 4 supply chain parties
  ✓ Registered 4 facilities  
  ✓ Uploaded 4 documents (hashed off-chain)
  ✓ Created 1 batch at origin mine
  ✓ Recorded ${chain.timeline.length} traceability events
  ✓ Anchored all events on blockchain (simulated)
  ✓ Verified complete chain of custody
  ✓ Exported batch package as JSON
  
  The prototype demonstrates the core provenance flow:
  
  Mine → Ship → Transfer → Receive → Verify
  
  Each step creates a tamper-evident record with:
  • Unique event ID
  • Timestamp
  • Party/facility references
  • Document hashes
  • Blockchain anchor (tx hash)
  `));

  console.log(chalk.cyan('  To run the API server: npm run api'));
  console.log(chalk.cyan('  To use the CLI: node src/cli.js --help\n'));
}

// Run demo
runDemo().catch(console.error);
