#!/usr/bin/env node

/**
 * Gold Provenance CLI - Interactive Demo Interface
 * Demonstrates the complete provenance flow
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import provenanceService from './services/provenance.js';
import anchoringService, { BlockchainAnchoringService, NETWORKS } from './services/anchoring.js';
import { PartyType, FacilityType, DocumentType, BatchStatus, EventType } from './models/index.js';

const program = new Command();

// ============ HELPER FUNCTIONS ============

function printHeader(title) {
  console.log('\n' + chalk.bold.blue('═'.repeat(60)));
  console.log(chalk.bold.blue(`  ${title}`));
  console.log(chalk.bold.blue('═'.repeat(60)) + '\n');
}

function printSuccess(message) {
  console.log(chalk.green(message));
}

function printInfo(message) {
  console.log(chalk.cyan(message));
}

function printWarning(message) {
  console.log(chalk.yellow(message));
}

function printError(message) {
  console.log(chalk.red(message));
}

function printJSON(obj) {
  console.log(chalk.cyan(JSON.stringify(obj, null, 2)));
}

function formatTimestamp(ts) {
  try {
    console.log(chalk.yellow(new Date(ts).toLocaleString()));
  } catch (e) {
    console.log(chalk.yellow(String(ts)));
  }
}

// ============ PARTY COMMANDS ============
program
  .command('party:create')
  .description('Register a new party')
  .requiredOption('-n, --name <name>', 'Legal name')
  .requiredOption('-t, --type <type>', 'Party type (MineOperator|Transporter|Buyer|Refinery|Auditor)')
  .option('-c, --country <country>', 'Country', 'Unknown')
  .option('-r, --regId <regId>', 'Registration ID')
  .action((options) => {
    const party = provenanceService.registerParty({
      legalName: options.name,
      partyType: options.type,
      country: options.country,
      registrationId: options.regId
    });
    printSuccess(`Party created: ${party.partyId}`);
    printJSON(party);
  });

program
  .command('party:list')
  .description('List all parties')
  .action(() => {
    const parties = provenanceService.getAllParties();
    const table = new Table({
      head: [chalk.cyan('ID'), chalk.cyan('Name'), chalk.cyan('Type'), chalk.cyan('Country')]
    });
    parties.forEach(p => {
      table.push([p.partyId.substring(0, 8) + '...', p.legalName, p.partyType, p.country]);
    });
    console.log(table.toString());
  });

// ============ FACILITY COMMANDS ============

program
  .command('facility:create')
  .description('Register a new facility')
  .requiredOption('-n, --name <name>', 'Facility name')
  .requiredOption('-t, --type <type>', 'Facility type (Mine|Warehouse|Refinery|Port)')
  .requiredOption('-o, --owner <ownerId>', 'Owner party ID')
  .option('-c, --country <country>', 'Country', 'Unknown')
  .action((options) => {
    const facility = provenanceService.registerFacility({
      facilityName: options.name,
      facilityType: options.type,
      ownerPartyId: options.owner,
      country: options.country
    });
    printSuccess(`Facility created: ${facility.facilityId}`);
    printJSON(facility);
  });

program
  .command('facility:list')
  .description('List all facilities')
  .action(() => {
    const facilities = provenanceService.getAllFacilities();
    const table = new Table({
      head: [chalk.cyan('ID'), chalk.cyan('Name'), chalk.cyan('Type'), chalk.cyan('Location')]
    });
    facilities.forEach(f => {
      table.push([
        f.facilityId.substring(0, 8) + '...',
        f.facilityName,
        f.facilityType,
        f.location.country
      ]);
    });
    console.log(table.toString());
  });

// ============ DOCUMENT COMMANDS ============

program
  .command('doc:create')
  .description('Register a document')
  .requiredOption('-t, --type <type>', 'Document type')
  .requiredOption('-f, --file <fileName>', 'File name')
  .requiredOption('-h, --hash <hash>', 'SHA-256 hash')
  .requiredOption('-i, --issuer <issuerId>', 'Issuer party ID')
  .option('-u, --uri <uri>', 'Storage URI', 'file://local')
  .action((options) => {
    const doc = provenanceService.registerDocument({
      documentType: options.type,
      fileName: options.file,
      sha256Hash: options.hash,
      issuerPartyId: options.issuer,
      storageUri: options.uri
    });
    printSuccess(`Document registered: ${doc.documentId}`);
    printJSON(doc);
  });

// ============ BATCH COMMANDS ============

program
  .command('batch:create')
  .description('Create a new batch at the mine')
  .requiredOption('-r, --ref <refNumber>', 'External reference number')
  .requiredOption('-c, --commodity <type>', 'Commodity type')
  .requiredOption('-f, --facility <facilityId>', 'Origin facility ID')
  .requiredOption('-o, --owner <ownerId>', 'Owner party ID')
  .requiredOption('-w, --weight <weight>', 'Weight in kg')
  .option('-a, --assay <assay>', 'Declared assay value (g/t)')
  .option('-d, --docs <docIds>', 'Comma-separated document IDs')
  .action(async (options) => {
    try {
      const docIds = options.docs ? options.docs.split(',') : [];
      const result = await provenanceService.createBatchAtMine({
        externalReferenceNumber: options.ref,
        commodityType: options.commodity,
        originFacilityId: options.facility,
        ownerPartyId: options.owner,
        weight: parseFloat(options.weight),
        declaredAssayValue: options.assay ? parseFloat(options.assay) : null,
        declaredAssayUnit: options.assay ? 'g/t' : null
      }, docIds);
      
      printSuccess(`Batch created: ${result.batch.batchId}`);
      printInfo(`Reference: ${result.batch.externalReferenceNumber}`);
      printInfo(`Event anchored: ${result.eventAnchor.txHash}`);
      printInfo(`Explorer: ${result.eventAnchor.explorerUrl}`);
    } catch (error) {
      printError(error.message);
    }
  });

program
  .command('batch:list')
  .description('List all batches')
  .action(() => {
    const batches = provenanceService.getAllBatches();
    const table = new Table({
      head: [
        chalk.cyan('Reference'),
        chalk.cyan('Commodity'),
        chalk.cyan('Weight'),
        chalk.cyan('Status'),
        chalk.cyan('Created')
      ]
    });
    batches.forEach(b => {
      table.push([
        b.externalReferenceNumber,
        b.commodityType,
        `${b.quantity.weight} ${b.quantity.unit}`,
        b.status,
        formatTimestamp(b.creationTimestamp)
      ]);
    });
    console.log(table.toString());
  });

program
  .command('batch:show <batchId>')
  .description('Show batch details')
  .action((batchId) => {
    const batch = provenanceService.getBatch(batchId) || 
                  provenanceService.getBatchByReference(batchId);
    if (!batch) {
      printError('Batch not found');
      return;
    }
    printJSON(batch);
  });

// ============ EVENT COMMANDS ============

program
  .command('ship <batchId>')
  .description('Record shipment of a batch')
  .requiredOption('-t, --to <toPartyId>', 'Destination party ID')
  .requiredOption('-f, --toFacility <facilityId>', 'Destination facility ID')
  .option('-d, --docs <docIds>', 'Comma-separated document IDs')
  .option('-n, --notes <notes>', 'Notes')
  .action(async (batchId, options) => {
    try {
      const result = await provenanceService.recordShipment(batchId, {
        toPartyId: options.to,
        toFacilityId: options.toFacility,
        documentIds: options.docs ? options.docs.split(',') : [],
        notes: options.notes
      });
      printSuccess(`Shipment recorded: ${result.event.eventId}`);
      printInfo(`Batch status: ${result.batch.status}`);
      printInfo(`TX Hash: ${result.anchor.txHash}`);
    } catch (error) {
      printError(error.message);
    }
  });

program
  .command('transfer <batchId>')
  .description('Record custody transfer')
  .requiredOption('-t, --to <toPartyId>', 'New custodian party ID')
  .option('-f, --fromFacility <facilityId>', 'From facility ID')
  .option('-tf, --toFacility <facilityId>', 'To facility ID')
  .option('-n, --notes <notes>', 'Notes')
  .action(async (batchId, options) => {
    try {
      const result = await provenanceService.recordTransfer(batchId, {
        toPartyId: options.to,
        fromFacilityId: options.fromFacility,
        toFacilityId: options.toFacility,
        notes: options.notes
      });
      printSuccess(`Transfer recorded: ${result.event.eventId}`);
      printInfo(`New custodian: ${result.batch.ownerPartyId}`);
    } catch (error) {
      printError(error.message);
    }
  });

program
  .command('receive <batchId>')
  .description('Record receipt/acceptance of a batch')
  .requiredOption('-r, --receiver <receiverPartyId>', 'Receiver party ID')
  .requiredOption('-f, --facility <facilityId>', 'Receiving facility ID')
  .option('-w, --weight <weight>', 'Received weight (if different)')
  .option('-n, --notes <notes>', 'Notes')
  .action(async (batchId, options) => {
    try {
      const result = await provenanceService.recordReceipt(batchId, {
        receiverPartyId: options.receiver,
        facilityId: options.facility,
        receivedWeight: options.weight ? parseFloat(options.weight) : null,
        notes: options.notes
      });
      printSuccess(`Receipt recorded: ${result.event.eventId}`);
      printInfo(`Batch status: ${result.batch.status}`);
    } catch (error) {
      printError(error.message);
    }
  });

program
  .command('dispute <batchId>')
  .description('Raise a dispute on a batch')
  .requiredOption('-p, --party <partyId>', 'Party raising dispute')
  .requiredOption('-r, --reason <reason>', 'Reason for dispute')
  .action(async (batchId, options) => {
    try {
      const result = await provenanceService.recordDispute(batchId, {
        raisedByPartyId: options.party,
        reason: options.reason
      });
      printWarning(`Dispute recorded: ${result.event.eventId}`);
      printInfo(`Batch status: ${result.batch.status}`);
    } catch (error) {
      printError(error.message);
    }
  });

// ============ VERIFICATION COMMANDS ============

program
  .command('verify <batchId>')
  .description('Verify batch integrity and show chain of custody')
  .action(async (batchId) => {
    const batch = provenanceService.getBatch(batchId) || 
                  provenanceService.getBatchByReference(batchId);
    if (!batch) {
      printError('Batch not found');
      return;
    }

    printHeader(`Chain of Custody: ${batch.externalReferenceNumber}`);

    const chain = provenanceService.getChainOfCustody(batch.batchId);
    
    // Batch info
    console.log(chalk.bold('Batch Information:'));
    console.log(`  Reference: ${chain.batch.referenceNumber}`);
    console.log(`  Commodity: ${chain.batch.commodityType}`);
    console.log(`  Quantity: ${chain.batch.quantity.weight} ${chain.batch.quantity.unit}`);
    console.log(`  Status: ${chalk.yellow(chain.batch.status)}`);
    console.log(`  Created: ${formatTimestamp(chain.batch.createdAt)}`);
    
    if (chain.originFacility) {
      console.log(`  Origin: ${chain.originFacility.name} (${chain.originFacility.type})`);
    }
    
    if (chain.currentCustodian) {
      console.log(`  Current Custodian: ${chain.currentCustodian.name}`);
    }

    // Timeline
    console.log('\n' + chalk.bold('Event Timeline:'));
    const timelineTable = new Table({
      head: [
        chalk.cyan('#'),
        chalk.cyan('Type'),
        chalk.cyan('Timestamp'),
        chalk.cyan('From → To'),
        chalk.cyan('TX Hash')
      ]
    });

    chain.timeline.forEach((event, i) => {
      const from = event.from.party?.name || event.from.facility?.name || '-';
      const to = event.to.party?.name || event.to.facility?.name || '-';
      timelineTable.push([
        i + 1,
        event.eventType,
        formatTimestamp(event.timestamp),
        `${from} → ${to}`,
        event.txHash ? event.txHash.substring(0, 12) + '...' : '-'
      ]);
    });
    console.log(timelineTable.toString());

    // Documents
    if (chain.allDocuments.length > 0) {
      console.log('\n' + chalk.bold('Supporting Documents:'));
      chain.allDocuments.forEach((doc, i) => {
        console.log(`  ${i + 1}. ${doc.type}: ${doc.fileName}`);
        console.log(`     Hash: ${doc.hash.substring(0, 16)}...`);
      });
    }

    // Verification
    console.log('\n' + chalk.bold('Verification Status:'));
    const verification = await provenanceService.verifyBatchIntegrity(batch.batchId);
    
    if (verification.overallValid) {
      printSuccess(`All ${verification.events.length} events have valid hashes`);
    } else {
      printError('Hash verification failed for some events');
    }

    const statusColor = chain.verificationStatus.status === 'VERIFIED' ? 'green' :
                        chain.verificationStatus.status === 'DISPUTED' ? 'red' : 'yellow';
    console.log(`  Status: ${chalk[statusColor](chain.verificationStatus.status)}`);
    console.log(`  Message: ${chain.verificationStatus.message}`);
  });

// ============ EXPORT COMMANDS ============

program
  .command('export <batchId>')
  .description('Export batch package as JSON')
  .action((batchId) => {
    const batch = provenanceService.getBatch(batchId) || 
                  provenanceService.getBatchByReference(batchId);
    if (!batch) {
      printError('Batch not found');
      return;
    }
    const pkg = provenanceService.exportBatchPackage(batch.batchId);
    console.log(JSON.stringify(pkg, null, 2));
  });

program
  .command('audit')
  .description('Show audit log')
  .option('-e, --entity <entityId>', 'Filter by entity ID')
  .action((options) => {
    const log = provenanceService.getAuditLog(options.entity);
    const table = new Table({
      head: [chalk.cyan('Timestamp'), chalk.cyan('Action'), chalk.cyan('Entity'), chalk.cyan('ID')]
    });
    log.slice(-20).forEach(entry => {
      table.push([
        formatTimestamp(entry.timestamp),
        entry.action,
        entry.entityType,
        entry.entityId.substring(0, 12) + '...'
      ]);
    });
    console.log(table.toString());
  });

// ============ PROGRAM INFO ============

program
  .name('gold-provenance')
  .description('Gold Provenance & Chain-of-Custody CLI - Polygon zkEVM')
  .version('0.1.0');

// ============ NETWORK COMMANDS ============

program
  .command('network:info')
  .description('Show current blockchain network configuration')
  .action(() => {
    const info = anchoringService.getNetworkInfo();
    printHeader('Network Configuration');
    console.log(`  Network:    ${chalk.cyan(info.name)}`);
    console.log(`  Chain ID:   ${info.chainId}`);
    console.log(`  RPC URL:    ${info.rpcUrl}`);
    console.log(`  Explorer:   ${info.explorerUrl}`);
    console.log(`  Mode:       ${info.simulationMode ? chalk.yellow('SIMULATION') : chalk.green('LIVE')}`);
  });

program
  .command('network:list')
  .description('List available blockchain networks')
  .action(() => {
    const networks = BlockchainAnchoringService.getAvailableNetworks();
    const table = new Table({
      head: [chalk.cyan('Key'), chalk.cyan('Name'), chalk.cyan('Chain ID')]
    });
    networks.forEach(n => {
      table.push([n.key, n.name, n.chainId]);
    });
    console.log(table.toString());
    printInfo('Use "network:switch <key>" to change networks');
  });

program
  .command('network:switch <networkKey>')
  .description('Switch to a different blockchain network')
  .action((networkKey) => {
    try {
      const info = anchoringService.switchNetwork(networkKey);
      printSuccess(`Switched to ${info.name}`);
      console.log(`  Chain ID: ${info.chainId}`);
      console.log(`  Explorer: ${info.explorerUrl}`);
    } catch (error) {
      printError(error.message);
    }
  });

program
  .command('network:connect')
  .description('Connect to the blockchain (requires PRIVATE_KEY env var)')
  .action(async () => {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      printError('PRIVATE_KEY environment variable not set');
      printInfo('Set it with: export PRIVATE_KEY=0x...');
      return;
    }
    
    const result = await anchoringService.connect(privateKey);
    if (result.success) {
      printSuccess(`Connected to ${anchoringService.getNetworkInfo().name}`);
      printInfo(`Wallet address: ${result.address}`);
    } else {
      printError(`Connection failed: ${result.error}`);
    }
  });

// ============ MERKLE ANCHORING COMMANDS ============

program
  .command('merkle:status')
  .description('Show Merkle anchoring status and metrics')
  .action(async () => {
    if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
      printWarning('Merkle anchoring is DISABLED. Set MERKLE_ANCHORING_ENABLED=true to enable.');
      return;
    }
    const merkle = await import('./services/merkle/index.js');
    const metrics = merkle.getMetrics();
    printHeader('Merkle Anchoring Status');
    console.log(chalk.green('  ENABLED'));
    console.log(`  Certificate packages:  ${metrics.totalCertificatePackages}`);
    console.log(`  Anchor batches:        ${metrics.totalAnchorBatches}`);
    console.log(`    Open:                ${metrics.openBatches}`);
    console.log(`    Anchored:            ${metrics.anchoredBatches}`);
    console.log(`    Failed:              ${metrics.failedBatches}`);
    console.log(`  Inclusion proofs:      ${metrics.totalInclusionProofs}`);
    console.log(`  Avg certs/batch:       ${metrics.avgCertificatesPerBatch}`);
  });

program
  .command('merkle:batches')
  .description('List all Merkle anchor batches')
  .action(async () => {
    if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
      printWarning('Merkle anchoring is DISABLED.');
      return;
    }
    const merkle = await import('./services/merkle/index.js');
    const batches = merkle.getAllAnchorBatches();
    if (batches.length === 0) {
      printInfo('No Merkle anchor batches found.');
      return;
    }
    const table = new Table({
      head: [chalk.cyan('Batch ID'), chalk.cyan('Scope'), chalk.cyan('Leaves'), chalk.cyan('Status'), chalk.cyan('Root')]
    });
    batches.forEach(b => {
      table.push([
        b.batchId.substring(0, 12) + '...',
        `${b.scopeType}:${b.scopeId.substring(0, 12)}`,
        b.leafCount,
        b.status,
        b.merkleRoot ? b.merkleRoot.substring(0, 16) + '...' : '-'
      ]);
    });
    console.log(table.toString());
  });

program
  .command('merkle:close <batchId>')
  .description('Close a Merkle anchor batch and compute root')
  .action(async (batchId) => {
    if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
      printWarning('Merkle anchoring is DISABLED.');
      return;
    }
    try {
      const merkle = await import('./services/merkle/index.js');
      const result = merkle.closeBatch(batchId);
      printSuccess(`Batch closed: ${result.anchorBatch.batchId}`);
      printInfo(`Merkle root: ${result.anchorBatch.merkleRoot}`);
      printInfo(`Leaf count: ${result.anchorBatch.leafCount}`);
      printInfo(`Proofs generated: ${result.proofCount}`);
    } catch (error) {
      printError(error.message);
    }
  });

program
  .command('merkle:anchor')
  .description('Anchor all closed Merkle batches on-chain')
  .action(async () => {
    if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
      printWarning('Merkle anchoring is DISABLED.');
      return;
    }
    try {
      const merkle = await import('./services/merkle/index.js');
      const results = await merkle.processUnanchoredBatches();
      if (results.length === 0) {
        printInfo('No closed batches to anchor.');
        return;
      }
      results.forEach(r => {
        if (r.success) {
          printSuccess(`Batch ${r.batchId}: anchored (tx ${r.txHash?.substring(0, 16)}...)`);
        } else {
          printError(`Batch ${r.batchId}: FAILED - ${r.error}`);
        }
      });
    } catch (error) {
      printError(error.message);
    }
  });

program
  .command('merkle:verify <certificateId>')
  .description('Verify a certificate against its Merkle anchor')
  .action(async (certificateId) => {
    if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
      printWarning('Merkle anchoring is DISABLED.');
      return;
    }
    try {
      const merkle = await import('./services/merkle/index.js');
      const result = await merkle.verifyCertificate({ certificateId });
      printHeader(`Verification: ${certificateId.substring(0, 16)}...`);
      
      const verdictColor = result.verdict === 'VERIFIED' ? 'green' :
                           result.verdict === 'PROOF_VALID_NOT_ANCHORED' ? 'yellow' : 'red';
      console.log(`  Verdict:          ${chalk[verdictColor](result.verdict)}`);
      console.log(`  Hash match:       ${result.canonicalHashMatch === null ? 'n/a' : result.canonicalHashMatch}`);
      console.log(`  Proof valid:      ${result.proofValid}`);
      console.log(`  On-chain anchor:  ${result.onChainAnchorPresent}`);
      if (result.anchorTxHash) {
        console.log(`  TX hash:          ${result.anchorTxHash.substring(0, 24)}...`);
      }
      if (result.details.length > 0) {
        console.log('\n  Details:');
        result.details.forEach(d => console.log(`    - ${d}`));
      }
    } catch (error) {
      printError(error.message);
    }
  });

program
  .command('merkle:proof <certificateId>')
  .description('Export verification package for external verifier')
  .action(async (certificateId) => {
    if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
      printWarning('Merkle anchoring is DISABLED.');
      return;
    }
    const merkle = await import('./services/merkle/index.js');
    const pkg = merkle.exportVerificationPackage(certificateId);
    if (!pkg) {
      printError('Certificate or proof not found');
      return;
    }
    console.log(JSON.stringify(pkg, null, 2));
  });

program
  .command('merkle:verify-file <proofFile>')
  .description('Verify a certificate from an exported proof JSON file')
  .option('--rpc <url>', 'RPC URL for on-chain verification')
  .action(async (proofFile, options) => {
    try {
      const fs = await import('fs');
      const data = JSON.parse(fs.readFileSync(proofFile, 'utf-8'));
      const merkle = await import('./services/merkle/index.js');

      // Re-parse canonical JSON to get the certificate payload
      const certPayload = JSON.parse(data.certificatePackage.canonicalJson);

      const result = merkle.verifyStandalone({
        certificatePayload: certPayload.certificatePayload,
        certificateId: data.certificatePackage.certificateId,
        docHashList: certPayload.docHashList || [],
        schemaVersion: certPayload.schemaVersion || '1.0.0',
        issuerKeyId: certPayload.issuerKeyId || '',
        proof: data.inclusionProof,
        merkleRoot: data.batchMetadata.merkleRoot,
      });

      printHeader('Standalone Verification');
      const verdictColor = result.verdict === 'VERIFIED' ? 'green' : 'red';
      console.log(`  Verdict:       ${chalk[verdictColor](result.verdict)}`);
      console.log(`  Hash match:    ${result.canonicalHashMatch}`);
      console.log(`  Proof valid:   ${result.proofValid}`);
      if (data.anchor?.txHash) {
        console.log(`  Anchor TX:     ${data.anchor.txHash.substring(0, 24)}...`);
      }
    } catch (error) {
      printError(error.message);
    }
  });

program.parse();
