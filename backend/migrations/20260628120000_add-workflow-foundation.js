/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  // 1. Add stale_suppressed flag to cards
  pgm.addColumn('cards', {
    stale_suppressed: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });

  // 2. Create workflow_rule_triggers table
  pgm.createTable('workflow_rule_triggers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    rule_id: {
      type: 'varchar',
      notNull: true,
    },
    board_id: {
      type: 'uuid',
      notNull: true,
      references: '"boards"',
      onDelete: 'CASCADE',
    },
    card_id: {
      type: 'uuid',
      references: '"cards"',
      onDelete: 'SET NULL',
    },
    triggered_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    trigger_status: {
      type: 'varchar',
      notNull: true,
    },
    trigger_error: {
      type: 'text',
    },
  });

  pgm.addConstraint(
    'workflow_rule_triggers',
    'workflow_rule_triggers_trigger_status_check',
    "CHECK (trigger_status IN ('success', 'failed'))",
  );

  // 3. Create workflow_action_deliveries table
  pgm.createTable('workflow_action_deliveries', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    trigger_id: {
      type: 'uuid',
      notNull: true,
      references: '"workflow_rule_triggers"',
      onDelete: 'CASCADE',
    },
    attempt: {
      type: 'int',
      notNull: true,
    },
    attempted_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    delivery_status: {
      type: 'varchar',
      notNull: true,
    },
    delivery_error: {
      type: 'text',
    },
  });

  pgm.addConstraint(
    'workflow_action_deliveries',
    'workflow_action_deliveries_delivery_status_check',
    "CHECK (delivery_status IN ('pending', 'success', 'failed'))",
  );

  // 4. Insert Stale column at position 3 for all existing boards
  pgm.sql(`
    INSERT INTO columns (id, board_id, name, position)
    SELECT gen_random_uuid(), id, 'Stale', 3 FROM boards
  `);

  // 5. Update Done column to position 4 for all existing boards
  pgm.sql(`UPDATE columns SET position = 4 WHERE name = 'Done'`);
};

exports.down = (pgm) => {
  // Reverse in opposite order

  // 5. Restore Done to position 3
  pgm.sql(`UPDATE columns SET position = 3 WHERE name = 'Done'`);

  // 4. Remove Stale columns inserted by migration
  pgm.sql(`DELETE FROM columns WHERE name = 'Stale'`);

  // 3. Drop workflow_action_deliveries
  pgm.dropTable('workflow_action_deliveries');

  // 2. Drop workflow_rule_triggers
  pgm.dropTable('workflow_rule_triggers');

  // 1. Remove stale_suppressed from cards
  pgm.dropColumn('cards', 'stale_suppressed');
};
