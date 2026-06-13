/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.createTable('schema_info', {
    id: { type: 'serial', primaryKey: true },
    key: { type: 'varchar(255)', notNull: true, unique: true },
    value: { type: 'text', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
  pgm.sql("INSERT INTO schema_info (key, value) VALUES ('version', '0.1.0')");
};

exports.down = (pgm) => {
  pgm.dropTable('schema_info');
};
