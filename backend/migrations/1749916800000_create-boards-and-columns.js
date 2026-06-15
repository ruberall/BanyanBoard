/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.createTable('boards', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('columns', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    board_id: {
      type: 'uuid',
      notNull: true,
      references: '"boards"',
      onDelete: 'CASCADE',
    },
    name: { type: 'varchar(255)', notNull: true },
    position: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('columns');
  pgm.dropTable('boards');
};
