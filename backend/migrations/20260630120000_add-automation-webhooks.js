/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  // Table 1: automation_rules
  pgm.createTable('automation_rules', {
    id:           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    board_id:     { type: 'uuid', notNull: true, references: '"boards"', onDelete: 'CASCADE' },
    trigger_type: { type: 'varchar', notNull: true },
    webhook_url:  { type: 'text', notNull: true },
    enabled:      { type: 'boolean', notNull: true, default: true },
    created_at:   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('automation_rules', 'automation_rules_trigger_type_check',
    "CHECK (trigger_type IN ('card.moved.done'))");
  pgm.createIndex('automation_rules', ['board_id', 'trigger_type'],
    { where: 'enabled = true', name: 'automation_rules_board_trigger_enabled_idx' });

  // Table 2: trigger_executions
  pgm.createTable('trigger_executions', {
    id:                 { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    automation_rule_id: { type: 'uuid', notNull: true, references: '"automation_rules"', onDelete: 'CASCADE' },
    board_id:           { type: 'uuid', notNull: true, references: '"boards"', onDelete: 'CASCADE' },
    card_id:            { type: 'uuid', references: '"cards"', onDelete: 'SET NULL' },
    occurred_at:        { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('trigger_executions', ['board_id', 'occurred_at']);

  // Table 3: webhook_deliveries
  pgm.createTable('webhook_deliveries', {
    id:                   { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    trigger_execution_id: { type: 'uuid', notNull: true, references: '"trigger_executions"', onDelete: 'CASCADE' },
    automation_rule_id:   { type: 'uuid', notNull: true, references: '"automation_rules"', onDelete: 'CASCADE' },
    board_id:             { type: 'uuid', notNull: true, references: '"boards"', onDelete: 'CASCADE' },
    attempt_count:        { type: 'int', notNull: true, default: 0 },
    status:               { type: 'varchar', notNull: true, default: 'pending' },
    http_response_code:   { type: 'int' },
    error:                { type: 'jsonb' },
    created_at:           { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:           { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('webhook_deliveries', 'webhook_deliveries_status_check',
    "CHECK (status IN ('pending', 'delivered', 'failed', 'exhausted'))");
  pgm.createIndex('webhook_deliveries', ['board_id', 'created_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('webhook_deliveries');
  pgm.dropTable('trigger_executions');
  pgm.dropTable('automation_rules');
};
