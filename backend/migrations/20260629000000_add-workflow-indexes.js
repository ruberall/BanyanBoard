/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.createIndex('cards', ['column_id', 'created_at', 'stale_suppressed']);
};

exports.down = (pgm) => {
  pgm.dropIndex('cards', ['column_id', 'created_at', 'stale_suppressed']);
};
