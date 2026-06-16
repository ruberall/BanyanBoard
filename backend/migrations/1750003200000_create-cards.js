/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.createTable('cards', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    column_id: {
      type: 'uuid',
      notNull: true,
      references: '"columns"',
      onDelete: 'CASCADE',
    },
    title: { type: 'varchar(255)', notNull: true },
    description: { type: 'text' },
    due_date: { type: 'timestamptz' },
    labels: { type: 'text[]' },
    position: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('cards');
};
