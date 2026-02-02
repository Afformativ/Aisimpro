/**
 * Database Selector
 * Chooses the appropriate database implementation based on environment
 */

const dbType = process.env.DB_TYPE || 'file'; // 'mongodb' | 'file' | 'memory'

let db;

if (dbType === 'mongodb') {
  // Use MongoDB
  db = (await import('./mongodb-database.js')).default;
  console.log('Using MongoDB database');
} else if (dbType === 'file') {
  // Use file-based persistence
  db = (await import('./persistent-database.js')).default;
  console.log('Using file-based persistent database');
} else {
  // Use in-memory
  db = (await import('./database.js')).default;
  console.log('Using in-memory database');
}

export default db;
