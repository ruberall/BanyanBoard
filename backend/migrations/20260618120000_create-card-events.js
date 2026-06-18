/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.createTable('card_events', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    board_id: {
      type: 'uuid',
      notNull: true,
      references: '"boards"',
      onDelete: 'CASCADE',
    },
    card_id: {
      type: 'uuid',
      notNull: true,
      references: '"cards"',
      onDelete: 'CASCADE',
    },
    actor_id: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
    },
    event_type: {
      type: 'varchar(64)',
      notNull: true,
    },
    from_column_id: {
      type: 'uuid',
      references: '"columns"',
      onDelete: 'SET NULL',
    },
    to_column_id: {
      type: 'uuid',
      references: '"columns"',
      onDelete: 'SET NULL',
    },
    payload: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{}'::jsonb"),
    },
    occurred_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createIndex('card_events', ['board_id', 'occurred_at'], {
    name: 'idx_card_events_board_occurred_at',
    order: { occurred_at: 'DESC' },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('card_events');
};
