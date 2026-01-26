/**
 * Gold Provenance - Main Entry Point
 */

import { startServer } from './api.js';

console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   GOLD PROVENANCE & CHAIN-OF-CUSTODY PROTOTYPE                    ║
║   Version 0.1.0 - Sprint 1                                        ║
║                                                                   ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║   Commands:                                                       ║
║     npm run demo     - Run interactive demonstration              ║
║     npm run api      - Start REST API server                      ║
║     node src/cli.js  - Use command-line interface                 ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`);

// Start the API server by default
startServer();
