/**
 * Database Schema Viewer
 * Shows the complete database schema, relationships, and data flow
 */

import database from '../lib/database.js';

async function showSchema() {
  console.log('Loading database schema...\n');
  
  // Print the schema in a formatted way
  await database.printDatabaseSchema();
  
  // Also get the schema object for programmatic access
  const schema = await database.getDatabaseSchema();
  
  console.log('═'.repeat(64));
  console.log('📊 SCHEMA OBJECT STRUCTURE:\n');
  console.log('You can access the schema programmatically:');
  console.log('   const schema = await database.getDatabaseSchema();\n');
  console.log('Available properties:');
  console.log('   • schema.storageMode        - Current storage mode');
  console.log('   • schema.connected          - Connection status');
  console.log('   • schema.tables             - Table definitions');
  console.log('   • schema.relationships      - Table relationships');
  console.log('   • schema.jsonStructure      - JSON file structure');
  console.log('   • schema.dataFlow           - Data flow information');
  console.log('═'.repeat(64));
  console.log('\n✅ Schema information displayed successfully!\n');
}

showSchema().catch(console.error);
