exports.up = (pgm) => {
  pgm.sql('ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)');
  pgm.sql('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)');
  pgm.createTable('messages', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    message: {
      type: 'varchar(255)',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    recipient_user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('messages');
  pgm.sql('ALTER TABLE users DROP COLUMN IF EXISTS last_name');
  pgm.sql('ALTER TABLE users DROP COLUMN IF EXISTS first_name');
};
